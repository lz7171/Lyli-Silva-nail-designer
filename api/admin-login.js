// Confere a senha do painel e responde { ok: true } ou 401.
// Existe para ferramentas de teste (ex.: "gvp admin test"); o painel /admin continua igual.
// Mesma proteção do painel: 10 senhas erradas = 15 minutos de espera.
const C = require("../lib/core");
const { senhaConfigurada, senhaConfere } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Use POST" }); }
  if (!senhaConfigurada()) return res.status(503).json({ ok: false, code: "sem_senha", error: "Senha do painel não configurada (variável ADMIN_PASSWORD)." });
  if (!C.origemOk(req)) return res.status(403).json({ ok: false, error: "Pedido não autorizado." });
  try {
    const redis = C.getRedis(), chave = `rl:admin:${C.ipDe(req)}`;
    if (redis && await C.passouDoLimite(redis, chave, 10)) return res.status(429).json({ ok: false, error: "Muitas tentativas. Aguarde 15 minutos." });
    const b = C.corpo(req);
    const tentativa = typeof b.password === "string" ? b.password : typeof b.senha === "string" ? b.senha : "";
    if (!senhaConfere(tentativa)) {
      if (redis) await C.contar(redis, chave, 900);
      return res.status(401).json({ ok: false, error: "Senha incorreta" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("admin-login:", e);
    return res.status(500).json({ ok: false, error: "Erro no servidor" });
  }
};
