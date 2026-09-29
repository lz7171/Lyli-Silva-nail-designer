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
      if (bloqueado) return res.status(200).json({ times: C.TIMES, taken: C.TIMES, bloqueado: true, now, tk: C.gerarTk() });
      const vals = await redis.mget(...C.TIMES.map((t) => C.chaveAgenda(date, t)));
      const taken = C.TIMES.filter((t, i) => vals[i] !== null && vals[i] !== undefined);
      return res.status(200).json({ times: C.TIMES, taken, now, tk: C.gerarTk() });
    }

    if (req.method === "POST") {
      if (!C.origemOk(req)) return res.status(403).json({ error: "Pedido não autorizado." });

      // Anti-abuso 1: no máximo 12 tentativas por hora por IP
      const ip = C.ipDe(req);
      const n = await C.contar(redis, `rl:agenda:${ip}`, 3600);
      if (n > 12) return res.status(429).json({ error: "Muitas tentativas seguidas. Aguarde um pouco ou fale direto pelo WhatsApp." });

      const b = C.corpo(req);

      // Anti-abuso 2: campo-isca invisível. Pessoa não vê, robô preenche. Finge sucesso e não grava nada.
      if (b.cupom_extra) return res.status(200).json({ ok: true });

      // Anti-abuso 3: o pedido precisa ter vindo da página do site (token assinado, com idade mínima)
      if (!C.tkValido(b.tk, 1200, 3 * 3600 * 1000)) {
        return res.status(400).json({ code: "tk", error: "Atualizamos os horários. Toque em confirmar novamente." });
      }

      const { date, time } = b;
      const nome = C.limparNome(b.name);
      const fone = C.normalizarTelefone(b.phone);
      if (!C.dataPublicaValida(date) || !C.TIMES.includes(time)) {
        return res.status(400).json({ error: "Dia ou horário inválido. Escolha novamente." });
      }
      if (!C.nomeValido(nome)) return res.status(400).json({ error: "Digite seu nome (apenas letras)." });
      if (!fone) return res.status(400).json({ error: "Digite seu WhatsApp com DDD. Ex.: (21) 96851-3808." });

      // Anti-abuso 4: limite de agendamentos por WhatsApp (3 a cada 7 dias) e por IP (4 por dia)
      const kIp = `rl:ok:ip:${ip}`, kTel = `rl:ok:tel:${fone}`;
      if ((await C.passouDoLimite(redis, kIp, 4)) || (await C.passouDoLimite(redis, kTel, 3))) {
        return res.status(429).json({ error: "Você já fez vários agendamentos recentes. Para marcar mais, chame a Lyli no WhatsApp." });
      }

      const bloqueado = await redis.get(C.chaveBloqueio(date));
      if (bloqueado) return res.status(400).json({ error: "Esse dia não está disponível. Escolha outro dia." });
      const ag = C.agoraSP();
      const [h, m] = time.split(":").map(Number);
      if (date === ag.date && h * 60 + m <= ag.min) {
        return res.status(400).json({ error: "Esse horário já passou. Escolha outro." });
      }
      // NX = só grava se o horário ainda estiver livre (operação atômica)
      const ok = await redis.set(C.chaveAgenda(date, time), { name: nome, phone: fone, at: Date.now() }, { nx: true, ex: C.ttlPara(date, 45) });
      if (!ok) return res.status(409).json({ error: "Horário já reservado" });
      await C.contar(redis, kIp, 86400);
      await C.contar(redis, kTel, 7 * 86400);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    console.error("agenda:", e);
    return res.status(500).json({ error: "Erro no servidor" });
  }
};
