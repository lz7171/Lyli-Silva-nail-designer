"use strict";
// Testes automáticos com banco falso (sem internet). Rode: npm test
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// ---- banco falso ----
const { FakeRedis, store, listas } = require("./fake-redis");
require.cache[require.resolve("@upstash/redis")] = { exports: { Redis: FakeRedis } };
process.env.UPSTASH_REDIS_REST_URL = "https://fake"; process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
process.env.ADMIN_PASSWORD = "senha-teste-123"; process.env.WAPITO_API_TOKEN = "token-falso";

const enviadas = [];
global.fetch = async (url, o) => { enviadas.push({ url, o }); return { ok: true, status: 200, text: async () => '{"ok":true}' }; };

const call = async (mod, { method = "GET", query = {}, body, headers = {} } = {}) => {
  const res = { h: {}, code: 200, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(j) { this.body = j; return this; }, send(s) { this.body = s; return this; }, end() { return this; } };
  await require(mod)({ method, query, body, headers: { host: "x.com", ...headers } }, res);
  return res;
};
const adm = { "x-admin-pass": "senha-teste-123" };
const C = require("../lib/core"), S = require("../lib/site");
let n = 0; const ok = (nome) => console.log("  ✔", nome, ++n && "");

(async () => {
  // 1. Página inicial intacta
  const orig = fs.readFileSync(path.join(__dirname, "../site/index.html"), "utf8");
  let r = await call("../api/site");
  assert.strictEqual(r.body, orig); ok("home idêntica ao original sem edições");

  // 2. Admin: segurança
  r = await call("../api/admin"); assert.strictEqual(r.code, 401); ok("painel exige senha");
  r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.code, 200); assert.ok(r.body.cfg && r.body.site); ok("painel abre com a senha");
  const sv = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
  r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.code, 503); assert.strictEqual(r.body.code, "sem_senha"); process.env.ADMIN_PASSWORD = sv; ok("sem ADMIN_PASSWORD o painel trava (sem senha padrão)");

  // 3. Agendamento público continua igual
  const hoje = C.agoraSP().date; let dia = C.somarDias(hoje, 2); while (![2, 3, 4, 5, 6].includes(C.meioDia(dia).getUTCDay()) || dia.slice(5, 7) === "12") dia = C.somarDias(dia, 1);
  r = await call("../api/agenda", { query: { date: dia } }); assert.deepStrictEqual(r.body.times, ["09:30", "14:30", "17:00"]); const tk = r.body.tk;
  ok("horários públicos");
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Maria Silva", phone: "21987654321", tk } });
  assert.strictEqual(r.code, 400); ok("token novo demais é recusado (anti-robô)");
  const antigo = String(Date.now() - 5000) + "." + require("crypto").createHmac("sha256", "lyli|fake|" + process.env.ADMIN_PASSWORD).update(String(Date.now() - 5000)).digest("hex").slice(0, 24);
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Maria Silva", phone: "21987654321", tk: antigo } });
  assert.strictEqual(r.code, 200); ok("cliente agenda pelo site");
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Outra Pessoa", phone: "21977776666", tk: antigo } });
  assert.strictEqual(r.code, 409); ok("horário ocupado não duplica");

  // 4. Painel: agenda, bloqueio, período, config
  r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.body.agendamentos.length, 1); assert.strictEqual(r.body.agendamentos[0].phone, "21987654321"); ok("painel lista agendamento com telefone");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "reservar", date: dia, time: "09:30", name: "Ana", phone: "21 91234-5678" } }); assert.strictEqual(r.code, 200); ok("reserva manual com WhatsApp");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "bloquearPeriodo", de: C.somarDias(hoje, 20), ate: C.somarDias(hoje, 24) } }); assert.strictEqual(r.body.total, 5); ok("bloquear período");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: { times: ["10h", "15:00"], dias: [1, 2], janela: 30, wa: "21 99999-1111", lembrete: { quando: "mesmo_dia", msg: "Oi {nome} {data} {hora}" } } } });
  assert.deepStrictEqual(r.body.cfg.times, ["10:00", "15:00"]); assert.strictEqual(r.body.cfg.wa, "5521999991111"); ok("salvar configuração");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "naoExiste" } }); assert.strictEqual(r.code, 400);
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "constructor" } }); assert.strictEqual(r.code, 400); ok("ações desconhecidas são recusadas");
  await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: {} } }); // volta ao padrão

  // 5. Fotos + site
  const png = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(50)]).toString("base64");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "subirFoto", dataUrl: png, nome: "unha 1" } }); assert.strictEqual(r.code, 200); const id = r.body.id;
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "subirFoto", dataUrl: "data:image/png;base64,AAAA" } }); assert.strictEqual(r.code, 400); ok("foto falsa é recusada");
  r = await call("../api/media", { query: { id } }); assert.strictEqual(r.code, 200); assert.ok(Buffer.isBuffer(r.body)); ok("foto é entregue");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarSite", site: {
    titulo: "Lyli <Nails>", rodape: "© Lyli", cores: { bg: "#ffffff", ink: "zzz" }, logo: id,
    sobre: { ativo: true, titulo: "Sobre", texto: "Oi <b>gente</b>" },
    servicos: { ativo: true, itens: [{ nome: "Gel", preco: "R$ 90", desc: "Fica lindo" }] },
    galeria: { ativo: true, posicao: "topo", fotos: [{ id, legenda: "Linda" }] },
    infoExtra: [{ rotulo: "Instagram", texto: "@lyli", link: "https://instagram.com/lyli" }] } } });
  assert.strictEqual(r.code, 200);
  r = await call("../api/site"); const h = r.body;
  assert.ok(h.includes("<title>Lyli &lt;Nails&gt;</title>") && h.includes("<footer>© Lyli</footer>") && h.includes("--bg:#ffffff") && !h.includes("--ink:zzz"));
  assert.ok(h.includes(`/api/media?id=${id}`) && h.includes("Oi &lt;b&gt;gente") && h.includes("R$ 90") && h.includes("@lyli")); ok("edições aparecem na home (e HTML é escapado)");
  assert.ok(h.includes('id="enviar"') && h.includes("async function carregarHorarios")); ok("fluxo de agendamento da home preservado");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "removerFoto", id } });
  assert.deepStrictEqual(r.body.site.galeria.fotos, []); assert.strictEqual(r.body.site.logo, null); ok("apagar foto limpa o site");

  // 6. Calendário sincronizado (opcional)
  await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: { syncCalendario: true, dias: [1], janela: 14, wa: "5521968513808" } } });
  r = await call("../api/site"); assert.ok(r.body.includes("const JANELA_DIAS = 14;") && r.body.includes("DIAS_OK.has")); ok("calendário obedece ao painel quando ligado");
  await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: {} } });

  // 7. Lembretes
  const L = require("../lib/lembretes"); const cfg = await C.carregarCfg(new FakeRedis());
  const msg = L.montarMensagem(cfg, { name: "Maria", date: "2026-10-08", time: "14:30" });
  assert.ok(msg.includes("📅 Data: 08/10/2026") && msg.includes("⏰ Horário: 14:30") && msg.startsWith("Oi, linda! 💕")); ok("mensagem do lembrete");
  const amanha = C.somarDias(hoje, 1); let alvo = amanha; while (![2, 3, 4, 5, 6].includes(C.meioDia(alvo).getUTCDay()) || alvo.slice(5, 7) === "12") alvo = C.somarDias(alvo, 1);
  const red = new FakeRedis(); await red.set(C.K.agenda(amanha, "09:30"), { name: "Bia", phone: "21988887777", at: 1 }); await red.set(C.K.agenda(amanha, "14:30"), { name: "Sem Fone", at: 1 });
  enviadas.length = 0; let res = await L.processarData(red, cfg, amanha, {});
  assert.strictEqual(res.enviados, 1); assert.strictEqual(res.semTelefone, 1); assert.strictEqual(enviadas.length, 1);
  assert.strictEqual(JSON.parse(enviadas[0].o.body).to, "5521988887777"); assert.strictEqual(enviadas[0].o.headers.Authorization, "Bearer token-falso"); ok("envia 1 lembrete e pula quem não tem WhatsApp");
  res = await L.processarData(red, cfg, amanha, {}); assert.strictEqual(res.enviados, 0); assert.strictEqual(res.jaEnviados, 1); assert.strictEqual(enviadas.length, 1); ok("não envia lembrete duplicado");
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "bad token" });
  await red.del(C.K.lembrete(amanha, "09:30")); res = await L.processarData(red, cfg, amanha, {}); assert.strictEqual(res.falhas, 1);
  assert.ok(!(await red.get(C.K.lembrete(amanha, "09:30")))); ok("falha na Wapito não marca como enviado (tenta de novo depois)");
  global.fetch = async (u, o) => { enviadas.push({ url: u, o }); return { ok: true, status: 200, text: async () => "{}" }; };
  r = await call("../api/lembretes"); assert.strictEqual(r.code, 401); ok("cron sem autorização é recusado");
  process.env.CRON_SECRET = "segredo"; r = await call("../api/lembretes", { headers: { authorization: "Bearer segredo" } }); assert.strictEqual(r.code, 200); ok("cron autorizado roda");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "testarWhatsApp", telefone: "21988887777" } }); assert.ok(r.body.ok); ok("botão de teste do WhatsApp");

  console.log(`\n${n} verificações passaram.`);
})().catch((e) => { console.error("\n✖ FALHOU:", e); process.exit(1); });
