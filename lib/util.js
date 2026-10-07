"use strict";
const crypto = require("crypto");

function corpo(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === "object" ? b : {};
}
function limparNome(n) {
  return String(n || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
function ipDe(req) {
  const h = req.headers || {};
  const x = String(h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim();
  return (x || "desconhecido").replace(/[^0-9a-zA-Z:.\-]/g, "").slice(0, 45) || "desconhecido";
}
function lerValor(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { const j = JSON.parse(v); return j && typeof j === "object" ? j : { name: String(v) }; }
  catch (e) { return { name: String(v) }; }
}
function igual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const txt = (v, def, n) => (typeof v === "string" ? v.trim().slice(0, n) : def);

// Limite de tentativas (falha "aberta": se o Redis falhar, não bloqueia ninguém)
async function passouDoLimite(redis, chave, max) {
  try { return Number((await redis.get(chave)) || 0) >= max; } catch (e) { return false; }
}
async function contar(redis, chave, janelaSeg) {
  try {
    await redis.set(chave, 0, { nx: true, ex: janelaSeg });
    return Number(await redis.incr(chave));
  } catch (e) { return 0; }
}
module.exports = { corpo, limparNome, ipDe, lerValor, igual, esc, txt, passouDoLimite, contar };
