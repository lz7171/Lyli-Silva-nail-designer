// Código compartilhado entre /api/agenda e /api/admin.
// >>> HORÁRIOS DE ATENDIMENTO: altere SOMENTE aqui. Site e painel se ajustam sozinhos. <<<
"use strict";
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const TIMES = ["09:30", "14:30", "17:00"];
const JANELA_DIAS = 60;          // quantos dias à frente o site aceita
const JANELA_ADMIN_DIAS = 180;   // quantos dias à frente o painel aceita
const DIAS_ATENDIMENTO = [2, 3, 4, 5, 6]; // terça a sábado
const TZ = "America/Sao_Paulo";
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

const chaveAgenda = (d, t) => `lyli:${d}:${t}`;
const chaveBloqueio = (d) => `lyli:bloqueio:${d}`;

// ---------- Redis (criado sob demanda; nunca derruba a função) ----------
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

// ---------- Datas (sempre no fuso de São Paulo) ----------
function agoraSP() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const o = {};
  p.forEach((x) => (o[x.type] = x.value));
  return { date: `${o.year}-${o.month}-${o.day}`, min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
}
const meioDia = (d) => new Date(d + "T12:00:00Z");
function somarDias(d, n) { return new Date(meioDia(d).getTime() + n * 864e5).toISOString().slice(0, 10); }
function diasEntre(a, b) { return Math.round((meioDia(b) - meioDia(a)) / 864e5); }
function dataReal(d) {
  if (typeof d !== "string" || !RE_DATA.test(d)) return false;
  const dt = meioDia(d);
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === d;
}
function dataPublicaValida(d) {
  if (!dataReal(d)) return false;
  if (!DIAS_ATENDIMENTO.includes(meioDia(d).getUTCDay())) return false;
  const hoje = agoraSP().date;
  return d >= hoje && d <= somarDias(hoje, JANELA_DIAS);
}
// Tempo de vida da chave: até a data + folga (nunca expira antes do dia do atendimento)
function ttlPara(date, folgaDias) {
  const dias = Math.max(0, diasEntre(agoraSP().date, date));
  return (dias + folgaDias) * 86400;
}

// ---------- Utilidades ----------
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

// ---------- Limite de tentativas (falha "aberta": se o Redis falhar, não bloqueia ninguém) ----------
async function passouDoLimite(redis, chave, max) {
  try { return Number((await redis.get(chave)) || 0) >= max; } catch (e) { return false; }
}
async function contar(redis, chave, janelaSeg) {
  try {
    await redis.set(chave, 0, { nx: true, ex: janelaSeg });
    return Number(await redis.incr(chave));
  } catch (e) { return 0; }
}

// ---------- Anti-pedidos falsos ----------
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
  if (/^(\d)\1+$/.test(d.slice(2))) return null; // 99999999999 etc.
  return d;
}
function origemOk(req) {
  const o = (req.headers || {}).origin;
  if (!o) return true;
  try { return new URL(o).host === (req.headers || {}).host; } catch (e) { return false; }
}
// Token assinado entregue ao carregar os horários: exige que o pedido venha da página do site
function segredo() { return "lyli|" + (credenciais().token || "") + "|" + (process.env.ADMIN_PASSWORD || ""); }
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

module.exports = {
  nomeValido, normalizarTelefone, origemOk, gerarTk, tkValido,
  TIMES, JANELA_DIAS, JANELA_ADMIN_DIAS, RE_DATA, chaveAgenda, chaveBloqueio,
  credenciais, getRedis, agoraSP, somarDias, diasEntre, dataReal, dataPublicaValida, ttlPara,
  corpo, limparNome, ipDe, lerValor, igual, passouDoLimite, contar,
};
