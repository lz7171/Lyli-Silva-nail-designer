"use strict";
// Envio de WhatsApp pela Wapito. As credenciais ficam SOMENTE em variáveis de ambiente
// da Vercel (nunca no código). Se algo faltar, o resto do site continua funcionando.
//
// Variáveis (Vercel > Settings > Environment Variables):
//   WAPITO_API_TOKEN   (obrigatória) token da Wapito
//   WAPITO_API_URL     (opcional)    padrão: https://api.wapito.com/v1
//   WAPITO_SEND_PATH   (opcional)    padrão: /messages
//   WAPITO_FIELD_PHONE (opcional)    nome do campo do telefone no JSON. Padrão: to
//   WAPITO_FIELD_TEXT  (opcional)    nome do campo do texto no JSON.     Padrão: message
function cfgWapito() {
  return {
    base: String(process.env.WAPITO_API_URL || "https://api.wapito.com/v1").trim().replace(/\/+$/, ""),
    token: String(process.env.WAPITO_API_TOKEN || "").trim(),
    caminho: "/" + String(process.env.WAPITO_SEND_PATH || "/messages").trim().replace(/^\/+/, ""),
    campoFone: String(process.env.WAPITO_FIELD_PHONE || "to").trim(),
    campoTexto: String(process.env.WAPITO_FIELD_TEXT || "message").trim(),
  };
}
const configurado = () => !!cfgWapito().token;
const comDDI = (d) => { d = String(d || "").replace(/\D/g, ""); return d.startsWith("55") && d.length >= 12 ? d : "55" + d; };

// Devolve { ok, status, detalhe }. Nunca lança erro e nunca devolve o token.
async function enviar(telefone, texto) {
  const c = cfgWapito();
  if (!c.token) return { ok: false, status: 0, detalhe: "WhatsApp não configurado (falta WAPITO_API_TOKEN na Vercel)." };
  const fone = comDDI(telefone);
  if (fone.length < 12 || fone.length > 13) return { ok: false, status: 0, detalhe: "Telefone inválido." };
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), 12000);
  try {
    const r = await fetch(c.base + c.caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.token },
      body: JSON.stringify({ [c.campoFone]: fone, [c.campoTexto]: String(texto).slice(0, 4000) }),
      signal: ctl ? ctl.signal : undefined,
    });
    let corpo = ""; try { corpo = (await r.text()).slice(0, 300); } catch (e) {}
    return { ok: r.status >= 200 && r.status < 300, status: r.status, detalhe: r.ok ? "Enviado." : (corpo || "Recusado pela Wapito.") };
  } catch (e) {
    return { ok: false, status: 0, detalhe: e && e.name === "AbortError" ? "A Wapito demorou demais para responder." : "Não foi possível falar com a Wapito." };
  } finally { clearTimeout(t); }
}
module.exports = { configurado, enviar, cfgWapito };
