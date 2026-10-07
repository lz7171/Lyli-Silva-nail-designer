"use strict";
// Proteções contra pedidos falsos no agendamento público.
const crypto = require("crypto");
const { credenciais } = require("./redis");
const { igual } = require("./util");
const { senhaAdmin } = require("./ambiente");

const LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
function nomeValido(n) {
  if (typeof n !== "string") return false;
  if (n.length < 2 || n.length > 60) return false;
  if ((n.match(LETRA) || []).length < 2) return false;
  if (/\d/.test(n)) return false;
  if (/https?:|www\.|\.com|\.br|@/i.test(n)) return false;
  if (/(.)\1{3,}/.test(n)) return false;
  return true;
}
// Devolve só os dígitos (DDD + número) ou null se não parecer um celular/fixo brasileiro
function normalizarTelefone(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!/^[1-9][1-9]/.test(d)) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  if (/^(\d)\1+$/.test(d.slice(2))) return null;
  return d;
}
function origemOk(req) {
  const o = (req.headers || {}).origin;
  if (!o) return true;
  try { return new URL(o).host === (req.headers || {}).host; } catch (e) { return false; }
}
function segredo() { return "lyli|" + (credenciais().token || "") + "|" + senhaAdmin(); }
function gerarTk() {
  const ts = String(Date.now());
  return ts + "." + crypto.createHmac("sha256", segredo()).update(ts).digest("hex").slice(0, 24);
}
function tkValido(tk, minMs, maxMs) {
  if (typeof tk !== "string") return false;
  const [ts, h] = tk.split(".");
  if (!/^\d{10,15}$/.test(ts || "") || !h) return false;
  const idade = Date.now() - Number(ts);
  if (!(idade >= minMs && idade <= maxMs)) return false;
  const esperado = crypto.createHmac("sha256", segredo()).update(ts).digest("hex").slice(0, 24);
  return igual(h, esperado);
}
module.exports = { nomeValido, normalizarTelefone, origemOk, gerarTk, tkValido };
