// Painel: login, menu (☰) e carregamento dos dados.
import { $ } from "./util.js";
import { chamar, definirSenha, esquecerSenha, temSenha, quandoExpirar } from "./api.js";
import { E, aplicar } from "./estado.js";
import { marcarSalvo, pendente, algumPendente } from "./pendente.js";
import * as agenda from "./aba-agenda.js";
import * as horarios from "./aba-horarios.js";
import * as site from "./aba-site.js";
import * as lembretes from "./aba-lembretes.js";

const ABAS = { agenda, horarios, site, lembretes };
const DADO = { horarios: "cfg", lembretes: "cfg", site: "site" }; // o que cada seção edita
const NOMES = { agenda: "Agenda", horarios: "Horários e dias", site: "Site", lembretes: "Lembretes" };
let sujo = false; // true depois que a página foi aberta (evita apagar o que está sendo digitado)

function mostrarLogin(texto) {
  esquecerSenha(); fecharMenu();
  $("painel").hidden = true; $("login").hidden = false; $("senha").value = ""; $("erroLogin").textContent = texto || "";
}
// redesenha só as seções sem alterações pendentes (não apaga o que a pessoa está editando)
function desenharTudo() { Object.entries(ABAS).forEach(([k, a]) => { if (!DADO[k] || !pendente(DADO[k])) a.desenhar(); }); }

// aplica dados novos do servidor, mantendo o que ainda não foi salvo
function aplicarMantendo(j) {
  const cfg = pendente("cfg") ? E.cfg : null, st = pendente("site") ? E.site : null;
  aplicar(j);
  if (cfg) E.cfg = cfg; else marcarSalvo("cfg");
  if (st) E.site = st; else marcarSalvo("site");
}

async function carregar(silencioso) {
  const { r, j } = await chamar({ method: "GET" });
  if (r.status === 401) { mostrarLogin("Sessão expirada. Entre novamente."); return false; }
  if (!r.ok) return false;
  aplicarMantendo(j);
  if (silencioso && sujo) agenda.desenhar(); else desenharTudo();
  return true;
}
const recarregar = () => carregar(false);

// ----- menu escondido -----
function fecharMenu() { $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); }
function abrirMenu() { $("menu").hidden = false; $("menuBtn").setAttribute("aria-expanded", "true"); }
function irPara(aba) {
  if (!ABAS[aba]) aba = "agenda";
  document.querySelectorAll("#menu [data-aba]").forEach((x) => (x.dataset.aba === aba ? x.setAttribute("aria-current", "page") : x.removeAttribute("aria-current")));
  Object.keys(ABAS).forEach((k) => ($("aba-" + k).hidden = k !== aba));
  $("abaAtual").textContent = NOMES[aba];
  fecharMenu();
  window.scrollTo({ top: 0 });
}
$("menuBtn").onclick = (e) => { e.stopPropagation(); $("menu").hidden ? abrirMenu() : fecharMenu(); };
document.querySelectorAll("#menu [data-aba]").forEach((b) => (b.onclick = () => irPara(b.dataset.aba)));
$("menu").querySelector("a").addEventListener("click", fecharMenu);
document.addEventListener("click", (e) => { if (!$("menu").hidden && !$("menu").contains(e.target)) fecharMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharMenu(); });

function abrirPainel() {
  $("login").hidden = true; $("painel").hidden = false;
  ABAS.agenda.montar($("aba-agenda"), recarregar);
  ABAS.horarios.montar($("aba-horarios"), recarregar);
  ABAS.site.montar($("aba-site"), recarregar);
  ABAS.lembretes.montar($("aba-lembretes"), recarregar);
  marcarSalvo("cfg"); marcarSalvo("site");
  irPara("agenda"); // ao entrar, aparece só a agenda
  sujo = true;
}

async function entrar() {
  const tentativa = $("senha").value.trim();
  if (!tentativa) return;
  definirSenha(tentativa, false);
  $("entrar").disabled = true; $("entrar").textContent = "Entrando..."; $("erroLogin").textContent = "";
  const { r, j } = await chamar({ method: "GET" });
  $("entrar").disabled = false; $("entrar").textContent = "Entrar";
  if (r.status === 401) { esquecerSenha(); $("erroLogin").textContent = "Senha incorreta."; return; }
  if (r.status === 429) { esquecerSenha(); $("erroLogin").textContent = j.error || "Muitas tentativas. Aguarde alguns minutos."; return; }
  if (r.status === 503) { esquecerSenha(); $("erroLogin").textContent = j.error || "Painel ainda não configurado."; return; }
  if (!r.ok) { esquecerSenha(); $("erroLogin").textContent = r.status === 0 ? "Sem conexão. Verifique a internet." : "Não foi possível conectar. Tente novamente."; return; }
  definirSenha(tentativa, true);
  aplicar(j); abrirPainel();
}

$("entrar").onclick = entrar;
$("senha").addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
$("sair").onclick = () => {
  if (algumPendente() && !confirm("Você tem alterações não salvas. Sair mesmo assim?")) return;
  mostrarLogin("");
};
$("atualizar").onclick = () => carregar(false);
quandoExpirar(() => mostrarLogin("Sessão expirada. Entre novamente."));

// Ao voltar para a aba do navegador, atualiza só a agenda
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && temSenha() && !$("painel").hidden) carregar(true); });

// Já entrou nesta sessão? Abre direto.
if (temSenha()) {
  chamar({ method: "GET" }).then(({ r, j }) => {
    if (r.ok) { aplicar(j); abrirPainel(); }
    else if (r.status === 503) mostrarLogin(j.error);
    else mostrarLogin(r.status === 401 ? "" : "Não foi possível conectar. Tente novamente.");
  });
}
