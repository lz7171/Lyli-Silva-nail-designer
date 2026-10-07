// Funções de apoio do painel (sem dependências).
export const $ = (id) => document.getElementById(id);
export const pad = (n) => String(n).padStart(2, "0");
export const rotulo = (t) => { const [h, m] = t.split(":"); return Number(h) + "h" + (m === "00" ? "" : m); };
export const SEMANA_CURTA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const SEMANA_LONGA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dataExtensa(s) {
  const d = new Date(s + "T12:00:00Z");
  return `${SEMANA_LONGA[d.getUTCDay()]}, ${pad(d.getUTCDate())} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
export const dataBR = (s) => s.split("-").reverse().join("/");
export function foneBonito(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
export function quando(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d)) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", " às");
}
export const somarDiasISO = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

// Cria elementos sem usar innerHTML (texto das clientes nunca vira código).
export function h(tag, attrs, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (["value", "checked", "disabled", "selected"].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  filhos.flat(Infinity).forEach((c) => { if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
  return e;
}
let tToast;
export function toast(texto, erro) {
  const t = $("toast");
  t.textContent = texto; t.className = erro ? "erro" : ""; t.hidden = false;
  clearTimeout(tToast); tToast = setTimeout(() => (t.hidden = true), erro ? 5000 : 2600);
}
// Botão que mostra "..." enquanto a ação roda
export async function ocupado(botao, textoEnquanto, fn) {
  const antes = botao.textContent;
  botao.disabled = true; botao.textContent = textoEnquanto;
  try { return await fn(); } finally { botao.disabled = false; botao.textContent = antes; }
}

// Horários válidos de uma data (mesma regra do servidor: período especial > padrão)
export function horariosDoDia(cfg, date) {
  const md = date.slice(5);
  const dentro = (de, ate) => (de <= ate ? md >= de && md <= ate : md >= de || md <= ate);
  const r = (cfg.regras || []).find((x) => dentro(x.de, x.ate));
  return r ? r.times : cfg.times;
}
