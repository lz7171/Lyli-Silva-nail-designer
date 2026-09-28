// api/admin.js — backend da área admin (Vercel Serverless Function)
//
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   ADMIN_PASSWORD  senha do painel
//   ADMIN_SECRET    texto aleatório longo (mín. 16 caracteres) que assina a sessão
// Para "Liberar" horário (opcional se o seu agenda.js usa Upstash/Vercel KV):
//   KV_REST_API_URL + KV_REST_API_TOKEN  (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

const crypto = require("crypto");

const TIMES = ["09:30", "14:00", "18:00"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_MS = 8 * 60 * 60 * 1000; // sessão dura 8h
const fails = new Map(); // limite de tentativas por IP (melhor esforço)

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SENHA DE TESTE: troque depois criando ADMIN_PASSWORD e ADMIN_SECRET na Vercel
const SENHA = () => process.env.ADMIN_PASSWORD || "teste123";
const secret = () => process.env.ADMIN_SECRET || "segredo-de-teste-troque-isto-1234";
const sign = (p) => crypto.createHmac("sha256", secret()).update(p).digest("base64url");

function makeToken() {
  const p = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString("base64url");
  return p + "." + sign(p);
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

// ---- leitura/escrita usando a própria API pública do site (/api/agenda) ----
const base = (req) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

async function ocupados(req, date) {
  const r = await fetch(`${base(req)}/api/agenda?date=${date}`, { cache: "no-store" });
  const j = await r.json();
  return j.taken || [];
}

async function bloquear(req, date, time) {
  const r = await fetch(`${base(req)}/api/agenda`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, time, name: "BLOQUEADO (admin)" }),
  });
  return r.status; // 200 ok, 409 já ocupado
}

// ---- liberar horário: precisa mexer no armazenamento (Upstash Redis REST) ----
const KV_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(KV_URL(), {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN()}` },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function liberar(date, time) {
  if (!KV_URL() || !KV_TOKEN()) throw new Error("sem-storage");
  // Formatos de chave mais comuns. Ajuste aqui se o seu agenda.js usar outro.
  const porDia = [`agenda:${date}`, `agenda-${date}`, `agenda_${date}`, date];
  const porHorario = [`agenda:${date}:${time}`, `agenda:${date}T${time}`, `agenda:${date}-${time}`];

  for (const key of porHorario) {
    if ((await redis(["TYPE", key])) !== "none") await redis(["DEL", key]);
  }
  for (const key of porDia) {
    const type = await redis(["TYPE", key]);
    if (type === "hash") await redis(["HDEL", key, time]);
    else if (type === "set") await redis(["SREM", key, time]);
    else if (type === "string") {
      const raw = await redis(["GET", key]);
      let v;
      try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { continue; }
      if (Array.isArray(v)) v = v.filter((x) => (typeof x === "string" ? x : x && x.time) !== time);
      else if (v && typeof v === "object") delete v[time];
      await redis(["SET", key, JSON.stringify(v)]);
    }
  }
}

// ---- handler ----
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const b = req.body || {};

  // login
  if (b.action === "login") {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
    const f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });

    const ok = crypto.timingSafeEqual(sha(b.password || ""), sha(SENHA()));
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

  // tudo abaixo exige sessão válida
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
        const st = await bloquear(req, b.date, b.time);
        if (st !== 200 && st !== 409) return res.status(502).json({ error: "Não foi possível bloquear agora." });
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
      const deuCerto = b.action === "block" ? taken.includes(b.time) : !taken.includes(b.time);
      if (!deuCerto) {
        return res.status(500).json({
          error: "A ação não refletiu no calendário. O formato de armazenamento do agenda.js pode ser diferente — me envie esse arquivo para eu ajustar.",
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
