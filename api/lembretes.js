// Envio automático de lembretes. Chamado todo dia pelo agendador da Vercel (vercel.json > crons).
const C = require("../lib/core");
const L = require("../lib/lembretes");
const { cronAutorizado } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
    if (!cronAutorizado(req)) return res.status(401).json({ error: "Não autorizado" });
    const redis = C.getRedis();
    if (!redis) return res.status(503).json({ error: "Banco de dados não conectado." });
    const cfg = await C.carregarCfg(redis);
    if (!cfg.lembrete.ativo) { await L.registrarCron(redis, { ok: true, ignorado: true }); return res.status(200).json({ ok: true, ignorado: "Lembretes desativados no painel." }); }
    const resumo = await L.processarData(redis, cfg, L.dataAlvo(cfg), { forcar: false });
    console.log("lembretes:", JSON.stringify(resumo));
    await L.registrarCron(redis, { ok: !resumo.erro && !resumo.falhas, resumo });
    return res.status(200).json({ ok: !resumo.erro, resumo });
  } catch (e) {
    console.error("lembretes:", e);
    try { await L.registrarCron(C.getRedis(), { ok: false, erro: "Erro inesperado no envio automático." }); } catch (e2) {}
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
