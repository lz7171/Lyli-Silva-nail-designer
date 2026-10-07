"use strict";
// Conexão com o banco (Upstash Redis). Criada sob demanda; nunca derruba a função.
const { Redis } = require("@upstash/redis");

let _redis = null;
// Procura a variável pelo nome oficial e, se não achar, por qualquer nome que termine
// do jeito certo (a Vercel às vezes cria com prefixo, ex.: STORAGE_KV_REST_API_URL).
function env(nomes, sufixos, evitar) {
  for (const n of nomes) if (process.env[n] && String(process.env[n]).trim()) return String(process.env[n]).trim();
  const k = Object.keys(process.env).sort().find(
    (x) => sufixos.some((s) => x.endsWith(s)) && !(evitar && x.includes(evitar)) && String(process.env[x] || "").trim()
  );
  return k ? String(process.env[k]).trim() : "";
}
function credenciais() {
  return {
    url: env(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"], ["_REST_API_URL", "_REDIS_REST_URL"]).replace(/^["']+|["']+$/g, ""),
    token: env(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"], ["_REST_API_TOKEN", "_REDIS_REST_TOKEN"], "READ_ONLY").replace(/^["']+|["']+$/g, ""),
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
  cronUltimo: "lyli:cronultimo",
};
module.exports = { credenciais, getRedis, K };
