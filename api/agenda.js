// Backend público da agenda (Vercel Serverless Function + Upstash Redis)
const C = require("../lib/core");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const redis = C.getRedis();

    // Diagnóstico: abra /api/agenda?status=1 para ver se o banco está conectado
    if (req.method === "GET" && req.query && req.query.status) {
      if (!redis) {
        return res.status(200).json({ banco: "nao_conectado", motivo: "Faltam as variáveis do Upstash nesta Vercel. Conecte o Storage (Upstash Redis) a este projeto e faça Redeploy." });
      }
      try {
        await redis.get("lyli:teste");
        return res.status(200).json({ banco: "conectado", horarios: C.TIMES });
      } catch (e) {
        return res.status(200).json({ banco: "erro_ao_conectar", motivo: String((e && e.message) || e).slice(0, 200) });
      }
    }

    if (!redis) return res.status(503).json({ error: "Agenda temporariamente indisponível." });

    if (req.method === "GET") {
      const date = req.query && req.query.date;
      if (!C.dataPublicaValida(date)) return res.status(400).json({ error: "Data inválida" });
      const now = C.agoraSP();
      const bloqueado = await redis.get(C.chaveBloqueio(date));
      if (bloqueado) return res.status(200).json({ times: C.TIMES, taken: C.TIMES, bloqueado: true, now });
      const vals = await redis.mget(...C.TIMES.map((t) => C.chaveAgenda(date, t)));
      const taken = C.TIMES.filter((t, i) => vals[i] !== null && vals[i] !== undefined);
      return res.status(200).json({ times: C.TIMES, taken, now });
    }

    if (req.method === "POST") {
      // Anti-abuso: no máximo 10 tentativas por hora por IP
      const n = await C.contar(redis, `rl:agenda:${C.ipDe(req)}`, 3600);
      if (n > 10) return res.status(429).json({ error: "Muitas tentativas seguidas. Aguarde um pouco ou fale direto pelo WhatsApp." });

      const { date, time, name } = C.corpo(req);
      const nome = C.limparNome(name);
      if (!C.dataPublicaValida(date) || !C.TIMES.includes(time) || nome.length < 2) {
        return res.status(400).json({ error: "Dados inválidos. Confira o dia, o horário e o nome." });
      }
      const bloqueado = await redis.get(C.chaveBloqueio(date));
      if (bloqueado) return res.status(400).json({ error: "Esse dia não está disponível. Escolha outro dia." });
      const ag = C.agoraSP();
      const [h, m] = time.split(":").map(Number);
      if (date === ag.date && h * 60 + m <= ag.min) {
        return res.status(400).json({ error: "Esse horário já passou. Escolha outro." });
      }
      // NX = só grava se o horário ainda estiver livre (operação atômica)
      const ok = await redis.set(C.chaveAgenda(date, time), { name: nome, at: Date.now() }, { nx: true, ex: C.ttlPara(date, 45) });
      if (!ok) return res.status(409).json({ error: "Horário já reservado" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    console.error("agenda:", e);
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
