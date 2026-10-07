"use strict";
// Lembretes automáticos para as clientes (WhatsApp).
const { K } = require("./redis");
const { agoraSP, somarDias, dataBR, diaSemana } = require("./datas");
const { lerValor } = require("./util");
const wa = require("./whatsapp");

const RE_AG = /^lyli:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/;

function montarMensagem(cfg, ag) {
  const vars = {
    nome: ag.name || "", data: dataBR(ag.date), hora: ag.time,
    dia_semana: diaSemana(ag.date),
  };
  return cfg.lembrete.msg.replace(/\{(nome|data|hora|dia_semana)\}/g, (m, k) => vars[k]);
}
function dataAlvo(cfg) {
  const hoje = agoraSP().date;
  return cfg.lembrete.quando === "mesmo_dia" ? hoje : somarDias(hoje, 1);
}
async function agendamentosDoDia(redis, date) {
  const achadas = [];
  let cursor = "0";
  for (let i = 0; i < 50; i++) {
    const [prox, lote] = await redis.scan(cursor, { match: `lyli:${date}:*`, count: 200 });
    (lote || []).forEach((k) => RE_AG.test(k) && achadas.push(k));
    cursor = String(prox);
    if (cursor === "0") break;
  }
  if (!achadas.length) return [];
  const vals = await redis.mget(...achadas);
  return achadas.map((k, j) => {
    const [, d, t] = k.match(RE_AG), v = lerValor(vals[j]);
    return v && v.name ? { date: d, time: t, name: String(v.name), phone: v.phone ? String(v.phone) : null } : null;
  }).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time));
}
async function registrar(redis, item) {
  try {
    await redis.lpush(K.lembreteLog, JSON.stringify({ ...item, em: Date.now() }));
    await redis.ltrim(K.lembreteLog, 0, 99);
  } catch (e) {}
}
// Envia o lembrete de UM agendamento. forcar=true ignora a marca "já enviado".
async function enviarUm(redis, cfg, ag, forcar) {
  if (!ag.phone) return { ok: false, motivo: "sem_telefone", detalhe: "Cliente sem WhatsApp cadastrado." };
  const marca = K.lembrete(ag.date, ag.time);
  if (!forcar) {
    // NX = só um processo envia (evita mensagem duplicada se o cron rodar duas vezes)
    const ganhou = await redis.set(marca, { at: Date.now() }, { nx: true, ex: 14 * 86400 });
    if (!ganhou) return { ok: false, motivo: "ja_enviado", detalhe: "Já enviado." };
  }
  const r = await wa.enviar(ag.phone, montarMensagem(cfg, ag));
  if (r.ok) { await redis.set(marca, { at: Date.now(), ok: true }, { ex: 14 * 86400 }); }
  else if (!forcar) { try { await redis.del(marca); } catch (e) {} } // libera para tentar de novo depois
  await registrar(redis, { date: ag.date, time: ag.time, name: ag.name, ok: r.ok, detalhe: r.detalhe });
  return { ok: r.ok, motivo: r.ok ? "enviado" : "falhou", detalhe: r.detalhe };
}
// Processa todos os agendamentos de uma data
async function processarData(redis, cfg, date, opcoes) {
  const resumo = { date, enviados: 0, jaEnviados: 0, semTelefone: 0, falhas: 0, passados: 0, detalhes: [] };
  if (!wa.configurado()) { resumo.erro = "WhatsApp não configurado (falta a variável WAPITO_API_TOKEN: gvp env set WAPITO_API_TOKEN)."; return resumo; }
  const agora = agoraSP();
  for (const ag of await agendamentosDoDia(redis, date)) {
    const [h, m] = ag.time.split(":").map(Number);
    if (date === agora.date && h * 60 + m <= agora.min) { resumo.passados++; continue; }
    const r = await enviarUm(redis, cfg, ag, opcoes && opcoes.forcar);
    if (r.motivo === "enviado") resumo.enviados++;
    else if (r.motivo === "ja_enviado") resumo.jaEnviados++;
    else if (r.motivo === "sem_telefone") resumo.semTelefone++;
    else { resumo.falhas++; resumo.detalhes.push(`${ag.time} ${ag.name}: ${r.detalhe}`); }
  }
  return resumo;
}
async function lerLog(redis) {
  try { return (await redis.lrange(K.lembreteLog, 0, 29)).map((x) => (typeof x === "string" ? JSON.parse(x) : x)); }
  catch (e) { return []; }
}
module.exports = { RE_AG, montarMensagem, dataAlvo, agendamentosDoDia, enviarUm, processarData, lerLog };
