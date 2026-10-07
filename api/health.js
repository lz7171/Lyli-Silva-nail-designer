// Saúde do site. O gvp abre /api/health depois de cada deploy (teste real da URL).
// 200 = o que o site precisa está funcionando | 503 = falta algo (motivo em "problemas").
// Nunca mostra valores de senha/token: só se estão configurados.
const C = require("../lib/core");
const wa = require("../lib/whatsapp");
const { senhaConfigurada } = require("../lib/auth");
const { segredoCron, senhaAdmin } = require("../lib/ambiente");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).json({ ok: false }); }
  const problemas = [], avisos = [];
  let banco = "sem_variaveis";
  const redis = C.getRedis();
  if (!redis) {
    problemas.push("Banco Upstash Redis sem variáveis neste projeto da Vercel. Vercel > Storage > conecte o Upstash Redis a este projeto e publique de novo.");
  } else {
    try { await redis.get("lyli:health"); banco = "conectado"; }
    catch (e) { banco = "sem_resposta"; problemas.push("O banco Upstash Redis não respondeu. Confira a conexão em Vercel > Storage."); }
  }
  const painel = senhaConfigurada();
  if (!painel) problemas.push("Falta a variável ADMIN_PASSWORD (painel bloqueado). No gvp: gvp admin setup e depois gvp deploy.");
  if (!segredoCron()) avisos.push("Falta a variável CRON_SECRET: o envio automático das 9h fica bloqueado (o botão 'Enviar agora' do painel continua funcionando). No gvp: gvp preflight --fix.");
  if (painel && senhaAdmin().length < 10) avisos.push("A senha do painel tem menos de 10 caracteres. Troque por uma mais forte (gvp admin setup).");
  const whatsapp = wa.configurado();
  if (!whatsapp) avisos.push("Falta a variável WAPITO_API_TOKEN (lembretes por WhatsApp desligados). No gvp: gvp env set WAPITO_API_TOKEN e depois gvp deploy.");
  return res.status(problemas.length ? 503 : 200).json({
    ok: problemas.length === 0,
    banco, painel: painel ? "configurado" : "sem_senha", whatsapp: whatsapp ? "configurado" : "sem_token",
    problemas, avisos,
  });
};
