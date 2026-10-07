"use strict";
// Monta tudo o que o painel precisa ao abrir (uma única chamada).
const C = require("../core");
const S = require("../site");
const L = require("../lembretes");
const wa = require("../whatsapp");
const { lerIndice } = require("./site");

async function varrer(redis, padrao) {
  const achadas = new Set();
  let cursor = "0";
  for (let i = 0; i < 200; i++) {
    const [prox, lote] = await redis.scan(cursor, { match: padrao, count: 500 });
    (lote || []).forEach((k) => achadas.add(k));
    cursor = String(prox);
    if (cursor === "0") break;
  }
  return [...achadas];
}
const RE_BL = /^lyli:bloqueio:(\d{4}-\d{2}-\d{2})$/;

async function montar(redis) {
  const hoje = C.agoraSP().date;
  const [agChaves, blChaves] = await Promise.all([varrer(redis, "lyli:20*"), varrer(redis, "lyli:bloqueio:*")]);
  const chavesAg = agChaves.filter((k) => L.RE_AG.test(k));
  const bloqueios = blChaves.map((k) => (k.match(RE_BL) || [])[1]).filter((d) => d && d >= hoje).sort();

  const agendamentos = [];
  for (let i = 0; i < chavesAg.length; i += 100) {
    const lote = chavesAg.slice(i, i + 100);
    const vals = await redis.mget(...lote);
    const marcas = await redis.mget(...lote.map((k) => { const [, d, t] = k.match(L.RE_AG); return C.K.lembrete(d, t); }));
    lote.forEach((chave, j) => {
      const [, date, time] = chave.match(L.RE_AG);
      const v = C.lerValor(vals[j]);
      if (!v || !v.name) return;
      agendamentos.push({ date, time, name: String(v.name), phone: v.phone ? String(v.phone) : null, at: v.at || null, lembrado: marcas[j] != null });
    });
  }
  agendamentos.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const [cfg, site, midias, log] = await Promise.all([C.carregarCfg(redis), S.carregarSite(redis), lerIndice(redis), L.lerLog(redis)]);
  return {
    agendamentos, bloqueios, hoje, cfg, times: C.todasHoras(cfg), site, midias,
    lembretes: { whatsappConfigurado: wa.configurado(), proximaData: L.dataAlvo(cfg), log },
    diag: { cronSecret: !!process.env.CRON_SECRET, sync: cfg.syncCalendario },
  };
}
module.exports = { montar };
