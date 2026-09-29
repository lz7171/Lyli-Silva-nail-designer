// Painel da dona: lista e cancela agendamentos (Vercel Serverless Function + Upstash Redis)
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const SENHA = process.env.ADMIN_PASSWORD || "naildesigneradmin";
const TIMES = ["09:30", "14:00", "18:00"];

function autorizado(req) {
  const enviada = req.headers["x-admin-pass"];
  return typeof enviada === "string" && enviada === SENHA;
}

// Lê o nome guardado, aceitando tanto objeto quanto texto (evita quebrar a listagem)
function lerNome(v) {
  if (!v) return null;
  if (typeof v === "object") return v.name || null;
  try {
    return JSON.parse(v).name || null;
  } catch (e) {
    return String(v);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!autorizado(req)) {
    return res.status(401).json({ error: "Senha incorreta" });
  }

  try {
    if (req.method === "GET") {
      const chaves = await redis.keys("lyli:*");
      if (!chaves || !chaves.length) return res.status(200).json({ agendamentos: [] });

      const valores = await redis.mget(...chaves);
      const agendamentos = chaves
        .map((chave, i) => {
          // chave no formato "lyli:AAAA-MM-DD:HH:MM" — o horário também tem ":", por isso usa regex em vez de split
          const m = chave.match(/^lyli:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
          if (!m) return null;
          const [, date, time] = m;
          if (!TIMES.includes(time)) return null;
          const name = lerNome(valores[i]);
          if (!name) return null;
          return { date, time, name };
        })
        .filter(Boolean)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

      return res.status(200).json({ agendamentos });
    }

    if (req.method === "DELETE") {
      const { date, time } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIMES.includes(time)) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      await redis.del(`lyli:${date}:${time}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
