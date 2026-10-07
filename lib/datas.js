"use strict";
// Utilitários de data (sempre no fuso de São Paulo).
const TZ = "America/Sao_Paulo";
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function agoraSP() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const o = {};
  p.forEach((x) => (o[x.type] = x.value));
  return { date: `${o.year}-${o.month}-${o.day}`, min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
}
const meioDia = (d) => new Date(d + "T12:00:00Z");
function somarDias(d, n) { return new Date(meioDia(d).getTime() + n * 864e5).toISOString().slice(0, 10); }
function diasEntre(a, b) { return Math.round((meioDia(b) - meioDia(a)) / 864e5); }
function dataReal(d) {
  if (typeof d !== "string" || !RE_DATA.test(d)) return false;
  const dt = meioDia(d);
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === d;
}
// Tempo de vida da chave: até a data + folga (nunca expira antes do dia do atendimento)
function ttlPara(date, folgaDias) {
  const dias = Math.max(0, diasEntre(agoraSP().date, date));
  return (dias + folgaDias) * 86400;
}
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataBR = (d) => d.split("-").reverse().join("/"); // 2026-10-08 -> 08/10/2026
const diaSemana = (d) => SEMANA[meioDia(d).getUTCDay()];

module.exports = { TZ, RE_DATA, RE_HORA, RE_MD, agoraSP, meioDia, somarDias, diasEntre, dataReal, ttlPara, dataBR, diaSemana, SEMANA };
