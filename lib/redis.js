"use strict";
// Conexão com o banco (Upstash Redis). Criada sob demanda; nunca derruba a função.
const { Redis } = require("@upstash/redis");

let _redis = null;
function env(nomes, sufixo, evitar) {
  for (const n of nomes) if (process.env[n]) return String(process.env[n]).trim();
  const k = Object.keys(process.env).find(
    (x) => x.endsWith(sufixo) && !(evitar && x.includes(evitar)) && process.env[x]
  );
  return k ? String(process.env[k]).trim() : "";
}
function credenciais() {
  return {
    url: env(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"], "_REST_API_URL"),
    token: env(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"], "_REST_API_TOKEN", "READ_ONLY"),
  };
}
function getRedis() {
  if (_redis) return _redis;
  const { url, token } = credenciais();
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// Chaves do banco (um só lugar, para não haver erro de digitação)
const K = {
  agenda: (d, t) => `lyli:${d}:${t}`,
  bloqueio: (d) => `lyli:bloqueio:${d}`,
  config: "lyli:config",
  site: "lyli:site",
  midia: (id) => `lyli:media:${id}`,
  midiasIndice: "lyli:midias",
  lembrete: (d, t) => `lyli:lem:${d}:${t}`,
  lembreteLog: "lyli:lemlog",
};
module.exports = { credenciais, getRedis, K };
