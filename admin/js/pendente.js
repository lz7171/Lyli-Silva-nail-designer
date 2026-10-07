// Alterações não salvas: mostra o aviso no botão "Salvar", marca o item no menu
// e pergunta antes de fechar a página. Compara os dados com a última versão salva.
const estado = {}; // chave ("cfg" | "site") -> { base, pegar, raizes:Set }

function checar(chave) {
  const s = estado[chave]; if (!s) return;
  const p = pendente(chave);
  s.raizes.forEach((r) => {
    r.querySelectorAll(".rodapeSalvar").forEach((x) => x.classList.toggle("pendente", p));
    const item = document.querySelector(`#menu [data-aba="${r.id.replace(/^aba-/, "")}"]`);
    if (item) item.classList.toggle("pendente", p);
  });
  const btn = document.getElementById("menuBtn");
  if (btn) btn.classList.toggle("pendente", algumPendente());
}

// raiz = div da seção; pegar = função que devolve os dados editados nela
export function vigiar(chave, raiz, pegar) {
  const s = estado[chave] || (estado[chave] = { base: null, pegar, raizes: new Set() });
  if (s.raizes.has(raiz)) return;
  s.raizes.add(raiz);
  ["input", "change", "click"].forEach((ev) => raiz.addEventListener(ev, () => setTimeout(() => checar(chave), 0)));
}
// chamar depois de salvar ou de carregar dados novos do servidor
export function marcarSalvo(chave) {
  const s = estado[chave]; if (!s) return;
  s.base = JSON.stringify(s.pegar());
  checar(chave);
}
export function pendente(chave) {
  const s = estado[chave];
  return !!s && s.base != null && JSON.stringify(s.pegar()) !== s.base;
}
export const algumPendente = () => Object.keys(estado).some(pendente);

window.addEventListener("beforeunload", (e) => { if (algumPendente()) { e.preventDefault(); e.returnValue = ""; } });
