// Backend da agenda (Vercel Serverless Function + Upstash Redis)
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TIMES = ["09:30", "14:00", "18:00"];
const key = (d, t) => `lyli:${d}:${t}`;

function agoraSP() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const o = {};
  p.forEach((x) => (o[x.type] = x.value));
  return { date: `${o.year}-${o.month}-${o.day}`, min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
}

function dataValida(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T12:00:00Z");
  if (isNaN(dt) || dt.toISOString().slice(0, 10) !== d) return false;
  const dow = dt.getUTCDay();
  if (dow < 2 || dow > 6) return false; // terça a sábado
  const hoje = agoraSP().date;
  const limite = new Date(new Date(hoje + "T12:00:00Z").getTime() + 60 * 864e5).toISOString().slice(0, 10);
  return d >= hoje && d <= limite;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const { date } = req.query;
      if (!dataValida(date)) return res.status(400).json({ error: "Data inválida" });
      const vals = await redis.mget(...TIMES.map((t) => key(date, t)));
      return res.status(200).json({ taken: TIMES.filter((t, i) => vals[i] !== null && vals[i] !== undefined) });
    }

    if (req.method === "POST") {
      const { date, time, name } = req.body || {};
      const nome = String(name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);
      if (!dataValida(date) || !TIMES.includes(time) || nome.length < 2) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      const ag = agoraSP();
      const [h, m] = time.split(":").map(Number);
      if (date === ag.date && h * 60 + m <= ag.min) {
        return res.status(400).json({ error: "Esse horário já passou" });
      }
      // NX = só grava se o horário ainda estiver livre (operação atômica)
      const ok = await redis.set(key(date, time), { name: nome, at: Date.now() }, { nx: true, ex: 60 * 60 * 24 * 70 });
      if (!ok) return res.status(409).json({ error: "Horário já reservado" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
