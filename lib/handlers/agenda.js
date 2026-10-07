"use strict";
// Ações do painel sobre agendamentos e dias bloqueados.
const C = require("../core");
const { HttpError } = require("../erros");

function dataAdminOk(d) {
  if (!C.dataReal(d)) throw new HttpError(400, "Data inválida");
  const hoje = C.agoraSP().date;
  if (d < hoje) throw new HttpError(400, "Essa data já passou");
  if (d > C.somarDias(hoje, C.JANELA_ADMIN_DIAS)) throw new HttpError(400, "Data muito distante");
}

// Agendamentos de cliente (sem horários "fechados") — usado para avisar ao fechar um período
async function varrerAg(redis) {
  const L = require("../lembretes"), achadas = [];
  let cursor = "0";
  for (let i = 0; i < 100; i++) {
    const [prox, lote] = await redis.scan(cursor, { match: "lyli:20*", count: 500 });
    (lote || []).forEach((k) => L.RE_AG.test(k) && achadas.push(k));
    cursor = String(prox); if (cursor === "0") break;
  }
  if (!achadas.length) return [];
  const vals = await redis.mget(...achadas);
  return achadas.map((k, j) => { const v = C.lerValor(vals[j]); return v && v.name && v.fechado !== true ? { date: k.match(L.RE_AG)[1] } : null; }).filter(Boolean);
}

module.exports = {
  async bloquear({ redis, body }) {
    dataAdminOk(body.date);
    await redis.set(C.K.bloqueio(body.date), { at: Date.now() }, { ex: C.ttlPara(body.date, 2) });
    return { ok: true };
  },
  async bloquearPeriodo({ redis, body }) {
    const { de, ate } = body;
    if (!C.dataReal(de) || !C.dataReal(ate) || ate < de) throw new HttpError(400, "Período inválido");
    const hoje = C.agoraSP().date, limite = C.somarDias(hoje, C.JANELA_ADMIN_DIAS);
    const dias = [];
    for (let d = de < hoje ? hoje : de; d <= ate && d <= limite && dias.length < 120; d = C.somarDias(d, 1)) dias.push(d);
    if (!dias.length) throw new HttpError(400, "Nenhuma data válida nesse período");
    for (let i = 0; i < dias.length; i += 20) {
      await Promise.all(dias.slice(i, i + 20).map((d) => redis.set(C.K.bloqueio(d), { at: Date.now() }, { ex: C.ttlPara(d, 2) })));
    }
    const cheios = new Set(dias);
    const comCliente = (await varrerAg(redis)).filter((a) => cheios.has(a.date)).length;
    return { ok: true, total: dias.length, comCliente };
  },
  async desbloquear({ redis, body }) {
    if (!C.dataReal(body.date)) throw new HttpError(400, "Data inválida");
    await redis.del(C.K.bloqueio(body.date));
    return { ok: true };
  },
  async reservar({ redis, body }) {
    const { date, time } = body;
    const nome = C.limparNome(body.name);
    const cfg = await C.carregarCfg(redis);
    const inf = C.dataReal(date) ? C.infoDia(cfg, date) : null;
    if (!inf || !inf.times.includes(time) || nome.length < 2) throw new HttpError(400, "Dados inválidos (confira se esse horário existe nesse dia).");
    dataAdminOk(date);
    let fone = null;
    if (body.phone && String(body.phone).replace(/\D/g, "")) {
      fone = C.normalizarTelefone(body.phone);
      if (!fone) throw new HttpError(400, "WhatsApp inválido. Use DDD + número.");
    }
    if (await redis.get(C.K.bloqueio(date))) throw new HttpError(400, "Esse dia está bloqueado. Desbloqueie antes de agendar.");
    const valor = { name: nome, at: Date.now() };
    if (fone) valor.phone = fone;
    const ok = await redis.set(C.K.agenda(date, time), valor, { nx: true, ex: C.ttlPara(date, 45) });
    if (!ok) throw new HttpError(409, "Horário já reservado");
    return { ok: true };
  },
  // Fecha UM horário num dia (fica ocupado no site). Para abrir de novo: "cancelar" (botão Reabrir).
  async fecharHorario({ redis, body }) {
    const { date, time } = body;
    const cfg = await C.carregarCfg(redis);
    const inf = C.dataReal(date) ? C.infoDia(cfg, date) : null;
    if (!inf || !inf.times.includes(time)) throw new HttpError(400, "Esse horário não existe nesse dia.");
    dataAdminOk(date);
    const ok = await redis.set(C.K.agenda(date, time), { name: "Horário fechado", fechado: true, at: Date.now() }, { nx: true, ex: C.ttlPara(date, 45) });
    if (!ok) throw new HttpError(409, "Esse horário já está ocupado (tem cliente ou já está fechado).");
    return { ok: true };
  },
  // body.avisar = true → também manda um WhatsApp para a cliente dizendo que o horário foi cancelado
  async cancelar({ redis, body }) {
    const { date, time } = body;
    if (!C.dataReal(date) || !/^\d{2}:\d{2}$/.test(String(time))) throw new HttpError(400, "Dados inválidos");
    const antes = body.avisar === true ? C.lerValor(await redis.get(C.K.agenda(date, time))) : null;
    await redis.del(C.K.agenda(date, time));
    await redis.del(C.K.lembrete(date, time));
    if (!antes || antes.fechado === true) return { ok: true };
    if (!antes.phone || String(antes.phone).length < 11) return { ok: true, avisado: false, motivo: "A cliente não tem WhatsApp cadastrado." };
    const wa = require("../whatsapp");
    if (!wa.configurado()) return { ok: true, avisado: false, motivo: "WhatsApp não configurado." };
    const r = await wa.enviar(antes.phone, `Oi! Precisei cancelar seu horário de ${require("../datas").dataBR(date)} às ${time}. Sinto muito! 💕 Me chame aqui para escolhermos um novo horário.`);
    return { ok: true, avisado: r.ok, motivo: r.ok ? "" : r.detalhe };
  },
  async salvarConfig({ redis, body }) {
    const erroCfg = C.validarCfg(body.cfg);
    if (erroCfg) throw new HttpError(400, erroCfg);
    const cfg = C.limparCfg(body.cfg);
    await redis.set(C.K.config, cfg);
    return { ok: true, cfg, times: C.todasHoras(cfg) };
  },
};
