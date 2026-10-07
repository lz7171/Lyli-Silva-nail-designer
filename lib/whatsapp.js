"use strict";
// Envio de WhatsApp pela Wapito.
//
// Token: variável WAPITO_API_TOKEN (cofre do gvp → Vercel). Nunca em arquivo.
// Endereço: https://api.wapito.com/v1 (pode ser trocado pela variável opcional WAPITO_API_URL).
//
// Formato do envio: a documentação da Wapito não é pública, então na PRIMEIRA
// mensagem o sistema testa sozinho os formatos mais usados por APIs de WhatsApp
// (endereço + nomes dos campos) e GUARDA no banco o que funcionou. Daí em diante
// usa sempre esse, com uma única chamada. Nenhuma tentativa errada envia mensagem.
//
// Para fixar o formato manualmente (opcional, só se a Wapito pedir algo diferente):
//   WAPITO_SEND_PATH    ex.: /messages
//   WAPITO_FIELD_PHONE  ex.: to
//   WAPITO_FIELD_TEXT   ex.: message
const { tokenWapito, opcional } = require("./ambiente");
const { getRedis } = require("./redis");

const URL_PADRAO = "https://api.wapito.com/v1";
const CHAVE_FORMATO = "lyli:wapito:formato";
const CAMINHOS = ["/messages", "/messages/send", "/message/send", "/send-message", "/messages/text", "/message/text", "/send-text", "/send"];
const CORPOS = [
  (f, t) => ({ to: f, message: t }),
  (f, t) => ({ to: f, text: t }),
  (f, t) => ({ to: f, body: t }),
  (f, t) => ({ phone: f, message: t }),
  (f, t) => ({ number: f, message: t }),
  (f, t) => ({ number: f, text: t }),
  (f, t) => ({ phone: f, text: t }),
  (f, t) => ({ messaging_product: "whatsapp", to: f, type: "text", text: { body: t } }),
];
const PRAZO_TOTAL_MS = 40000; // tempo máximo procurando o formato (só na 1ª vez)

function cfgWapito() {
  const caminho = opcional("WAPITO_SEND_PATH"), campoFone = opcional("WAPITO_FIELD_PHONE"), campoTexto = opcional("WAPITO_FIELD_TEXT");
  const url = opcional("WAPITO_API_URL");
  return {
    base: (/^https?:\/\/\S+$/i.test(url) ? url : URL_PADRAO).replace(/\/+$/, ""),
    token: tokenWapito(),
    fixo: !!(caminho || campoFone || campoTexto),
    caminho: "/" + (caminho || "/messages").replace(/^\/+/, ""),
    campoFone: campoFone || "to",
    campoTexto: campoTexto || "message",
  };
}
const configurado = () => !!cfgWapito().token;
const comDDI = (d) => { d = String(d || "").replace(/\D/g, ""); return d.startsWith("55") && d.length >= 12 ? d : "55" + d; };

// ---------- formato descoberto (memória + banco) ----------
let memoria = null;
async function lerFormato(base) {
  if (memoria && memoria.base === base) return memoria;
  try {
    const r = getRedis(); if (!r) return null;
    let v = await r.get(CHAVE_FORMATO);
    if (typeof v === "string") v = JSON.parse(v);
    if (v && v.base === base && CAMINHOS.includes(v.caminho) && CORPOS[v.corpo]) { memoria = v; return v; }
  } catch (e) {}
  return null;
}
async function gravarFormato(base, caminho, corpo) {
  memoria = { base, caminho, corpo };
  try { const r = getRedis(); if (r) await r.set(CHAVE_FORMATO, memoria); } catch (e) {}
}
async function esquecerFormato() {
  memoria = null;
  try { const r = getRedis(); if (r) await r.del(CHAVE_FORMATO); } catch (e) {}
}

// ---------- uma chamada à Wapito ----------
// Algumas APIs respondem 200 mas dizem "erro" dentro da resposta
function recusouNoCorpo(texto) {
  try {
    const j = JSON.parse(texto);
    if (!j || typeof j !== "object") return false;
    return j.success === false || j.ok === false || j.sent === false || /^(error|erro|failed|fail|falha)$/i.test(String(j.status || "")) || !!(j.error && typeof j.error !== "boolean");
  } catch (e) { return false; }
}
function tipoDe(status, texto) {
  if (status >= 200 && status < 300) return recusouNoCorpo(texto) ? "formato" : "ok";
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 405) return "naoExiste";
  if (status === 429) return "limite";
  return "formato"; // 400, 415, 422, 5xx...: o endereço existe, mas não gostou dos dados
}
async function postar(c, caminho, corpo, ms) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(c.base + caminho, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Accept: "application/json",
        Authorization: "Bearer " + c.token, "x-api-key": c.token, apikey: c.token,
      },
      body: JSON.stringify(corpo),
      signal: ctl ? ctl.signal : undefined,
    });
    let texto = ""; try { texto = await r.text(); } catch (e) {}
    texto = String(texto || "").split(c.token).join("***").replace(/\s+/g, " ").trim().slice(0, 300);
    return { tipo: tipoDe(r.status, texto), status: r.status, texto, caminho };
  } catch (e) {
    return { tipo: e && e.name === "AbortError" ? "demorou" : "rede", status: 0, texto: "", caminho };
  } finally { clearTimeout(t); }
}

// ---------- mensagens amigáveis ----------
function falha(c, r) {
  const resp = r && r.texto ? ` Resposta da Wapito: ${r.texto}` : "";
  let detalhe;
  switch (r && r.tipo) {
    case "auth": detalhe = `A Wapito recusou o token (código ${r.status}). Confira se o token está certo e ativo na sua conta Wapito.${resp}`; break;
    case "limite": detalhe = `A Wapito pediu para esperar um pouco (muitos envios seguidos).${resp}`; break;
    case "demorou": detalhe = "A Wapito demorou demais para responder. Tente de novo em alguns minutos."; break;
    case "rede": detalhe = `Não foi possível falar com a Wapito em ${c.base}. Confira o endereço da API.`; break;
    case "naoExiste": detalhe = `A Wapito não reconheceu o endereço de envio (código ${r.status}) em ${c.base}.${resp}`; break;
    default: detalhe = r ? `A Wapito recusou a mensagem (código ${r.status}).${resp}` : "Não foi possível enviar.";
  }
  return { ok: false, status: (r && r.status) || 0, detalhe };
}
const sucesso = (r) => ({ ok: true, status: r.status, detalhe: "Enviado." });

// Devolve { ok, status, detalhe }. Nunca lança erro e nunca devolve o token.
async function enviar(telefone, texto) {
  const c = cfgWapito();
  if (!c.token) return { ok: false, status: 0, detalhe: "WhatsApp não configurado (falta a variável WAPITO_API_TOKEN: gvp env set WAPITO_API_TOKEN)." };
  const fone = comDDI(telefone);
  if (fone.length < 12 || fone.length > 13) return { ok: false, status: 0, detalhe: "Telefone inválido." };
  const msg = String(texto).slice(0, 4000);
  const fim = Date.now() + PRAZO_TOTAL_MS;
  const tempo = () => Math.max(4000, Math.min(12000, fim - Date.now()));
  const tentar = (caminho, i) => postar(c, caminho, CORPOS[i](fone, msg), tempo());

  // 1) Formato fixado manualmente na Vercel
  if (c.fixo) {
    const r = await postar(c, c.caminho, { [c.campoFone]: fone, [c.campoTexto]: msg }, 12000);
    return r.tipo === "ok" ? sucesso(r) : falha(c, r);
  }

  // 2) Formato já descoberto antes: uma chamada só
  const salvo = await lerFormato(c.base);
  let melhor = null; // erro mais útil para mostrar se nada funcionar
  if (salvo) {
    const r = await tentar(salvo.caminho, salvo.corpo);
    if (r.tipo === "ok") return sucesso(r);
    if (r.tipo !== "formato" && r.tipo !== "naoExiste") return falha(c, r); // token, limite, rede: não adianta testar outro formato
    await esquecerFormato(); // a Wapito mudou algo: procura de novo
    melhor = r;
  }

  // 3) Descoberta: acha o endereço (o que não dá 404) e depois os nomes dos campos
  for (const caminho of CAMINHOS) {
    if (Date.now() >= fim) break;
    for (let i = 0; i < CORPOS.length; i++) {
      if (Date.now() >= fim) break;
      if (salvo && salvo.caminho === caminho && salvo.corpo === i) continue; // já testado acima
      const r = await tentar(caminho, i);
      if (r.tipo === "ok") { await gravarFormato(c.base, caminho, i); return sucesso(r); }
      if (r.tipo === "naoExiste") { if (!melhor) melhor = r; break; } // endereço não existe: próximo endereço
      if (r.tipo !== "formato") return falha(c, r);                  // token/limite/rede: para tudo
      if (!melhor || melhor.tipo === "naoExiste") melhor = r;        // endereço existe: tenta outros campos
    }
  }
  return falha(c, melhor);
}

module.exports = { configurado, enviar, cfgWapito, comDDI, CAMINHOS, CORPOS, CHAVE_FORMATO, _esquecer: () => { memoria = null; } };
