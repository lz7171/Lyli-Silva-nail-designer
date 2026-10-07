// Painel: login, abas e carregamento dos dados.
import { $ } from "./util.js";
import { chamar, definirSenha, esquecerSenha, temSenha, quandoExpirar } from "./api.js";
import { E, aplicar } from "./estado.js";
import * as agenda from "./aba-agenda.js";
import * as horarios from "./aba-horarios.js";
import * as site from "./aba-site.js";
import * as lembretes from "./aba-lembretes.js";

const ABAS = { agenda, horarios, site, lembretes };
let sujo = false; // true depois que a página foi aberta (evita apagar o que está sendo digitado)

function mostrarLogin(texto) {
  esquecerSenha();
  $("painel").hidden = true; $("login").hidden = false; $("senha").value = ""; $("erroLogin").textContent = texto || "";
}
function desenharTudo() { Object.values(ABAS).forEach((a) => a.desenhar()); }

async function carregar(silencioso) {
  const { r, j } = await chamar({ method: "GET" });
  if (r.status === 401) { mostrarLogin("Sessão expirada. Entre novamente."); return false; }
  if (!r.ok) return false;
  aplicar(j);
  if (silencioso && sujo) agenda.desenhar(); else desenharTudo();
  return true;
}
const recarregar = () => carregar(false);

function abrirPainel() {
  $("login").hidden = true; $("painel").hidden = false;
  ABAS.agenda.montar($("aba-agenda"), recarregar);
  ABAS.horarios.montar($("aba-horarios"), recarregar);
  ABAS.site.montar($("aba-site"), recarregar);
  ABAS.lembretes.montar($("aba-lembretes"), recarregar);
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
$("sair").onclick = () => mostrarLogin("");
$("atualizar").onclick = () => carregar(false);
quandoExpirar(() => mostrarLogin("Sessão expirada. Entre novamente."));

document.querySelectorAll("#abas button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#abas button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    Object.keys(ABAS).forEach((k) => ($("aba-" + k).hidden = k !== b.dataset.aba));
    window.scrollTo({ top: 0 });
  };
});
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
