// Aba "Agenda": agendamentos, reserva manual e bloqueio de dias.
import { h, rotulo, dataExtensa, foneBonito, quando, somarDiasISO, horariosDoDia, toast, ocupado } from "./util.js";
import { acao, erroDe } from "./api.js";
import { E } from "./estado.js";

let aba = "proximos", termo = "", recarregar = () => {};
let raiz;

export function montar(el, aoMudar) {
  raiz = el; recarregar = aoMudar; desenhar();
}
export function desenhar() {
  if (!raiz || !E.cfg) return;
  const foco = document.activeElement && document.activeElement.id === "busca";
  raiz.replaceChildren(resumo(), listaSecao(), manualSecao(), bloqueioSecao());
  if (foco) { const b = raiz.querySelector("#busca"); b.focus(); b.setSelectionRange(termo.length, termo.length); }
}

function resumo() {
  const futuros = E.agendamentos.filter((a) => a.date >= E.hoje), limite = somarDiasISO(E.hoje, 7);
  const dados = [["Hoje", futuros.filter((a) => a.date === E.hoje).length], ["Próximos 7 dias", futuros.filter((a) => a.date <= limite).length], ["Total futuro", futuros.length]];
  return h("div", { class: "resumo" }, dados.map(([l, n]) => h("div", {}, h("strong", {}, n), h("span", {}, l))));
}

function listaSecao() {
  let itens = E.agendamentos.filter((a) => (aba === "proximos" ? a.date >= E.hoje : a.date < E.hoje));
  const t = termo.trim().toLowerCase(), dig = t.replace(/\D/g, "");
  if (t) itens = itens.filter((a) => a.name.toLowerCase().includes(t) || (dig && (a.phone || "").includes(dig)));
  itens.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (aba === "proximos" ? 1 : -1));

  const corpo = h("div", {});
  if (!itens.length) corpo.append(h("p", { class: "vazio" }, t ? "Nada encontrado." : aba === "proximos" ? "Nenhum agendamento futuro." : "Nenhum agendamento anterior."));
  const porDia = {};
  itens.forEach((a) => (porDia[a.date] = porDia[a.date] || []).push(a));
  Object.keys(porDia).forEach((date) => corpo.append(h("div", { class: "dia" }, h("h3", {}, dataExtensa(date)), porDia[date].map(linha))));

  const seg = h("div", { class: "seg" }, [["proximos", "Próximos"], ["anteriores", "Anteriores"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": String(aba === v), onclick: () => { aba = v; desenhar(); } }, l)));
  return h("section", { class: "bloco" }, h("h2", {}, "Agendamentos"),
    h("div", { class: "ferramentas" }, h("input", { id: "busca", type: "text", placeholder: "Buscar por nome ou telefone...", value: termo, oninput: (e) => { termo = e.target.value; desenhar(); } }), seg), corpo);
}

function linha(a) {
  const futuro = a.date >= E.hoje;
  const info = h("span", { class: "info" }, a.name,
    a.lembrado ? h("span", { class: "selo ok" }, "lembrete enviado") : null,
    a.phone ? h("a", { href: "https://wa.me/55" + a.phone, target: "_blank", rel: "noopener" }, foneBonito(a.phone)) : h("span", { class: "meta" }, "sem WhatsApp cadastrado"),
    a.at ? h("span", { class: "meta" }, "agendado em " + quando(a.at)) : null);
  const acoes = h("span", { class: "acoes" });
  if (futuro && a.phone && E.lembretes.whatsappConfigurado) {
    const b = h("button", { type: "button", class: "btn out small" }, "Lembrar agora");
    b.onclick = () => ocupado(b, "Enviando...", async () => {
      const { r, j } = await acao({ action: "lembrarUm", date: a.date, time: a.time });
      const erro = erroDe(r, j, "Não foi possível enviar.");
      if (erro) return toast(erro, true);
      toast("Lembrete enviado!"); recarregar();
    });
    acoes.append(b);
  }
  if (futuro) {
    const b = h("button", { type: "button", class: "btn perigo small" }, "Cancelar");
    b.onclick = () => ocupado(b, "Cancelando...", async () => {
      if (!confirm(`Cancelar o horário de ${rotulo(a.time)} em ${dataExtensa(a.date)}?`)) return;
      const { r, j } = await acao({ action: "cancelar", date: a.date, time: a.time });
      const erro = erroDe(r, j, "Não foi possível cancelar agora.");
      if (erro) return toast(erro, true);
      recarregar();
    });
    acoes.append(b);
  }
  return h("div", { class: "linha" }, h("span", { class: "hr" }, rotulo(a.time)), info, acoes);
}

function manualSecao() {
  const hora = h("select", {});
  const montarHoras = (d) => hora.replaceChildren(...horariosDoDia(E.cfg, d || E.hoje).map((t) => h("option", { value: t }, rotulo(t))));
  const data = h("input", { type: "date", min: E.hoje, value: E.hoje, onchange: (e) => e.target.value && montarHoras(e.target.value) });
  montarHoras(E.hoje);
  const nome = h("input", { type: "text", placeholder: "Nome", maxlength: "60" });
  const fone = h("input", { type: "tel", placeholder: "(21) 90000-0000", maxlength: "20" });
  const msg = h("p", { class: "msg" });
  const btn = h("button", { type: "button", class: "btn small" }, "Adicionar");
  btn.onclick = () => ocupado(btn, "Adicionando...", async () => {
    msg.className = "msg";
    if (!data.value || nome.value.trim().length < 2) { msg.textContent = "Preencha a data e o nome."; return; }
    const { r, j } = await acao({ action: "reservar", date: data.value, time: hora.value, name: nome.value.trim(), phone: fone.value });
    const erro = erroDe(r, j, "Não foi possível agendar.");
    if (erro) { msg.textContent = erro; return; }
    msg.textContent = "Agendado com sucesso."; msg.className = "msg ok"; nome.value = ""; fone.value = ""; recarregar();
  });
  return h("section", { class: "bloco" }, h("h2", {}, "Agendar manualmente"),
    h("p", { class: "ajuda" }, "Para quem marcou por telefone ou pessoalmente. Com o WhatsApp preenchido, a cliente também recebe o lembrete."),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "Data"), data), h("div", {}, h("label", { class: "campo" }, "Horário"), hora)),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "Nome da cliente"), nome), h("div", {}, h("label", { class: "campo" }, "WhatsApp (opcional)"), fone), btn), msg);
}

function bloqueioSecao() {
  const dia = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const de = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const ate = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const msg = h("p", { class: "msg" });
  const rodar = async (corpo, btn, texto) => ocupado(btn, "Bloqueando...", async () => {
    msg.className = "msg";
    const { r, j } = await acao(corpo);
    const erro = erroDe(r, j, "Não foi possível bloquear.");
    if (erro) { msg.textContent = erro; return; }
    msg.textContent = texto(j); msg.className = "msg ok"; recarregar();
  });
  const b1 = h("button", { type: "button", class: "btn small" }, "Bloquear dia");
  b1.onclick = () => {
    const n = E.agendamentos.filter((a) => a.date === dia.value).length;
    if (n && !confirm(`Já existem ${n} agendamento(s) nesse dia. Bloquear não cancela os agendamentos, só impede novos. Continuar?`)) return;
    rodar({ action: "bloquear", date: dia.value }, b1, () => "Dia bloqueado.");
  };
  const b2 = h("button", { type: "button", class: "btn small" }, "Bloquear período");
  b2.onclick = () => rodar({ action: "bloquearPeriodo", de: de.value, ate: ate.value }, b2, (j) => `${j.total} dia(s) bloqueado(s).`);
  const lista = h("div", {}, E.bloqueios.length ? E.bloqueios.map((d) => {
    const b = h("button", { type: "button", class: "btn out small" }, "Desbloquear");
    b.onclick = () => ocupado(b, "...", async () => { const { r, j } = await acao({ action: "desbloquear", date: d }); const e = erroDe(r, j, "Não foi possível desbloquear."); if (e) return toast(e, true); recarregar(); });
    return h("div", { class: "item" }, h("span", {}, dataExtensa(d)), b);
  }) : h("p", { class: "vazio" }, "Nenhum dia bloqueado."));
  return h("section", { class: "bloco" }, h("h2", {}, "Bloquear dias"),
    h("p", { class: "ajuda" }, "Para folgas, viagens ou imprevistos. O dia aparece sem horários no site."),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "Um dia"), dia), b1),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "De"), de), h("div", {}, h("label", { class: "campo" }, "Até"), ate), b2),
    msg, lista);
}
