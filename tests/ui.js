"use strict";
// Teste de tela do painel: abre o /admin num navegador simulado ligado ao backend de verdade (com banco falso).
const assert = require("assert");
const path = require("path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const { FakeRedis } = require("./fake-redis");

require.cache[require.resolve("@upstash/redis")] = { exports: { Redis: FakeRedis } };
const { setar } = require("./ambiente-teste");
[["UPSTASH_REDIS_REST_URL", "https://fake"], ["UPSTASH_REDIS_REST_TOKEN", "fake"], ["ADMIN_PASSWORD", "senha-teste-123"], ["WAPITO_API_TOKEN", "t"]].forEach(([k, v]) => setar(k, v));
const adminApi = require("../api/admin");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const js = (await esbuild.build({ entryPoints: [path.join(__dirname, "../admin/js/main.js")], bundle: true, write: false, format: "iife" })).outputFiles[0].text;
  const html = require("fs").readFileSync(path.join(__dirname, "../admin/index.html"), "utf8").replace(/<script type="module"[^>]*><\/script>/, "").replace(/<link[^>]*>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://x.com/admin", pretendToBeVisual: true });
  const w = dom.window, erros = [];
  w.addEventListener("error", (e) => erros.push(e.message));
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  w.fetch = async (url, o) => {
    const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(j) { this.body = j; return this; } };
    let body = o.body; try { body = JSON.parse(o.body); } catch (e) {}
    await adminApi({ method: o.method || "GET", headers: Object.fromEntries(Object.entries(o.headers).map(([k, v]) => [k.toLowerCase(), v])), body, query: {} }, res);
    return { ok: res.code < 400, status: res.code, json: async () => res.body };
  };
  w.eval(js);
  const $ = (s) => w.document.querySelector(s), click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const dig = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };

  // login errado e certo
  dig($("#senha"), "errada"); click($("#entrar")); await sleep(50);
  assert.strictEqual($("#erroLogin").textContent, "Senha incorreta."); console.log("  ✔ senha errada é recusada");
  dig($("#senha"), "senha-teste-123"); click($("#entrar")); await sleep(100);
  assert.ok(!$("#painel").hidden); console.log("  ✔ login abre o painel");
  // pedido da cliente: ao entrar, só a agenda; o resto fica num menu escondido (☰)
  assert.ok(!$("#aba-agenda").hidden && $("#aba-horarios").hidden && $("#aba-site").hidden && $("#aba-lembretes").hidden);
  assert.ok($("#menu").hidden && !$("#abas")); console.log("  ✔ ao entrar aparece só a Agenda; as outras seções ficam no menu escondido");
  click($("#menuBtn")); assert.ok(!$("#menu").hidden); click($("#menuBtn")); assert.ok($("#menu").hidden);
  click($("#menuBtn")); click(w.document.body); assert.ok($("#menu").hidden); console.log("  ✔ menu ☰ abre e fecha (também tocando fora)");

  // agenda manual
  const hoje = JSON.parse(JSON.stringify(require("../lib/core").agoraSP())).date;
  let d = require("../lib/core").somarDias(hoje, 3); while (![2, 3, 4, 5, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()) || d.slice(5, 7) === "12") d = require("../lib/core").somarDias(d, 1);
  const ag = $("#aba-agenda"); const ins = ag.querySelectorAll("input");
  const dataIn = ag.querySelector('input[type=date]'); dig(dataIn, d);
  const nome = [...ag.querySelectorAll('input[type=text]')].find((i) => i.placeholder === "Nome"); dig(nome, "Cliente Teste");
  dig(ag.querySelector('input[type=tel]'), "21 98888-7777");
  click([...ag.querySelectorAll("button")].find((b) => b.textContent === "Adicionar")); await sleep(150);
  assert.ok($("#aba-agenda").textContent.includes("Cliente Teste") && $("#aba-agenda").textContent.includes("(21) 98888-7777")); console.log("  ✔ agendamento manual aparece na lista");

  // aba horários: adicionar período e salvar
  click($("#menuBtn")); click($('[data-aba="horarios"]')); assert.ok(!$("#aba-horarios").hidden && $("#aba-agenda").hidden && $("#menu").hidden);
  assert.strictEqual($("#abaAtual").textContent, "Horários e dias"); console.log("  ✔ menu leva para Horários e dias");
  { // reclamação: "fechei um horário e não consegui abrir / colocar horário"
    const hz = $("#aba-horarios"), chips = () => [...hz.querySelector(".chips").querySelectorAll(".chip")].map((c) => c.firstChild.textContent);
    assert.deepStrictEqual(chips(), ["9h30", "14h30", "17h"]);
    click(hz.querySelector('.chip button[aria-label="Remover 14h30"]')); await sleep(10);
    assert.deepStrictEqual(chips(), ["9h30", "17h"]);
    assert.ok(hz.querySelector(".rodapeSalvar").classList.contains("pendente") && $('#menu [data-aba="horarios"]').classList.contains("pendente")); console.log("  ✔ tirar um horário mostra o aviso \"alterações não salvas\"");
    const sel = hz.querySelector(".chips select.addHora"); assert.ok([...sel.options].some((o) => o.value === "14:30"));
    sel.value = "14:30"; sel.dispatchEvent(new w.Event("change", { bubbles: true })); await sleep(10);
    assert.deepStrictEqual(chips(), ["9h30", "14h30", "17h"]); assert.ok($("#toast").textContent.includes("Salvar"));
    assert.ok(!hz.querySelector(".rodapeSalvar").classList.contains("pendente")); console.log("  ✔ colocar o horário de volta funciona escolhendo na lista (e o aviso some: voltou ao salvo)");
    w.prompt = () => "10h40"; const sel2 = hz.querySelector(".chips select.addHora"); sel2.value = "outro"; sel2.dispatchEvent(new w.Event("change", { bubbles: true })); await sleep(10);
    assert.deepStrictEqual(chips(), ["9h30", "10h40", "14h30", "17h"]); console.log("  ✔ \"Outro horário…\" aceita horário digitado (10h40)");
    click([...hz.querySelectorAll("button")].find((b) => b.textContent === "Salvar alterações")); await sleep(150);
    const salvo = await FakeRedis.prototype.get.call(new FakeRedis(), "lyli:config");
    assert.deepStrictEqual(salvo.times, ["09:30", "10:40", "14:30", "17:00"]); assert.ok(!$("#aba-horarios .rodapeSalvar").classList.contains("pendente"));
    console.log("  ✔ salvar grava os horários e tira o aviso");
    // volta ao normal para os próximos testes
    click($('#aba-horarios .chip button[aria-label="Remover 10h40"]')); click([...$("#aba-horarios").querySelectorAll("button")].find((b) => b.textContent === "Salvar alterações")); await sleep(150);
  }
  assert.ok($("#aba-horarios").textContent.includes("Dezembro")); console.log("  ✔ aba Horários mostra o período de Dezembro");
  click([...$("#aba-horarios").querySelectorAll("button")].find((b) => b.textContent === "+ Novo período"));
  click([...$("#aba-horarios").querySelectorAll("button")].find((b) => b.textContent === "Salvar alterações")); await sleep(150);
  assert.ok(!erros.length, erros.join(";")); console.log("  ✔ salvar configuração sem erros");

  // aba site: ligar "Sobre", escrever, salvar
  click($("#menuBtn")); click($('[data-aba="site"]'));
  const site = $("#aba-site"); const ta = site.querySelector("textarea"); dig(ta, "Sou a Lyli!");
  const chk = [...site.querySelectorAll("label.marcar")].find((l) => l.textContent.includes("Mostrar")); chk.querySelector("input").checked = true; chk.querySelector("input").dispatchEvent(new w.Event("change"));
  click([...site.querySelectorAll("button")].find((b) => b.textContent.startsWith("Salvar e publicar"))); await sleep(150);
  const saved = await FakeRedis.prototype.get.call(new FakeRedis(), "lyli:site");
  assert.ok(saved && saved.sobre.ativo && saved.sobre.texto === "Sou a Lyli!"); console.log("  ✔ texto do site é salvo");

  // lembretes
  click($("#menuBtn")); click($('[data-aba="lembretes"]'));
  assert.ok($("#aba-lembretes").textContent.includes("📅 Data: 08/10/2026")); console.log("  ✔ prévia da mensagem do lembrete");
  const tl = $("#aba-lembretes").textContent;
  assert.ok(tl.includes("UM lembrete só") && tl.includes("Não é uma mensagem por dia") && !tl.includes("Todo dia de manhã") && tl.includes("recebe a mensagem na quarta"));
  const qd = [...$("#aba-lembretes").querySelectorAll("select")][0]; qd.value = "mesmo_dia"; qd.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.ok($("#aba-lembretes").textContent.includes("na própria quinta")); console.log("  ✔ texto dos lembretes explica que é 1 mensagem por cliente (com exemplo)");
  qd.value = "dia_anterior"; qd.dispatchEvent(new w.Event("change", { bubbles: true }));

  // fechar um horário de um dia e reabrir
  click($("#menuBtn")); click($('[data-aba="agenda"]')); const ag2 = $("#aba-agenda");
  const sec = [...ag2.querySelectorAll("section")].find((x) => x.querySelector("h2").textContent === "Fechar dias e horários");
  const dIn = sec.querySelector("input[type=date]"); dig(dIn, d); const hs = sec.querySelector("select"); hs.value = "17:00";
  click([...sec.querySelectorAll("button")].find((b) => b.textContent === "Fechar horário")); await sleep(150);
  const fech = [...$("#aba-agenda").querySelectorAll(".linha.fechado")]; assert.strictEqual(fech.length, 1); assert.ok(fech[0].textContent.includes("Horário fechado"));
  console.log("  ✔ fechar um horário: aparece na agenda como \"Horário fechado\"");
  click([...fech[0].querySelectorAll("button")].find((b) => b.textContent === "Reabrir")); await sleep(150);
  assert.strictEqual($("#aba-agenda").querySelectorAll(".linha.fechado").length, 0); console.log("  ✔ \"Reabrir\" abre o horário de novo");
  assert.ok(!erros.length, erros.join(";"));
  console.log("\nTela do painel OK.");
})().catch((e) => { console.error("\n✖ FALHOU:", e); process.exit(1); });
