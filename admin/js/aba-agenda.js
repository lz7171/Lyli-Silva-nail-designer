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
  const futuros = E.agendamentos.filter((a) => a.date >= E.hoje && !a.fechado), limite = somarDiasISO(E.hoje, 7); // horário fechado não é cliente
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

function linhaFechada(a) {
  const acoes = h("span", { class: "acoes" });
  if (a.date >= E.hoje) {
    const b = h("button", { type: "button", class: "btn out small" }, "Reabrir");
    b.onclick = () => ocupado(b, "Reabrindo...", async () => {
      const { r, j } = await acao({ action: "cancelar", date: a.date, time: a.time });
      const erro = erroDe(r, j, "Não foi possível reabrir agora.");
      if (erro) return toast(erro, true);
      toast(`${rotulo(a.time)} aberto de novo no site.`); recarregar();
    });
    acoes.append(b);
  }
  return h("div", { class: "linha fechado" }, h("span", { class: "hr" }, rotulo(a.time)),
    h("span", { class: "info" }, "Horário fechado", h("span", { class: "meta" }, "aparece como ocupado para as clientes")), acoes);
}

function linha(a) {
  if (a.fechado) return linhaFechada(a);
  const futuro = a.date >= E.hoje;
  const diaFechado = E.bloqueios.includes(a.date);
  const info = h("span", { class: "info" }, a.name,
    a.lembrado ? h("span", { class: "selo ok" }, "lembrete enviado") : null,
    diaFechado && futuro ? h("span", { class: "selo" }, "dia fechado") : null,
    a.phone ? h("a", { href: "https://wa.me/55" + a.phone, target: "_blank", rel: "noopener" }, foneBonito(a.phone)) : h("span", { class: "meta" }, "sem WhatsApp cadastrado"),
    a.phone && a.phone.length < 11 ? h("span", { class: "meta" }, "telefone fixo: não recebe lembrete") : null,
    a.at ? h("span", { class: "meta" }, "agendado em " + quando(a.at)) : null);
  const acoes = h("span", { class: "acoes" });
  if (futuro && a.phone && a.phone.length >= 11 && E.lembretes.whatsappConfigurado) {
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
      const podeAvisar = a.phone && a.phone.length >= 11 && E.lembretes.whatsappConfigurado;
      const avisar = !!podeAvisar && confirm(`Avisar ${a.name} pelo WhatsApp que o horário foi cancelado?\n\nOK = avisar | Cancelar = não avisar`);
      const { r, j } = await acao({ action: "cancelar", date: a.date, time: a.time, avisar });
      const erro = erroDe(r, j, "Não foi possível cancelar agora.");
      if (erro) return toast(erro, true);
      if (avisar) toast(j.avisado ? "Cancelado e cliente avisada." : "Cancelado, mas não consegui avisar a cliente" + (j.motivo ? ": " + j.motivo : "."), !j.avisado);
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
  const msg = h("p", { class: "msg" });
  const rodar = async (corpo, btn, enquanto, texto) => ocupado(btn, enquanto, async () => {
    msg.className = "msg";
    const { r, j } = await acao(corpo);
    const erro = erroDe(r, j, "Não foi possível fechar.");
    if (erro) { msg.textContent = erro; return; }
    msg.textContent = texto(j); msg.className = "msg ok"; recarregar();
  });

  // um horário de um dia
  const hora = h("select", {});
  const montarHoras = (d) => hora.replaceChildren(...horariosDoDia(E.cfg, d || E.hoje).map((t) => h("option", { value: t }, rotulo(t))));
  const diaH = h("input", { type: "date", min: E.hoje, value: E.hoje, onchange: (e) => e.target.value && montarHoras(e.target.value) });
  montarHoras(E.hoje);
  const b0 = h("button", { type: "button", class: "btn small" }, "Fechar horário");
  b0.onclick = () => {
    if (!diaH.value) return;
    rodar({ action: "fecharHorario", date: diaH.value, time: hora.value }, b0, "Fechando...", () => `${rotulo(hora.value)} de ${dataExtensa(diaH.value)} fechado. Para abrir de novo, toque em "Reabrir" na lista acima.`);
  };

  // dia inteiro / período
  const dia = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const de = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const ate = h("input", { type: "date", min: E.hoje, value: E.hoje });
  const b1 = h("button", { type: "button", class: "btn small" }, "Fechar dia");
  b1.onclick = () => {
    const n = E.agendamentos.filter((a) => a.date === dia.value && !a.fechado).length;
    if (n && !confirm(`Já existem ${n} cliente(s) nesse dia. Fechar o dia não cancela esses horários, só impede novos. Continuar?`)) return;
    rodar({ action: "bloquear", date: dia.value }, b1, "Fechando...", () => "Dia fechado. Para abrir de novo, toque em \"Reabrir dia\" abaixo.");
  };
  const b2 = h("button", { type: "button", class: "btn small" }, "Fechar período");
  b2.onclick = () => {
    const n = E.agendamentos.filter((x) => !x.fechado && x.date >= de.value && x.date <= ate.value && x.date >= E.hoje).length;
    if (n && !confirm(`Já existem ${n} cliente(s) nesse período. Fechar não cancela esses horários, só impede novos (e os lembretes desses dias não são enviados). Continuar?`)) return;
    rodar({ action: "bloquearPeriodo", de: de.value, ate: ate.value }, b2, "Fechando...", (j) => `${j.total} dia(s) fechado(s).`);
  };

  const lista = h("div", {}, E.bloqueios.length ? E.bloqueios.map((d) => {
    const b = h("button", { type: "button", class: "btn out small" }, "Reabrir dia");
    b.onclick = () => ocupado(b, "...", async () => { const { r, j } = await acao({ action: "desbloquear", date: d }); const e = erroDe(r, j, "Não foi possível reabrir."); if (e) return toast(e, true); toast("Dia aberto de novo no site."); recarregar(); });
    return h("div", { class: "item" }, h("span", {}, dataExtensa(d)), b);
  }) : h("p", { class: "vazio" }, "Nenhum dia fechado."));

  return h("section", { class: "bloco" }, h("h2", {}, "Fechar dias e horários"),
    h("p", { class: "ajuda" }, "Para folgas, compromissos ou imprevistos. O que estiver fechado aparece como ocupado para as clientes. Dá para abrir de novo a qualquer momento."),
    h("h3", {}, "Um horário"),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "Dia"), diaH), h("div", {}, h("label", { class: "campo" }, "Horário"), hora), b0),
    h("h3", {}, "Um dia inteiro"),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "Dia"), dia), b1),
    h("h3", {}, "Vários dias"),
    h("div", { class: "linhaForm" }, h("div", {}, h("label", { class: "campo" }, "De"), de), h("div", {}, h("label", { class: "campo" }, "Até"), ate), b2),
    msg,
    h("h3", {}, "Dias fechados"), lista);
}
