// api/admin.js — backend da área admin (Vercel Serverless Function)
// Variáveis de ambiente:
//   ADMIN_PASSWORD  senha do painel
//   ADMIN_SECRET    texto aleatório longo (mín. 16 caracteres) assina a sessão
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (ou nomes similares)

const crypto = require("crypto");

const TIMES = ["09:30", "14:00", "18:00"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_MS = 8 * 60 * 60 * 1000;
const fails = new Map();

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secret = () => process.env.ADMIN_SECRET || "";
const sign = (p) => crypto.createHmac("sha256", secret()).update(p).digest("base64url");

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString("base64url");
  return payload + "." + sign(payload);
}

function tokenValido(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [p, s] = t.split(".");
  if (!p || !s) return false;
  const good = sign(p);
  if (s.length !== good.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return false;
  try {
    return JSON.parse(Buffer.from(p, "base64url").toString()).exp > Date.now();
  } catch (e) {
    return false;
  }
}

function dataOk(s) {
  return DATE_RE.test(s) && !isNaN(new Date(s + "T12:00:00"));
}

const base = (req) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

async function ocupados(req, date) {
  const r = await fetch(`${base(req)}/api/agenda?date=${encodeURIComponent(date)}`, { cache: "no-store" });
  const j = await r.json();
  return Array.isArray(j.taken) ? j.taken : [];
}

async function bloquear(req, date, time) {
  const r = await fetch(`${base(req)}/api/agenda`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, time, name: "BLOQUEADO (admin)" }),
  });
  return r.status;
}

const KV_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REST_URL || process.env.REST_API_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REST_TOKEN || process.env.REST_API_TOKEN;

async function redisCall(cmd) {
  const url = KV_URL();
  const token = KV_TOKEN();
  if (!url || !token) throw new Error("sem-storage");

  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });

  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Upstash ${r.status}`);
  return j.result;
}

async function liberar(date, time) {
  if (!KV_URL() || !KV_TOKEN()) throw new Error("sem-storage");

  const keys = [
    `lyli:${date}:${time}`,
    `agenda:${date}`,
    `agenda-${date}`,
    `agenda_${date}`,
    date,
    `agenda:${date}:${time}`,
    `agenda:${date}T${time}`,
    `agenda:${date}-${time}`,
  ];

  for (const key of keys) {
    const type = await redisCall(["TYPE", key]);
    if (type === "none") continue;

    if (type === "hash") {
      await redisCall(["HDEL", key, time]);
      continue;
    }

    if (type === "set") {
      await redisCall(["SREM", key, time]);
      continue;
    }

    if (type === "string") {
      const raw = await redisCall(["GET", key]);
      let v;
      try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { continue; }
      if (Array.isArray(v)) {
        v = v.filter((item) => !(typeof item === "string" ? item === time : item && item.time === time));
      } else if (v && typeof v === "object") {
        delete v[time];
      }
      await redisCall(["SET", key, JSON.stringify(v)]);
      continue;
    }

    if (type === "none") continue;
    await redisCall(["DEL", key]);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  if (!process.env.ADMIN_PASSWORD || secret().length < 16) {
    return res.status(500).json({ error: "Configure ADMIN_PASSWORD e ADMIN_SECRET (mín. 16 caracteres) na Vercel." });
  }

  const b = req.body || {};

  if (b.action === "login") {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
    const f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });

    const ok = crypto.timingSafeEqual(sha(b.password || ""), sha(process.env.ADMIN_PASSWORD));
    if (!ok) {
      f.n += 1;
      if (f.n >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.n = 0; }
      fails.set(ip, f);
      await sleep(800);
      return res.status(401).json({ error: "Senha incorreta." });
    }

    fails.delete(ip);
    return res.status(200).json({ token: makeToken() });
  }

  if (!tokenValido(req)) return res.status(401).json({ error: "Sessão expirada. Entre de novo." });

  try {
    if (b.action === "range") {
      if (!dataOk(b.from)) return res.status(400).json({ error: "Data inválida." });
      const n = Math.min(Math.max(parseInt(b.days, 10) || 31, 1), 62);
      const datas = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(b.from + "T12:00:00");
        d.setDate(d.getDate() + i);
        datas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }

      const lista = await Promise.all(datas.map((d) => ocupados(req, d).catch(() => [])));
      const days = {};
      datas.forEach((d, i) => (days[d] = lista[i]));
      return res.status(200).json({ days });
    }

    if (b.action === "block" || b.action === "free") {
      if (!dataOk(b.date) || !TIMES.includes(b.time)) return res.status(400).json({ error: "Dados inválidos." });

      if (b.action === "block") {
        const status = await bloquear(req, b.date, b.time);
        if (status !== 200 && status !== 409) return res.status(502).json({ error: "Não foi possível bloquear agora." });
      } else {
        try {
          await liberar(b.date, b.time);
        } catch (e) {
          const m = e.message === "sem-storage"
            ? "Falta configurar o acesso ao banco (KV_REST_API_URL e KV_REST_API_TOKEN) para liberar horários."
            : "Erro ao liberar o horário no banco.";
          return res.status(500).json({ error: m });
        }
      }

      const taken = await ocupados(req, b.date);
      const ok = b.action === "block" ? taken.includes(b.time) : !taken.includes(b.time);
      if (!ok) {
        return res.status(500).json({
          error: "A ação não refletiu no calendário. Pode haver uma diferença no formato do storage do agenda.js.",
          taken,
        });
      }
      return res.status(200).json({ taken });
    }

    return res.status(400).json({ error: "Ação desconhecida." });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno." });
  }
};
