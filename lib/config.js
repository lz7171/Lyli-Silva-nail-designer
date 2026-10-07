"use strict";
// Configuração da agenda (horários, dias, períodos especiais, lembretes).
// Os valores abaixo são só o PADRÃO INICIAL. Depois, tudo é editado em /admin.
const { RE_HORA, RE_MD, agoraSP, somarDias, dataReal, meioDia } = require("./datas");
const { K } = require("./redis");
const { txt } = require("./util");

const JANELA_ADMIN_DIAS = 180; // quantos dias à frente o painel aceita
const MSG_LEMBRETE_PADRAO =
  "Oi, linda! 💕 Passando para lembrar que seu horário está agendado comigo! ✨\n\n" +
  "📅 Data: {data}\n⏰ Horário: {hora}\n\nTe espero! 🥰";

const DEFAULT_CFG = {
  online: true,
  pausaMsg: "Agendamento online pausado. Fale direto com a Lyli no WhatsApp.",
  times: ["09:30", "14:30", "17:00"],
  dias: [2, 3, 4, 5, 6], // terça a sábado
  janela: 60,
  // Períodos especiais (repetem todo ano). Dezembro: 4 horários, todos os dias, restrito a partir do dia 11.
  regras: [{ nome: "Dezembro", de: "12-01", ate: "12-31", times: ["08:00", "11:30", "14:30", "17:30"], dias: [0, 1, 2, 3, 4, 5, 6], restritoDesde: "12-11" }],
  wa: "5521968513808",
  aviso: "",
  lead: "Escolha o dia e o horário e confirme direto no WhatsApp.",
  maps: "https://maps.app.goo.gl/cFfbbowAwcHpBYVq6?g_st=iw",
  syncCalendario: false, // true = a página inicial passa a obedecer dias/janela configurados
  lembrete: { ativo: true, quando: "dia_anterior", msg: MSG_LEMBRETE_PADRAO },
};

function listaHoras(v) {
  const a = (Array.isArray(v) ? v : String(v || "").split(/[\s,;]+/)).map((x) => {
    x = String(x).trim().toLowerCase().replace(/^(\d{1,2})h(\d{2})?$/, (m, h, mi) => h + ":" + (mi || "00"));
    return /^\d:\d{2}$/.test(x) ? "0" + x : x;
  }).filter((x) => RE_HORA.test(x));
  return [...new Set(a)].sort().slice(0, 12);
}
function listaDias(v) { return [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => n >= 0 && n <= 6))].sort(); }

function limparCfg(x) {
  x = x && typeof x === "object" ? x : {};
  const d = DEFAULT_CFG;
  const times = listaHoras(x.times);
  const regras = (Array.isArray(x.regras) ? x.regras : d.regras).slice(0, 12).map((r) => ({
    nome: txt(r && r.nome, "", 40),
    de: r && RE_MD.test(r.de) ? r.de : null, ate: r && RE_MD.test(r.ate) ? r.ate : null,
    times: listaHoras(r && r.times), dias: listaDias(r && r.dias),
    restritoDesde: r && RE_MD.test(r.restritoDesde) ? r.restritoDesde : null,
  })).filter((r) => r.de && r.ate && r.times.length && r.dias.length);
  let w = String(x.wa || "").replace(/\D/g, "");
  if (w.length === 10 || w.length === 11) w = "55" + w;
  if (w.length < 12 || w.length > 13) w = d.wa;
  const l = x.lembrete && typeof x.lembrete === "object" ? x.lembrete : {};
  return {
    online: x.online !== false, pausaMsg: txt(x.pausaMsg, d.pausaMsg, 160) || d.pausaMsg,
    times: times.length ? times : d.times,
    dias: Array.isArray(x.dias) ? listaDias(x.dias) : d.dias,
    janela: Math.min(365, Math.max(1, parseInt(x.janela, 10) || d.janela)),
    regras, wa: w, aviso: txt(x.aviso, "", 200), lead: txt(x.lead, d.lead, 160) || d.lead,
    maps: typeof x.maps === "string" && /^https:\/\//.test(x.maps.trim()) ? x.maps.trim().slice(0, 300) : d.maps,
    syncCalendario: x.syncCalendario === true,
    lembrete: {
      ativo: l.ativo !== false,
      quando: l.quando === "mesmo_dia" ? "mesmo_dia" : "dia_anterior",
      msg: txt(l.msg, MSG_LEMBRETE_PADRAO, 1000) || MSG_LEMBRETE_PADRAO,
    },
  };
}
// Confere o que a Lyli digitou ANTES de salvar e devolve um texto de erro claro (ou null se está tudo certo).
// Sem isso, períodos incompletos eram descartados em silêncio e valores inválidos viravam o padrão.
function validarCfg(x) {
  if (!x || typeof x !== "object") return "Configuração inválida.";
  // só confere o que veio (o painel sempre manda tudo; chamadas parciais continuam aceitas)
  if (x.times !== undefined && !listaHoras(x.times).length) return "Deixe ao menos um horário padrão.";
  if (x.dias !== undefined && (!Array.isArray(x.dias) || !listaDias(x.dias).length)) return "Marque ao menos um dia de atendimento.";
  if (x.janela !== undefined) { const j = Number(x.janela); if (!Number.isInteger(j) || j < 1 || j > 365) return "O prazo para agendar deve ser de 1 a 365 dias."; }
  const regras = Array.isArray(x.regras) ? x.regras : [];
  for (let i = 0; i < regras.length; i++) {
    const r = regras[i] || {}, nome = (r.nome && String(r.nome).trim()) || `Período ${i + 1}`;
    if (!RE_MD.test(r.de) || !RE_MD.test(r.ate)) return `${nome}: confira as datas de início e fim.`;
    if (!listaHoras(r.times).length) return `${nome}: coloque ao menos um horário (ou remova o período).`;
    if (!listaDias(r.dias).length) return `${nome}: marque ao menos um dia da semana (ou remova o período).`;
    if (r.restritoDesde && !RE_MD.test(r.restritoDesde)) return `${nome}: a data do "só pelo WhatsApp" é inválida.`;
  }
  const dias = (r) => { const s = new Set(); for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) { const md = String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); if (dentro(md, r.de, r.ate)) s.add(md); } return s; };
  for (let i = 0; i < regras.length; i++) for (let k = i + 1; k < regras.length; k++) {
    const a = dias(regras[i]), b = dias(regras[k]);
    if ([...a].some((md) => b.has(md))) return `Os períodos "${regras[i].nome || i + 1}" e "${regras[k].nome || k + 1}" se sobrepõem. Ajuste as datas para um não invadir o outro.`;
  }
  return null;
}
async function carregarCfg(redis) {
  try { const v = await redis.get(K.config); return limparCfg(typeof v === "string" ? JSON.parse(v) : v); }
  catch (e) { return limparCfg(null); }
}

const dentro = (md, de, ate) => (de <= ate ? md >= de && md <= ate : md >= de || md <= ate);
// Regras do dia: horários, se atende, e se é "restrito" (sem agendamento livre pelo site)
function infoDia(cfg, date) {
  const md = date.slice(5), dow = meioDia(date).getUTCDay();
  const r = cfg.regras.find((x) => dentro(md, x.de, x.ate));
  return {
    times: r ? r.times : cfg.times,
    atende: (r ? r.dias : cfg.dias).includes(dow),
    restrito: !!(r && r.restritoDesde && r.de <= r.ate && md >= r.restritoDesde),
  };
}
// Dia que o site pode mostrar (dentro da janela e com atendimento); devolve infoDia ou null
function diaPublico(cfg, d) {
  if (!dataReal(d)) return null;
  const hoje = agoraSP().date;
  if (d < hoje || d > somarDias(hoje, cfg.janela)) return null;
  const inf = infoDia(cfg, d);
  return inf.atende ? inf : null;
}
function todasHoras(cfg) { return [...new Set([...cfg.times, ...cfg.regras.flatMap((r) => r.times)])].sort(); }
// Lista de dias com atendimento na janela: [[data, restrito(0/1)], ...]
function diasComAtendimento(cfg) {
  const hoje = agoraSP().date, dias = [];
  for (let i = 0; i <= cfg.janela; i++) {
    const d = somarDias(hoje, i), inf = infoDia(cfg, d);
    if (inf.atende) dias.push([d, inf.restrito ? 1 : 0]);
  }
  return dias;
}
module.exports = {
  JANELA_ADMIN_DIAS, MSG_LEMBRETE_PADRAO, DEFAULT_CFG,
  listaHoras, listaDias, limparCfg, validarCfg, carregarCfg, infoDia, diaPublico, todasHoras, diasComAtendimento,
};
