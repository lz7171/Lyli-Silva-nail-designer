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
    return { ok: true, total: dias.length };
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
  async cancelar({ redis, body }) {
    const { date, time } = body;
    if (!C.dataReal(date) || !/^\d{2}:\d{2}$/.test(String(time))) throw new HttpError(400, "Dados inválidos");
    await redis.del(C.K.agenda(date, time));
    await redis.del(C.K.lembrete(date, time));
    return { ok: true };
  },
  async salvarConfig({ redis, body }) {
    const cfg = C.limparCfg(body.cfg);
    await redis.set(C.K.config, cfg);
    return { ok: true, cfg, times: C.todasHoras(cfg) };
  },
};
