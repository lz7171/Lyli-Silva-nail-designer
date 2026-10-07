"use strict";
// Autenticação do painel. A senha vem SOMENTE da variável ADMIN_PASSWORD
// (o gvp guarda no cofre e envia à Vercel). Sem a variável, o painel fica bloqueado.
const { igual } = require("./util");
const { senhaAdmin, segredoCron } = require("./ambiente");

const senhaConfigurada = () => senhaAdmin().length >= 6;

// confere uma senha digitada (aceita a versão codificada que o painel envia)
function senhaConfere(bruta) {
  if (typeof bruta !== "string" || !bruta || !senhaConfigurada()) return false;
  const SENHA = senhaAdmin();
  let dec = bruta;
  try { dec = decodeURIComponent(bruta); } catch (e) {}
  return igual(dec.trim(), SENHA) || igual(bruta.trim(), SENHA);
}
const senhaCorreta = (req) => senhaConfere((req.headers || {})["x-admin-pass"]);

// Chamada do agendador (cron da Vercel). Com CRON_SECRET, a Vercel manda
// "Authorization: Bearer <CRON_SECRET>" sozinha.
function cronAutorizado(req) {
  const h = req.headers || {};
  const seg = segredoCron();
  // Sem CRON_SECRET ninguém passa (o User-Agent é fácil de imitar). O gvp gera o segredo sozinho.
  if (!seg) return false;
  return typeof h.authorization === "string" && igual(h.authorization, "Bearer " + seg);
}
module.exports = { senhaConfigurada, senhaConfere, senhaCorreta, cronAutorizado };
