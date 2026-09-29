// Painel da dona: lista, cancela, agenda manualmente e bloqueia dias
// (Vercel Serverless Function + Upstash Redis)
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const SENHA = process.env.ADMIN_PASSWORD || "naildesigneradmin";
const TIMES = ["09:30", "14:00", "18:00"];
const chaveAgenda = (d, t) => `lyli:${d}:${t}`;
const chaveBloqueio = (d) => `lyli:bloqueio:${d}`;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function autorizado(req) {
  const enviada = req.headers["x-admin-pass"];
  return typeof enviada === "string" && enviada === SENHA;
}

function agoraSP() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const o = {};
  p.forEach((x) => (o[x.type] = x.value));
  return { date: `${o.year}-${o.month}-${o.day}`, min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
}

// Lê o valor guardado, aceitando objeto ou texto (evita quebrar a listagem)
function lerValor(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch (e) { return { name: String(v) }; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!autorizado(req)) {
    return res.status(401).json({ error: "Senha incorreta" });
  }

  try {
    if (req.method === "GET") {
      const chaves = await redis.keys("lyli:*");
      if (!chaves || !chaves.length) return res.status(200).json({ agendamentos: [], bloqueios: [] });

      const valores = await redis.mget(...chaves);
      const agendamentos = [];
      const bloqueios = [];

      chaves.forEach((chave, i) => {
        const m1 = chave.match(/^lyli:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
        if (m1) {
          const [, date, time] = m1;
          if (!TIMES.includes(time)) return;
          const v = lerValor(valores[i]);
          if (!v || !v.name) return;
          agendamentos.push({ date, time, name: v.name, at: v.at || null });
          return;
        }
        const m2 = chave.match(/^lyli:bloqueio:(\d{4}-\d{2}-\d{2})$/);
        if (m2) bloqueios.push(m2[1]);
      });

      agendamentos.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      bloqueios.sort();

      return res.status(200).json({ agendamentos, bloqueios });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const acao = body.action;

      if (acao === "bloquear") {
        const { date } = body;
        if (!RE_DATA.test(date)) return res.status(400).json({ error: "Data inválida" });
        if (date < agoraSP().date) return res.status(400).json({ error: "Essa data já passou" });
        await redis.set(chaveBloqueio(date), { at: Date.now() });
        return res.status(200).json({ ok: true });
      }

      if (acao === "reservar") {
        const { date, time, name } = body;
        const nome = String(name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);
        if (!RE_DATA.test(date) || !TIMES.includes(time) || nome.length < 2) {
          return res.status(400).json({ error: "Dados inválidos" });
        }
        if (date < agoraSP().date) return res.status(400).json({ error: "Essa data já passou" });
        const bloqueado = await redis.get(chaveBloqueio(date));
        if (bloqueado) return res.status(400).json({ error: "Esse dia está bloqueado. Desbloqueie antes de agendar." });
        const ok = await redis.set(chaveAgenda(date, time), { name: nome, at: Date.now() }, { nx: true, ex: 60 * 60 * 24 * 70 });
        if (!ok) return res.status(409).json({ error: "Horário já reservado" });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Ação inválida" });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      const acao = body.action || "cancelar";

      if (acao === "desbloquear") {
        const { date } = body;
        if (!RE_DATA.test(date)) return res.status(400).json({ error: "Data inválida" });
        await redis.del(chaveBloqueio(date));
        return res.status(200).json({ ok: true });
      }

      // cancelar (padrão)
      const { date, time } = body;
      if (!RE_DATA.test(date) || !TIMES.includes(time)) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      await redis.del(chaveAgenda(date, time));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
