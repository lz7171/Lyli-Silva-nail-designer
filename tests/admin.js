"use strict";
// Testa CADA função do painel (/api/admin) + as correções da revisão. Rode: node tests/admin.js
const assert = require("assert");
const { FakeRedis, store } = require("./fake-redis");
require.cache[require.resolve("@upstash/redis")] = { exports: { Redis: FakeRedis } };
const { setar } = require("./ambiente-teste");
setar("UPSTASH_REDIS_REST_URL", "https://fake"); setar("UPSTASH_REDIS_REST_TOKEN", "fake");
setar("ADMIN_PASSWORD", "senha-forte-1234"); setar("WAPITO_API_TOKEN", "tk"); setar("CRON_SECRET", "segredo-cron");

const enviadas = [];
global.fetch = async (url, o) => { enviadas.push({ url, body: JSON.parse(o.body) }); return { ok: true, status: 200, text: async () => '{"ok":true}' }; };
const call = async (mod, { method = "GET", query = {}, body, headers = {} } = {}) => {
  const res = { h: {}, code: 200, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(j) { this.body = j; return this; }, send(s) { this.body = s; return this; }, end() { return this; } };
  await require(mod)({ method, query, body, headers: { host: "x.com", ...headers } }, res);
  return res;
};
const adm = { "x-admin-pass": "senha-forte-1234" };
const A = (body) => call("../api/admin", { method: "POST", headers: adm, body });
const C = require("../lib/core");
let n = 0; const ok = (t) => console.log("  ✔", t, ++n && "");
const dia = (min) => { let d = C.somarDias(C.agoraSP().date, min); while (![2, 3, 4, 5, 6].includes(C.meioDia(d).getUTCDay()) || d.slice(5, 7) === "12") d = C.somarDias(d, 1); return d; };

(async () => {
  const d1 = dia(3), d2 = dia(8), d3 = dia(12);
  let r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.code, 200); ok("abrir o painel (GET) traz agenda, config, site, fotos e lembretes");
  assert.ok(r.body.diag && "cronUltimo" in r.body.diag && r.body.diag.senhaFraca === false);

  // reservar
  r = await A({ action: "reservar", date: d1, time: "14:30", name: "Ana Souza", phone: "21 98888-7777" }); assert.strictEqual(r.code, 200);
  r = await A({ action: "reservar", date: d1, time: "14:30", name: "Outra", phone: "" }); assert.strictEqual(r.code, 409);
  r = await A({ action: "reservar", date: d1, time: "09:30", name: "Bia Fixo", phone: "2133334444" }); assert.strictEqual(r.code, 200);
  r = await A({ action: "reservar", date: d1, time: "03:00", name: "X Y" }); assert.strictEqual(r.code, 400);
  r = await A({ action: "reservar", date: "2020-01-01", time: "14:30", name: "Passado" }); assert.strictEqual(r.code, 400);
  ok("reservar manual (ocupado=409, hora inexistente e data passada recusadas, fixo aceito)");

  // fechar horário / reabrir
  r = await A({ action: "fecharHorario", date: d1, time: "17:00" }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: d1 } }); assert.ok(r.body.taken.includes("17:00"));
  r = await A({ action: "cancelar", date: d1, time: "17:00" }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: d1 } }); assert.ok(!r.body.taken.includes("17:00")); ok("fechar um horário e reabrir");

  // cancelar sem e com aviso
  r = await A({ action: "reservar", date: d2, time: "14:30", name: "Carla Dias", phone: "21977776666" });
  enviadas.length = 0;
  r = await A({ action: "cancelar", date: d2, time: "14:30" }); assert.strictEqual(r.code, 200); assert.strictEqual(enviadas.length, 0); ok("cancelar sem avisar não manda WhatsApp");
  r = await A({ action: "reservar", date: d2, time: "14:30", name: "Carla Dias", phone: "21977776666" });
  enviadas.length = 0;
  r = await A({ action: "cancelar", date: d2, time: "14:30", avisar: true }); assert.strictEqual(r.body.avisado, true); assert.ok(enviadas.length >= 1);
  assert.ok(JSON.stringify(enviadas[enviadas.length - 1].body).includes("cancelar seu horário"));
  r = await call("../api/admin", { headers: adm }); assert.ok(!r.body.agendamentos.some((a) => a.name === "Carla Dias")); ok("cancelar avisando a cliente por WhatsApp");
  r = await A({ action: "reservar", date: d2, time: "09:30", name: "Dani Fixo", phone: "2133334444" });
  enviadas.length = 0; r = await A({ action: "cancelar", date: d2, time: "09:30", avisar: true });
  assert.strictEqual(r.body.avisado, false); assert.strictEqual(enviadas.length, 0); ok("telefone fixo: cancela e explica que não deu para avisar");

  // bloquear dia / período / desbloquear
  r = await A({ action: "bloquear", date: d3 }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: d3 } }); assert.ok(r.body.bloqueado);
  r = await A({ action: "desbloquear", date: d3 }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: d3 } }); assert.ok(!r.body.bloqueado); ok("fechar dia e reabrir dia");
  r = await A({ action: "bloquear", date: "2020-01-01" }); assert.strictEqual(r.code, 400);
  r = await A({ action: "bloquearPeriodo", de: d1, ate: C.somarDias(d1, 1) }); assert.strictEqual(r.code, 200); assert.ok(r.body.total === 2 && r.body.comCliente >= 2);
  r = await A({ action: "bloquearPeriodo", de: "2020-01-01", ate: "2020-01-05" }); assert.strictEqual(r.code, 400);
  await A({ action: "desbloquear", date: d1 }); await A({ action: "desbloquear", date: C.somarDias(d1, 1) }); ok("fechar período (informa quantas clientes existem) e datas passadas recusadas");

  // salvarConfig: validação clara
  const base = (await call("../api/admin", { headers: adm })).body.cfg;
  const tenta = (mud) => A({ action: "salvarConfig", cfg: { ...base, ...mud } });
  for (const [mud, trecho] of [
    [{ times: [] }, "horário padrão"], [{ dias: [] }, "dia de atendimento"], [{ janela: 0 }, "1 a 365"], [{ janela: 999 }, "1 a 365"],
    [{ regras: [{ nome: "Férias", de: "01-01", ate: "01-10", times: [], dias: [1] }] }, "Férias"],
    [{ regras: [{ nome: "Sem dia", de: "01-01", ate: "01-10", times: ["10:00"], dias: [] }] }, "Sem dia"],
    [{ regras: [{ nome: "A", de: "03-01", ate: "03-20", times: ["10:00"], dias: [1] }, { nome: "B", de: "03-15", ate: "03-31", times: ["10:00"], dias: [1] }] }, "sobrepõem"],
  ]) { r = await tenta(mud); assert.strictEqual(r.code, 400, JSON.stringify(mud)); assert.ok(r.body.error.includes(trecho), r.body.error); }
  ok("config inválida é recusada com mensagem clara (nada some em silêncio)");
  r = await tenta({ times: ["09:00", "13:00"], janela: 45, aviso: "Folga na sexta", regras: [{ nome: "Ano novo", de: "12-20", ate: "01-05", times: ["10:00"], dias: [1, 2] }] });
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.cfg.times, ["09:00", "13:00"]); assert.strictEqual(r.body.cfg.janela, 45); ok("salvar horários/dias/período que vira o ano");
  await tenta({}); // volta ao normal (base)

  // salvarSite + fotos
  const png = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 1)]).toString("base64");
  r = await A({ action: "subirFoto", dataUrl: png, nome: "unha 1" }); assert.strictEqual(r.code, 200); const id = r.body.id;
  r = await call("../api/media", { query: { id } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.h["Content-Type"], "image/png");
  r = await A({ action: "subirFoto", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }); assert.strictEqual(r.code, 400);
  r = await A({ action: "subirFoto", dataUrl: "data:image/png;base64," + Buffer.from("texto qualquer").toString("base64") }); assert.strictEqual(r.code, 400); ok("enviar foto (aceita imagem real; recusa SVG e arquivo falso)");
  r = await A({ action: "salvarSite", site: { titulo: "Lyli <b>Nails</b>", logo: id, cores: { bg: "#ffffff", ink: "#000000" }, sobre: { ativo: true, texto: "Oi <script>x</script>" }, servicos: { ativo: true, itens: [{ nome: "Gel", preco: "R$ 90" }] }, galeria: { ativo: true, fotos: [{ id, legenda: "Linda" }] }, infoExtra: [{ rotulo: "Instagram", texto: "@lyli", link: "https://instagram.com/lyli" }, { rotulo: "Mau", texto: "x", link: "javascript:alert(1)" }] } });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.site.infoExtra[1].link, "");
  r = await call("../api/site"); const html = r.body;
  assert.ok(html.includes("&lt;b&gt;Nails") && !html.includes("<script>x</script>") && html.includes(`/api/media?id=${id}`) && html.includes("Gel") && html.includes("@lyli")); ok("salvar o site: título, logo, cores, sobre, serviços, galeria, extras (tudo escapado; link perigoso removido)");
  r = await A({ action: "removerFoto", id }); assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.site.galeria.fotos, []); assert.strictEqual(r.body.site.logo, null);
  r = await call("../api/media", { query: { id } }); assert.strictEqual(r.code, 404); ok("apagar foto (sai da galeria e da logo)");

  // lembretes
  r = await A({ action: "testarWhatsApp", telefone: "21 98888-7777" }); assert.strictEqual(r.body.ok, true);
  r = await A({ action: "testarWhatsApp", telefone: "123" }); assert.strictEqual(r.code, 400); ok("testar WhatsApp");
  const amanha = C.somarDias(C.agoraSP().date, 1); let dl = amanha; // um dia com cliente (qualquer dia vale para o teste de envio)
  await A({ action: "reservar", date: dl, time: "17:00", name: "Eva Lima", phone: "21966665555" }).then((x) => assert.ok([200, 400].includes(x.code)));
  if ((await call("../api/admin", { headers: adm })).body.agendamentos.some((a) => a.date === dl && a.name === "Eva Lima")) {
    enviadas.length = 0; r = await A({ action: "enviarLembretes", date: dl }); assert.ok(r.body.resumo.enviados >= 1); assert.ok(enviadas.length >= 1);
    r = await A({ action: "enviarLembretes", date: dl }); assert.strictEqual(r.body.resumo.enviados, 0); assert.ok(r.body.resumo.jaEnviados >= 1);
    r = await A({ action: "lembrarUm", date: dl, time: "17:00" }); assert.strictEqual(r.code, 200); ok("enviar lembretes do dia / sem duplicar / lembrar uma cliente agora");
    // dia fechado: não envia
    await A({ action: "cancelar", date: dl, time: "17:00" }); await A({ action: "reservar", date: dl, time: "17:00", name: "Eva Lima", phone: "21966665555" });
    await A({ action: "bloquear", date: dl }); enviadas.length = 0;
    r = await A({ action: "enviarLembretes", date: dl }); assert.strictEqual(r.body.resumo.diaFechado, true); assert.strictEqual(enviadas.length, 0);
    ok("dia fechado: lembretes não são enviados e o painel explica"); await A({ action: "desbloquear", date: dl });
  }
  // telefone fixo não recebe lembrete
  const L = require("../lib/lembretes"), redis = C.getRedis(), cfg = await C.carregarCfg(redis);
  r = await L.enviarUm(redis, cfg, { date: d1, time: "09:30", name: "Bia Fixo", phone: "2133334444" }, false); assert.strictEqual(r.motivo, "sem_telefone"); ok("telefone fixo não recebe lembrete (e fica claro por quê)");

  // ações inválidas e segurança
  r = await A({ action: "nada" }); assert.strictEqual(r.code, 400);
  r = await call("../api/admin", { method: "POST", headers: { "x-admin-pass": "errada" }, body: { action: "bloquear", date: d1 } }); assert.strictEqual(r.code, 401); ok("sem a senha certa nada funciona");
  // cron: só com o segredo
  r = await call("../api/lembretes", { headers: { "user-agent": "vercel-cron/1.0" } }); assert.strictEqual(r.code, 401);
  r = await call("../api/lembretes", { headers: { authorization: "Bearer segredo-cron" } }); assert.strictEqual(r.code, 200);
  r = await call("../api/admin", { headers: adm }); assert.ok(r.body.diag.cronUltimo && r.body.diag.cronUltimo.ok !== undefined); ok("envio automático exige CRON_SECRET (User-Agent falso é recusado) e o painel mostra o último resultado");
  setar("CRON_SECRET"); r = await call("../api/health"); assert.ok(r.body.avisos.some((a) => a.includes("CRON_SECRET")));
  r = await call("../api/lembretes", { headers: { authorization: "Bearer " } }); assert.strictEqual(r.code, 401); setar("CRON_SECRET", "segredo-cron"); ok("sem CRON_SECRET: ninguém passa e o health avisa");
  // status não vaza erro
  const g = C.getRedis(); const orig = g.get; g.get = async () => { throw new Error("SEGREDO-https://host-interno.upstash.io"); };
  r = await call("../api/agenda", { query: { status: "1" } }); g.get = orig; assert.ok(!JSON.stringify(r.body).includes("SEGREDO")); ok("diagnóstico público não vaza detalhe do banco");
  // limite de consultas
  store.set("rl:consulta:desconhecido", "299");
  r = await call("../api/agenda", { query: { date: d1 } }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: d1 } }); assert.strictEqual(r.code, 429); ok("robô consultando sem parar é barrado (cliente normal não chega perto)");
  console.log(`\n${n} verificações do painel passaram.`);
})().catch((e) => { console.error("\n✖ FALHOU:", e); process.exit(1); });
