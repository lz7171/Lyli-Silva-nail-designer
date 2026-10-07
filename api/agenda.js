// Backend público da agenda (Vercel Serverless Function + Upstash Redis)
const C = require("../lib/core");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const redis = C.getRedis();
    const q = req.query || {};

    // Diagnóstico: abra /api/agenda?status=1 para ver se o banco está conectado
    if (req.method === "GET" && q.status) {
      if (!redis) return res.status(200).json({ banco: "nao_conectado", motivo: "Faltam as variáveis do Upstash nesta Vercel. Conecte o Storage (Upstash Redis) a este projeto e faça Redeploy." });
      try {
        await redis.get("lyli:teste");
        return res.status(200).json({ banco: "conectado", horarios: C.todasHoras(await C.carregarCfg(redis)) });
      } catch (e) {
        console.error("agenda status:", e);
        return res.status(200).json({ banco: "erro_ao_conectar", motivo: "O banco não respondeu. Veja os logs da Vercel ou abra /api/health." });
      }
    }

    if (!redis) return res.status(503).json({ error: "Agenda temporariamente indisponível." });
    const cfg = await C.carregarCfg(redis);

    // Configuração pública + calendário: [data, restrito(0/1)] só dos dias com atendimento
    if (req.method === "GET" && q.config) {
      const hoje = C.agoraSP().date, dias = [];
      for (let i = 0; i <= cfg.janela; i++) {
        const d = C.somarDias(hoje, i), inf = C.infoDia(cfg, d);
        if (inf.atende) dias.push([d, inf.restrito ? 1 : 0]);
      }
      const { online, pausaMsg, aviso, lead, wa, maps } = cfg;
      return res.status(200).json({ online, pausaMsg, aviso, lead, wa, maps, hoje, dias });
    }

    if (req.method === "GET") {
      const date = q.date;
      if (!C.dataReal(date)) return res.status(400).json({ error: "Data inválida" });
      // Anti-abuso: robô consultando sem parar gastaria a cota do banco (generoso: uma cliente real nunca chega perto)
      if ((await C.contar(redis, `rl:consulta:${C.ipDe(req)}`, 3600)) > 300) return res.status(429).json({ error: "Muitas consultas seguidas. Aguarde alguns minutos ou fale direto pelo WhatsApp." });
      const now = C.agoraSP(), tk = C.gerarTk();
      // Dia indisponível: devolve os horários todos como ocupados. (Se a lista fosse vazia,
      // a página inicial reaproveitaria os horários do último dia e mostraria como livres.)
      const indisponivel = (extra) => { const t = C.infoDia(cfg, date).times; return res.status(200).json({ times: t, taken: t, bloqueado: true, ...extra, now, tk }); };
      const inf = C.diaPublico(cfg, date);
      if (!inf) return indisponivel({ foraDaAgenda: true });
      if (!cfg.online) return indisponivel({ pausado: true });
      if (inf.restrito) return indisponivel({ restrito: true });
      if (await redis.get(C.chaveBloqueio(date))) return res.status(200).json({ times: inf.times, taken: inf.times, bloqueado: true, now, tk });
      const vals = await redis.mget(...inf.times.map((t) => C.chaveAgenda(date, t)));
      const taken = inf.times.filter((t, i) => vals[i] !== null && vals[i] !== undefined);
      return res.status(200).json({ times: inf.times, taken, now, tk });
    }

    if (req.method === "POST") {
      if (!C.origemOk(req)) return res.status(403).json({ error: "Pedido não autorizado." });

      // Anti-abuso 1: no máximo 12 tentativas por hora por IP
      const ip = C.ipDe(req);
      const n = await C.contar(redis, `rl:agenda:${ip}`, 3600);
      if (n > 12) return res.status(429).json({ error: "Muitas tentativas seguidas. Aguarde um pouco ou fale direto pelo WhatsApp." });

      const b = C.corpo(req);

      // Anti-abuso 2: campo-isca invisível (robô preenche). Finge sucesso e não grava nada.
      if (b.cupom_extra) return res.status(200).json({ ok: true });

      // Anti-abuso 3: token assinado entregue pela página do site, com idade mínima
      if (!C.tkValido(b.tk, 1200, 3 * 3600 * 1000)) {
        return res.status(400).json({ code: "tk", error: "Atualizamos os horários. Toque em confirmar novamente." });
      }

      if (!cfg.online) return res.status(503).json({ error: cfg.pausaMsg });

      const { date, time } = b;
      const inf = C.diaPublico(cfg, date);
      if (!inf || !inf.times.includes(time)) return res.status(400).json({ error: "Dia ou horário inválido. Escolha novamente." });
      if (inf.restrito) return res.status(400).json({ error: "Essa data é atendida somente pela Lyli no WhatsApp." });

      const nome = C.limparNome(b.name);
      const fone = C.normalizarTelefone(b.phone);
      if (!C.nomeValido(nome)) return res.status(400).json({ error: "Digite seu nome (apenas letras)." });
      if (!fone) return res.status(400).json({ error: "Digite seu WhatsApp com DDD. Ex.: (21) 96851-3808." });

      // Anti-abuso 4: limite por WhatsApp (3 a cada 7 dias) e por IP (4 por dia)
      const kIp = `rl:ok:ip:${ip}`, kTel = `rl:ok:tel:${fone}`;
      if ((await C.passouDoLimite(redis, kIp, 4)) || (await C.passouDoLimite(redis, kTel, 3))) {
        return res.status(429).json({ error: "Você já fez vários agendamentos recentes. Para marcar mais, chame a Lyli no WhatsApp." });
      }

      if (await redis.get(C.chaveBloqueio(date))) return res.status(400).json({ error: "Esse dia não está disponível. Escolha outro dia." });
      const ag = C.agoraSP();
      const [h, m] = time.split(":").map(Number);
      if (date === ag.date && h * 60 + m <= ag.min) return res.status(400).json({ error: "Esse horário já passou. Escolha outro." });

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
