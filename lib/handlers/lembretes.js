"use strict";
// Ações do painel sobre lembretes por WhatsApp.
const C = require("../core");
const L = require("../lembretes");
const wa = require("../whatsapp");
const { HttpError } = require("../erros");

module.exports = {
  async enviarLembretes({ redis, body }) {
    const cfg = await C.carregarCfg(redis);
    const date = body.date && C.dataReal(body.date) ? body.date : L.dataAlvo(cfg);
    return { ok: true, resumo: await L.processarData(redis, cfg, date, { forcar: false }) };
  },
  async lembrarUm({ redis, body }) {
    const { date, time } = body;
    if (!C.dataReal(date) || !/^\d{2}:\d{2}$/.test(String(time))) throw new HttpError(400, "Dados inválidos");
    if (!wa.configurado()) throw new HttpError(400, "WhatsApp não configurado (falta WAPITO_API_TOKEN na Vercel).");
    const ag = (await L.agendamentosDoDia(redis, date)).find((a) => a.time === time);
    if (!ag) throw new HttpError(404, "Agendamento não encontrado.");
    const cfg = await C.carregarCfg(redis);
    const r = await L.enviarUm(redis, cfg, ag, true);
    if (!r.ok) throw new HttpError(502, r.detalhe || "Não foi possível enviar.");
    return { ok: true };
  },
  async testarWhatsApp({ body }) {
    if (!wa.configurado()) throw new HttpError(400, "WhatsApp não configurado (falta WAPITO_API_TOKEN na Vercel).");
    const fone = C.normalizarTelefone(body.telefone);
    if (!fone) throw new HttpError(400, "Digite um WhatsApp válido com DDD.");
    const r = await wa.enviar(fone, "✅ Teste de lembrete — Lyli Silva Nail Designer. Se você recebeu esta mensagem, o envio automático está funcionando!");
    return { ok: r.ok, status: r.status, detalhe: r.detalhe };
  },
};
