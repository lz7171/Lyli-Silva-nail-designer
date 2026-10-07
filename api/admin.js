// Painel administrativo — roteador. Cada ação mora em lib/handlers/*.
const C = require("../lib/core");
const { senhaConfigurada, senhaCorreta } = require("../lib/auth");
const { HttpError } = require("../lib/erros");
const { montar } = require("../lib/handlers/painel");

const ACOES = {
  ...require("../lib/handlers/agenda"),
  ...require("../lib/handlers/site"),
  ...require("../lib/handlers/lembretes"),
};
delete ACOES.lerIndice;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!senhaConfigurada()) {
      return res.status(503).json({ code: "sem_senha", error: "Senha do painel não configurada (variável ADMIN_PASSWORD). No gvp: gvp admin setup e depois gvp deploy." });
    }
    const redis = C.getRedis();
    if (!redis) return res.status(503).json({ error: "Banco de dados não conectado." });

    // Proteção contra adivinhar a senha: 10 erros = 15 min de espera
    const chaveErro = `rl:admin:${C.ipDe(req)}`;
    if (await C.passouDoLimite(redis, chaveErro, 10)) return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    if (!senhaCorreta(req)) {
      await C.contar(redis, chaveErro, 900);
      return res.status(401).json({ error: "Senha incorreta" });
    }

    if (req.method === "GET") return res.status(200).json(await montar(redis));

    if (req.method === "POST" || req.method === "DELETE") {
      const body = C.corpo(req);
      const nome = body.action || (req.method === "DELETE" ? "cancelar" : "");
      const fn = Object.prototype.hasOwnProperty.call(ACOES, nome) ? ACOES[nome] : null;
      if (!fn) return res.status(400).json({ error: "Ação inválida" });
      return res.status(200).json(await fn({ redis, body, req }));
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...e.extra });
    console.error("admin:", e);
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
