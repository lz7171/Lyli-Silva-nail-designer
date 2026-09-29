// Painel da dona: lista, cancela, agenda manualmente e bloqueia dias
// (Vercel Serverless Function + Upstash Redis)
const C = require("../lib/core");

// IMPORTANTE: defina ADMIN_PASSWORD na Vercel (Settings > Environment Variables).
// O valor abaixo só existe para o painel não parar caso a variável falte.
const SENHA = String(process.env.ADMIN_PASSWORD || "naildesigneradmin").trim();

const RE_AG = /^lyli:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/;
const RE_BL = /^lyli:bloqueio:(\d{4}-\d{2}-\d{2})$/;

function senhaCorreta(req) {
  const bruta = req.headers["x-admin-pass"];
  if (typeof bruta !== "string" || !bruta) return false;
  let dec = bruta;
  try { dec = decodeURIComponent(bruta); } catch (e) {}
  return C.igual(dec.trim(), SENHA) || C.igual(bruta.trim(), SENHA);
}

async function listarChaves(redis) {
  const achadas = new Set();
  let cursor = "0";
  for (let i = 0; i < 200; i++) {
    const [prox, lote] = await redis.scan(cursor, { match: "lyli:*", count: 500 });
    (lote || []).forEach((k) => achadas.add(k));
    cursor = String(prox);
    if (cursor === "0") break;
  }
  return [...achadas];
}

function dataAdminOk(d) {
  if (!C.dataReal(d)) return "Data inválida";
  const hoje = C.agoraSP().date;
  if (d < hoje) return "Essa data já passou";
  if (d > C.somarDias(hoje, C.JANELA_ADMIN_DIAS)) return "Data muito distante";
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const redis = C.getRedis();
    if (!redis) return res.status(503).json({ error: "Banco de dados não conectado." });

    // Proteção contra adivinhar a senha: 10 erros = 15 min de espera
    const chaveErro = `rl:admin:${C.ipDe(req)}`;
    if (await C.passouDoLimite(redis, chaveErro, 10)) {
      return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    }
    if (!senhaCorreta(req)) {
      await C.contar(redis, chaveErro, 900);
      return res.status(401).json({ error: "Senha incorreta" });
    }

    if (req.method === "GET") {
      const hoje = C.agoraSP().date;
      const chaves = await listarChaves(redis);
      const agChaves = chaves.filter((k) => RE_AG.test(k));
      const bloqueios = chaves.map((k) => (k.match(RE_BL) || [])[1]).filter((d) => d && d >= hoje).sort();

      const agendamentos = [];
      for (let i = 0; i < agChaves.length; i += 100) {
        const lote = agChaves.slice(i, i + 100);
        const vals = await redis.mget(...lote);
        lote.forEach((chave, j) => {
          const [, date, time] = chave.match(RE_AG);
          const v = C.lerValor(vals[j]);
          if (!v || !v.name) return;
          agendamentos.push({ date, time, name: String(v.name), phone: v.phone ? String(v.phone) : null, at: v.at || null });
        });
      }
      agendamentos.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return res.status(200).json({ agendamentos, bloqueios, hoje, times: C.TIMES });
    }

    if (req.method === "POST" || req.method === "DELETE") {
      const body = C.corpo(req);
      const acao = body.action || (req.method === "DELETE" ? "cancelar" : "");

      if (acao === "bloquear") {
        const erro = dataAdminOk(body.date);
        if (erro) return res.status(400).json({ error: erro });
        await redis.set(C.chaveBloqueio(body.date), { at: Date.now() }, { ex: C.ttlPara(body.date, 2) });
        return res.status(200).json({ ok: true });
      }

      if (acao === "desbloquear") {
        if (!C.dataReal(body.date)) return res.status(400).json({ error: "Data inválida" });
        await redis.del(C.chaveBloqueio(body.date));
        return res.status(200).json({ ok: true });
      }

      if (acao === "reservar") {
        const { date, time } = body;
        const nome = C.limparNome(body.name);
        if (!C.TIMES.includes(time) || nome.length < 2) return res.status(400).json({ error: "Dados inválidos" });
        const erro = dataAdminOk(date);
        if (erro) return res.status(400).json({ error: erro });
        if (await redis.get(C.chaveBloqueio(date))) {
          return res.status(400).json({ error: "Esse dia está bloqueado. Desbloqueie antes de agendar." });
        }
        const ok = await redis.set(C.chaveAgenda(date, time), { name: nome, at: Date.now() }, { nx: true, ex: C.ttlPara(date, 45) });
        if (!ok) return res.status(409).json({ error: "Horário já reservado" });
        return res.status(200).json({ ok: true });
      }

      if (acao === "cancelar") {
        const { date, time } = body;
        if (!C.dataReal(date) || !/^\d{2}:\d{2}$/.test(String(time))) return res.status(400).json({ error: "Dados inválidos" });
        await redis.del(C.chaveAgenda(date, time));
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Ação inválida" });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    console.error("admin:", e);
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
