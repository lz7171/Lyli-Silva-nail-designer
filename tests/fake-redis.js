"use strict";
// Banco falso em memória (imita o Upstash Redis) para os testes.
const store = new Map(), listas = new Map();
class FakeRedis {
  async get(k) { return store.has(k) ? JSON.parse(store.get(k)) : null; }
  async set(k, v, o) { if (o && o.nx && store.has(k)) return null; store.set(k, JSON.stringify(v)); return "OK"; }
  async del(k) { store.delete(k); return 1; }
  async incr(k) { const n = Number(store.has(k) ? JSON.parse(store.get(k)) : 0) + 1; store.set(k, JSON.stringify(n)); return n; }
  async mget(...ks) { return ks.map((k) => (store.has(k) ? JSON.parse(store.get(k)) : null)); }
  async scan(c, o) { const re = new RegExp("^" + o.match.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"); return ["0", [...store.keys()].filter((k) => re.test(k))]; }
  async lpush(k, v) { const a = listas.get(k) || []; a.unshift(v); listas.set(k, a); }
  async ltrim(k, a, b) { listas.set(k, (listas.get(k) || []).slice(a, b + 1)); }
  async lrange(k, a, b) { return (listas.get(k) || []).slice(a, b + 1); }
}
module.exports = { FakeRedis, store, listas };
