// Backend da agenda (Vercel Serverless Function + Upstash Redis)
const TIMES = ["09:30", "14:00", "18:00"];
const key = (d, t) => `lyli:${d}:${t}`;

// Acha as variáveis do Upstash mesmo que o nome/prefixo seja diferente
function config() {
  let url, token;
  for (const k of Object.keys(process.env)) {
    if (!url && /REST_(API_)?URL$/.test(k)) url = process.env[k];
    if (!token && /REST_(API_)?TOKEN$/.test(k)) token = process.env[k];
  }
  return { url, token };
}

let redis;
function getRedis() {
  if (redis) return redis;
  const { url, token } = config();
  if (!url || !token) throw new Error("SEM_BANCO");
  const { Redis } = require("@upstash/redis");
  redis = new Redis({ url, token });
  return redis;
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

// Todos os dias podem receber pedido de agendamento (até 60 dias à frente)
function dataValida(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T12:00:00Z");
  if (isNaN(dt) || dt.toISOString().slice(0, 10) !== d) return false;
  const hoje = agoraSP().date;
  const limite = new Date(new Date(hoje + "T12:00:00Z").getTime() + 60 * 864e5).toISOString().slice(0, 10);
  return d >= hoje && d <= limite;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    // Diagnóstico: abra /api/agenda?status=1 no navegador
    if (req.method === "GET" && req.query.status) {
      const r = getRedis();
      await r.get("lyli:teste");
      return res.status(200).json({ banco: "conectado" });
    }

    if (req.method === "GET") {
      const { date } = req.query;
      if (!dataValida(date)) return res.status(400).json({ error: "Data inválida" });
      const vals = await getRedis().mget(...TIMES.map((t) => key(date, t)));
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
      const ok = await getRedis().set(key(date, time), { name: nome, at: Date.now() }, { nx: true, ex: 60 * 60 * 24 * 70 });
      if (!ok) return res.status(409).json({ error: "Horário já reservado" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    if (e.message === "SEM_BANCO") {
      return res.status(503).json({ error: "Banco de dados não conectado. Na Vercel, conecte o Upstash Redis ao projeto (aba Storage) e faça Redeploy." });
    }
    return res.status(500).json({ error: "Erro no servidor: " + String(e.message || e).slice(0, 160) });
  }
};
