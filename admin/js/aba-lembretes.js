// Aba "Lembretes": mensagem automática por WhatsApp.
import { h, dataBR, foneBonito, quando, toast, ocupado } from "./util.js";
import { acao, erroDe } from "./api.js";
import { E } from "./estado.js";

let raiz, recarregar = () => {};
export function montar(el, aoSalvar) { raiz = el; recarregar = aoSalvar; desenhar(); }

const EXEMPLO = { nome: "Maria", data: "08/10/2026", hora: "14:30", dia_semana: "quinta-feira" };
const previa = (t) => t.replace(/\{(nome|data|hora|dia_semana)\}/g, (m, k) => EXEMPLO[k]);

export function desenhar() {
  if (!raiz || !E.cfg) return;
  const l = E.cfg.lembrete, L = E.lembretes;
  const pv = h("div", { class: "previa" }, previa(l.msg));
  const area = h("textarea", { maxlength: "1000", oninput: (e) => { l.msg = e.target.value; pv.textContent = previa(l.msg); } }, l.msg);
  const inserir = (v) => { const a = area, i = a.selectionStart ?? a.value.length; a.setRangeText(v, i, a.selectionEnd ?? i, "end"); a.dispatchEvent(new Event("input")); a.focus(); };

  const msg = h("p", { class: "msg" });
  const salvar = h("button", { type: "button", class: "btn wide" }, "Salvar lembretes");
  salvar.onclick = () => ocupado(salvar, "Salvando...", async () => {
    msg.className = "msg";
    if (!l.msg.trim()) { msg.textContent = "A mensagem não pode ficar vazia."; return; }
    const { r, j } = await acao({ action: "salvarConfig", cfg: E.cfg });
    const erro = erroDe(r, j, "Não foi possível salvar.");
    if (erro) { msg.textContent = erro; return; }
    E.cfg = j.cfg; toast("Lembretes salvos."); recarregar();
  });

  // enviar agora
  const resultado = h("p", { class: "msg" });
  const enviar = h("button", { type: "button", class: "btn out" }, `Enviar agora os lembretes de ${dataBR(L.proximaData)}`);
  enviar.onclick = () => ocupado(enviar, "Enviando...", async () => {
    resultado.className = "msg";
    const { r, j } = await acao({ action: "enviarLembretes" });
    const erro = erroDe(r, j, "Não foi possível enviar.");
    if (erro) { resultado.textContent = erro; return; }
    const s = j.resumo;
    if (s.erro) { resultado.textContent = s.erro; return; }
    resultado.textContent = `Enviados: ${s.enviados} · Já enviados antes: ${s.jaEnviados} · Sem WhatsApp: ${s.semTelefone} · Falhas: ${s.falhas}` + (s.detalhes.length ? " — " + s.detalhes.join("; ") : "");
    resultado.className = s.falhas ? "msg" : "msg ok"; recarregar();
  });

  // teste
  const fone = h("input", { type: "tel", placeholder: "(21) 90000-0000", maxlength: "20" });
  const rt = h("p", { class: "msg" });
  const testar = h("button", { type: "button", class: "btn out small" }, "Enviar teste");
  testar.onclick = () => ocupado(testar, "Enviando...", async () => {
    rt.className = "msg";
    const { r, j } = await acao({ action: "testarWhatsApp", telefone: fone.value });
    const erro = erroDe(r, j, "Não foi possível testar.");
    if (erro) { rt.textContent = erro; return; }
    rt.textContent = j.ok ? "Teste enviado! Confira o WhatsApp." : `A Wapito recusou (código ${j.status}): ${j.detalhe}`;
    rt.className = j.ok ? "msg ok" : "msg";
  });

  raiz.replaceChildren(
    h("section", { class: "bloco" }, h("h2", {}, "Lembrete automático para as clientes"),
      h("p", { class: "ajuda" }, "Todo dia de manhã (9h) o sistema envia o lembrete pelo WhatsApp para as clientes que agendaram e informaram o número. Ninguém recebe duas vezes."),
      h("p", {}, "WhatsApp (Wapito): ", h("span", { class: "estado " + (L.whatsappConfigurado ? "ok" : "ruim") }, L.whatsappConfigurado ? "conectado" : "não configurado")),
      L.whatsappConfigurado ? null : h("p", { class: "ajuda" }, "Falta cadastrar o token da Wapito na Vercel (WAPITO_API_TOKEN). Veja o passo a passo no arquivo LEIA-ME."),
      h("label", { class: "marcar" }, h("input", { type: "checkbox", checked: l.ativo, onchange: (e) => (l.ativo = e.target.checked) }), "Enviar lembretes automaticamente"),
      h("label", { class: "campo" }, "Quando enviar"),
      h("select", { onchange: (e) => (l.quando = e.target.value) },
        h("option", { value: "dia_anterior", selected: l.quando === "dia_anterior" }, "No dia anterior, às 9h"),
        h("option", { value: "mesmo_dia", selected: l.quando === "mesmo_dia" }, "No mesmo dia, às 9h")),
      h("label", { class: "campo" }, "Mensagem"), area,
      h("div", { class: "vars" }, [["{data}", "Data"], ["{hora}", "Horário"], ["{nome}", "Nome"], ["{dia_semana}", "Dia da semana"]].map(([v, n]) =>
        h("button", { type: "button", class: "btn out small", onclick: () => inserir(v) }, "+ " + n))),
      h("label", { class: "campo" }, "Como a cliente vai receber (exemplo)"), pv,
      h("div", { class: "rodapeSalvar" }, salvar, msg)),

    h("section", { class: "bloco" }, h("h2", {}, "Enviar agora"),
      h("p", { class: "ajuda" }, "Manda já os lembretes de " + dataBR(L.proximaData) + ". Quem já recebeu não recebe de novo. Para uma cliente só, use o botão \"Lembrar agora\" na aba Agenda."),
      enviar, resultado),

    h("section", { class: "bloco" }, h("h2", {}, "Testar o WhatsApp"),
      h("p", { class: "ajuda" }, "Envia uma mensagem de teste para o número que você digitar (use o seu)."),
      h("div", { class: "linhaForm" }, h("div", {}, fone), testar), rt),

    h("section", { class: "bloco" }, h("h2", {}, "Últimos envios"),
      L.log && L.log.length ? L.log.map((x) => h("div", { class: "item" },
        h("span", {}, `${x.name} · ${dataBR(x.date)} ${x.time}`, h("span", { class: "meta", style: "display:block;color:var(--mut);font-size:12px" }, quando(x.em) + (x.ok ? "" : " — " + x.detalhe))),
        h("span", { class: "estado " + (x.ok ? "ok" : "ruim") }, x.ok ? "enviado" : "falhou")))
        : h("p", { class: "vazio" }, "Nenhum envio ainda.")));
}
