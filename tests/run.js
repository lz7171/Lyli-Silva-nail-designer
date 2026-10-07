"use strict";
// Testes automáticos com banco falso (sem internet). Rode: npm test
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// ---- banco falso ----
const { FakeRedis, store, listas } = require("./fake-redis");
require.cache[require.resolve("@upstash/redis")] = { exports: { Redis: FakeRedis } };
const { setar, ler } = require("./ambiente-teste");
setar("UPSTASH_REDIS_REST_URL", "https://fake"); setar("UPSTASH_REDIS_REST_TOKEN", "fake");
setar("ADMIN_PASSWORD", "senha-teste-123"); setar("WAPITO_API_TOKEN", "token-falso");

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
  const sv = ler("ADMIN_PASSWORD"); setar("ADMIN_PASSWORD");
  r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.code, 503); assert.strictEqual(r.body.code, "sem_senha"); ok("sem ADMIN_PASSWORD o painel trava (não existe senha padrão)");
  setar("ADMIN_PASSWORD", "123"); r = await call("../api/admin", { headers: { "x-admin-pass": "123" } }); assert.strictEqual(r.code, 503); ok("senha curta demais não vale");
  setar("ADMIN_PASSWORD", '  "' + sv + '"  '); r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.code, 200); ok("aspas/espaços colados na variável não atrapalham");
  setar("ADMIN_PASSWORD", sv);
  // rota de login usada pelo "gvp admin test"
  r = await call("../api/admin-login", { method: "POST", body: { email: "admin", password: sv } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.ok, true);
  r = await call("../api/admin-login", { method: "POST", body: { email: "admin", password: "senha-errada-gvp-teste" } }); assert.strictEqual(r.code, 401);
  r = await call("../api/admin-login", { method: "POST", body: JSON.stringify({ password: sv }) }); assert.strictEqual(r.code, 200);
  r = await call("../api/admin-login"); assert.strictEqual(r.code, 405); ok("/api/admin-login aceita a senha certa e recusa a errada (gvp admin test)");

  // 3. Agendamento público continua igual
  const hoje = C.agoraSP().date; let dia = C.somarDias(hoje, 2); while (![2, 3, 4, 5, 6].includes(C.meioDia(dia).getUTCDay()) || dia.slice(5, 7) === "12") dia = C.somarDias(dia, 1);
  r = await call("../api/agenda", { query: { date: dia } }); assert.deepStrictEqual(r.body.times, ["09:30", "14:30", "17:00"]); const tk = r.body.tk;
  ok("horários públicos");
  { // dias indisponíveis: horários vêm todos ocupados (nunca lista vazia, que a página mostraria como livre)
    let dz = C.somarDias(hoje, 0); while (!(dz.slice(5) >= "12-11" && dz.slice(5) <= "12-31")) dz = C.somarDias(dz, 1);
    if (C.diasEntre(hoje, dz) <= 60) {
      r = await call("../api/agenda", { query: { date: dz } }); assert.ok(r.body.restrito && r.body.times.length === 4 && r.body.taken.length === 4 && r.body.bloqueado);
    }
    let seg = C.somarDias(hoje, 1); while (C.meioDia(seg).getUTCDay() !== 1 || seg.slice(5, 7) === "12") seg = C.somarDias(seg, 1);
    r = await call("../api/agenda", { query: { date: seg } }); assert.strictEqual(r.code, 200); assert.ok(r.body.times.length && r.body.taken.length === r.body.times.length);
    r = await call("../api/agenda", { query: { date: "2026-02-30" } }); assert.strictEqual(r.code, 400);
    ok("dia restrito/sem atendimento mostra horários ocupados (não livres)");
  }
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Maria Silva", phone: "21987654321", tk } });
  assert.strictEqual(r.code, 400); ok("token novo demais é recusado (anti-robô)");
  const ts5 = String(Date.now() - 5000); // calculado uma vez só (antes eram duas e podia dar diferença de 1 ms)
  const antigo = ts5 + "." + require("crypto").createHmac("sha256", "lyli|fake|" + ler("ADMIN_PASSWORD")).update(ts5).digest("hex").slice(0, 24);
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Maria Silva", phone: "21987654321", tk: antigo } });
  assert.strictEqual(r.code, 200, JSON.stringify(r.body)); ok("cliente agenda pelo site");
  r = await call("../api/agenda", { method: "POST", body: { date: dia, time: "14:30", name: "Outra Pessoa", phone: "21977776666", tk: antigo } });
  assert.strictEqual(r.code, 409); ok("horário ocupado não duplica");

  // 4. Painel: agenda, bloqueio, período, config
  r = await call("../api/admin", { headers: adm }); assert.strictEqual(r.body.agendamentos.length, 1); assert.strictEqual(r.body.agendamentos[0].phone, "21987654321"); ok("painel lista agendamento com telefone");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "reservar", date: dia, time: "09:30", name: "Ana", phone: "21 91234-5678" } }); assert.strictEqual(r.code, 200); ok("reserva manual com WhatsApp");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "fecharHorario", date: dia, time: "17:00" } }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: dia } }); assert.ok(r.body.taken.includes("17:00")); ok("horário fechado aparece ocupado no site");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "fecharHorario", date: dia, time: "14:30" } }); assert.strictEqual(r.code, 409); ok("não fecha horário que já tem cliente");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "fecharHorario", date: dia, time: "11:11" } }); assert.strictEqual(r.code, 400); ok("não fecha horário que não existe no dia");
  r = await call("../api/admin", { headers: adm }); const fz = r.body.agendamentos.find((a) => a.time === "17:00"); assert.ok(fz && fz.fechado === true); ok("painel identifica o horário fechado");
  { const L0 = require("../lib/lembretes"); const lista = await L0.agendamentosDoDia(C.getRedis(), dia); assert.ok(!lista.some((a) => a.time === "17:00")); ok("horário fechado não entra nos lembretes"); }
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "cancelar", date: dia, time: "17:00" } }); assert.strictEqual(r.code, 200);
  r = await call("../api/agenda", { query: { date: dia } }); assert.ok(!r.body.taken.includes("17:00")); ok("reabrir libera o horário no site");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "bloquearPeriodo", de: C.somarDias(hoje, 20), ate: C.somarDias(hoje, 24) } }); assert.strictEqual(r.body.total, 5); ok("bloquear período");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: { times: ["10h", "15:00"], dias: [1, 2], janela: 30, wa: "21 99999-1111", lembrete: { quando: "mesmo_dia", msg: "Oi {nome} {data} {hora}" } } } });
  assert.deepStrictEqual(r.body.cfg.times, ["10:00", "15:00"]); assert.strictEqual(r.body.cfg.wa, "5521999991111"); ok("salvar configuração");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "naoExiste" } }); assert.strictEqual(r.code, 400);
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "constructor" } }); assert.strictEqual(r.code, 400); ok("ações desconhecidas são recusadas");
  await call("../api/admin", { method: "POST", headers: adm, body: { action: "salvarConfig", cfg: { online: false } } });
  r = await call("../api/agenda", { query: { date: dia } }); assert.ok(r.body.pausado && r.body.times.length && r.body.taken.length === r.body.times.length);
  r = await call("../api/site"); assert.ok(r.body.includes('class="x-aviso"')); ok("agendamento pausado: horários ocupados + aviso no site");
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
  setar("CRON_SECRET", "segredo"); r = await call("../api/lembretes", { headers: { authorization: "Bearer segredo" } }); assert.strictEqual(r.code, 200); ok("cron autorizado roda");
  r = await call("../api/admin", { method: "POST", headers: adm, body: { action: "testarWhatsApp", telefone: "21988887777" } }); assert.ok(r.body.ok); ok("botão de teste do WhatsApp");

  // 8. Wapito: descoberta automática do formato
  const WA = require("../lib/whatsapp");
  const chamadas = [];
  const fakeApi = (regra) => async (url, o) => { const b = JSON.parse(o.body); chamadas.push({ url, b, h: o.headers }); return regra(url, b); };
  const resp = (status, txt) => ({ ok: status < 300, status, text: async () => txt || "" });
  await red.del(WA.CHAVE_FORMATO); await new FakeRedis().del(WA.CHAVE_FORMATO); WA._esquecer();
  global.fetch = fakeApi((url, b) => url.endsWith("/v1/messages") ? resp(404, "not found")
    : url.endsWith("/v1/messages/send") ? (b.number && b.text ? resp(200, '{"id":"abc"}') : resp(422, '{"error":"campo invalido"}')) : resp(404));
  setar("WAPITO_API_URL", "https://api.wapito.com/v1/");
  let w = await WA.enviar("21988887777", "Oi");
  assert.ok(w.ok, w.detalhe); assert.strictEqual(chamadas.filter((c) => c.b.number && c.b.text).length, 1, "só UMA mensagem de verdade");
  assert.strictEqual(chamadas[0].h.Authorization, "Bearer token-falso"); ok("descobre sozinho o endereço e os campos da Wapito");
  chamadas.length = 0; WA._esquecer(); w = await WA.enviar("21988887777", "Oi de novo");
  assert.ok(w.ok); assert.strictEqual(chamadas.length, 1); assert.ok(chamadas[0].url.endsWith("/v1/messages/send")); ok("depois usa o formato guardado (1 chamada só)");
  chamadas.length = 0; global.fetch = fakeApi(() => resp(401, '{"error":"token token-falso invalido"}'));
  w = await WA.enviar("21988887777", "x"); assert.ok(!w.ok && /token/.test(w.detalhe) && !w.detalhe.includes("token-falso")); assert.strictEqual(chamadas.length, 1);
  ok("token recusado: para na hora e nunca mostra o token");
  chamadas.length = 0; global.fetch = fakeApi(() => resp(200, '{"success":false,"error":"invalid"}'));
  await red.del(WA.CHAVE_FORMATO); WA._esquecer(); w = await WA.enviar("21988887777", "x"); assert.ok(!w.ok);
  ok("resposta 200 com erro dentro não conta como enviada");
  global.fetch = async () => { throw new Error("offline"); }; w = await WA.enviar("21988887777", "x"); assert.ok(!w.ok && /Não foi possível falar/.test(w.detalhe)); ok("sem internet: avisa sem travar");
  setar("WAPITO_SEND_PATH", "/enviar"); setar("WAPITO_FIELD_PHONE", "numero"); chamadas.length = 0; global.fetch = fakeApi(() => resp(200, "{}"));
  w = await WA.enviar("21988887777", "x"); assert.ok(w.ok && chamadas[0].url.endsWith("/v1/enviar") && chamadas[0].b.numero === "5521988887777"); ok("formato fixado na Vercel é respeitado");
  setar("WAPITO_SEND_PATH"); setar("WAPITO_FIELD_PHONE"); setar("WAPITO_API_URL");
  const tkWa = ler("WAPITO_API_TOKEN"); setar("WAPITO_API_TOKEN");
  assert.strictEqual(WA.cfgWapito().token, ""); assert.strictEqual(WA.configurado(), false); assert.strictEqual(WA.cfgWapito().base, "https://api.wapito.com/v1");
  w = await WA.enviar("21988887777", "x"); assert.ok(!w.ok && /WAPITO_API_TOKEN/.test(w.detalhe)); ok("sem WAPITO_API_TOKEN: avisa qual variável falta (não existe token em arquivo)");
  setar("WAPITO_API_TOKEN", " 'wpt_exemplo_com_aspas' "); assert.strictEqual(WA.cfgWapito().token, "wpt_exemplo_com_aspas");
  setar("WAPITO_API_URL", "https://outra.api/v2/"); assert.strictEqual(WA.cfgWapito().base, "https://outra.api/v2");
  setar("WAPITO_API_URL", "lixo"); assert.strictEqual(WA.cfgWapito().base, "https://api.wapito.com/v1"); setar("WAPITO_API_URL");
  setar("WAPITO_API_TOKEN", tkWa); ok("token vem só da variável; endereço padrão da Wapito com opção de troca");

  // 9. /api/health (o gvp testa depois do deploy)
  r = await call("../api/health"); assert.strictEqual(r.code, 200); assert.ok(r.body.ok && r.body.banco === "conectado" && r.body.whatsapp === "configurado");
  assert.ok(!JSON.stringify(r.body).includes(tkWa) && !JSON.stringify(r.body).includes("senha-teste-123")); ok("/api/health 200 quando está tudo certo (sem mostrar segredos)");
  setar("WAPITO_API_TOKEN"); r = await call("../api/health"); assert.strictEqual(r.code, 200); assert.ok(r.body.avisos.length); setar("WAPITO_API_TOKEN", tkWa); ok("/api/health avisa sem token da Wapito (site continua no ar)");
  { // sem banco: 503 com o motivo
    const getRedisReal = C.getRedis; C.getRedis = () => null;
    r = await call("../api/health"); C.getRedis = getRedisReal;
    assert.strictEqual(r.code, 503); assert.ok(r.body.problemas[0].includes("Storage"));
    assert.ok(!/NOT_FOUND|Internal Server Error|Application error|ENOTFOUND|fetch failed|DATABASE_URL|ENV_MISSING/.test(JSON.stringify(r.body)), "o texto não pode acionar o auto-heal do gvp");
    C.getRedis = () => ({ get: async () => { throw new Error("x"); } }); r = await call("../api/health"); C.getRedis = getRedisReal;
    assert.strictEqual(r.code, 503); assert.strictEqual(r.body.banco, "sem_resposta");
    ok("/api/health 503 sem banco, com o motivo e sem acionar correções erradas do gvp");
  }


  // 10. Arquivos internos bloqueados no site
  const { pathToRegexp } = (() => { try { return require("path-to-regexp"); } catch (e) { return {}; } })();
  if (pathToRegexp) {
    const vj = require("../vercel.json"), bloq = (u) => vj.redirects.some((x) => pathToRegexp(x.source).test(u));
    assert.ok(bloq("/lib/whatsapp.js") && bloq("/tests/run.js") && bloq("/package.json") && !bloq("/") && !bloq("/admin") && !bloq("/api/agenda"));
    ok("arquivos internos (lib/, tests/...) bloqueados no site");
  }
  assert.ok(require("../vercel.json").functions["api/admin.js"].maxDuration >= 30); ok("tempo suficiente para o 1º envio");
  assert.ok(require("../vercel.json").rewrites.some((x) => x.source === "/health" && x.destination === "/api/health")); ok("/health também responde (o gvp testa os dois endereços)");

  console.log(`\n${n} verificações passaram.`);
})().catch((e) => { console.error("\n✖ FALHOU:", e); process.exit(1); });
