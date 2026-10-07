"use strict";
// Autenticação do painel. A senha vem SOMENTE da variável ADMIN_PASSWORD (Vercel).
// Não existe senha padrão: se a variável faltar, o painel fica bloqueado e avisa.
const { igual } = require("./util");

const senhaConfigurada = () => String(process.env.ADMIN_PASSWORD || "").trim().length >= 6;

function senhaCorreta(req) {
  const bruta = req.headers["x-admin-pass"];
  if (typeof bruta !== "string" || !bruta || !senhaConfigurada()) return false;
  const SENHA = String(process.env.ADMIN_PASSWORD).trim();
  let dec = bruta;
  try { dec = decodeURIComponent(bruta); } catch (e) {}
  return igual(dec.trim(), SENHA) || igual(bruta.trim(), SENHA);
}
// Chamada do agendador (cron da Vercel) ou do painel
function cronAutorizado(req) {
  const h = req.headers || {};
  const seg = String(process.env.CRON_SECRET || "").trim();
  if (seg) return typeof h.authorization === "string" && igual(h.authorization, "Bearer " + seg);
  return /vercel-cron/i.test(String(h["user-agent"] || "")); // sem CRON_SECRET: aceita só o cron da Vercel (envio é idempotente)
}
module.exports = { senhaConfigurada, senhaCorreta, cronAutorizado };
