// Aba "Horários e dias": funcionamento da agenda, períodos especiais (meses), WhatsApp e mapa.
import { h, rotulo, SEMANA_CURTA, MESES, pad, toast, ocupado, GRADE_HORAS, lerHora } from "./util.js";
import { vigiar, marcarSalvo } from "./pendente.js";
import { acao, erroDe } from "./api.js";
import { E } from "./estado.js";

let raiz, recarregar = () => {};
export function montar(el, aoSalvar) { raiz = el; recarregar = aoSalvar; vigiar("cfg", el, () => E.cfg); desenhar(); }

// ----- componentes reutilizáveis -----
// Horários em "etiquetas" (toque no × para tirar) + lista para adicionar.
// Antes era um campo de hora quase invisível no celular: tocar em "+ Horário" sem
// escolher a hora antes não fazia nada. Agora escolher na lista já adiciona.
const SALVE = 'Toque em "Salvar alterações" para valer no site.';
function chipsHoras(lista, aoMudar) {
  const caixa = h("div", { class: "chips" });
  const adicionar = (t) => {
    if (!t) return;
    if (lista.includes(t)) return toast(rotulo(t) + " já está na lista.");
    if (lista.length >= 12) return toast("Máximo de 12 horários.", true);
    lista.push(t); lista.sort(); aoMudar(); ver();
    toast(rotulo(t) + " adicionado. " + SALVE);
  };
  const ver = () => {
    const sel = h("select", { class: "addHora", "aria-label": "Adicionar horário" },
      h("option", { value: "" }, "+ Adicionar horário"),
      GRADE_HORAS.filter((t) => !lista.includes(t)).map((t) => h("option", { value: t }, rotulo(t))),
      h("option", { value: "outro" }, "Outro horário…"));
    sel.onchange = () => {
      let t = sel.value; sel.value = "";
      if (t === "outro") {
        const dig = window.prompt("Digite o horário (ex.: 10h40)");
        if (dig == null) return;
        t = lerHora(dig);
        if (!t) return toast("Horário inválido. Use, por exemplo, 10h40.", true);
      }
      adicionar(t);
    };
    caixa.replaceChildren(...lista.map((t, i) => h("span", { class: "chip" }, rotulo(t),
      h("button", { type: "button", "aria-label": "Remover " + rotulo(t), onclick: () => {
        lista.splice(i, 1); aoMudar(); ver(); toast(rotulo(t) + " removido. " + SALVE);
      } }, "×"))), sel);
  };
  ver();
  return caixa;
}
function semana(dias, aoMudar) {
  return h("div", { class: "semana" }, SEMANA_CURTA.map((n, i) => {
    const cx = h("input", { type: "checkbox", checked: dias.includes(i), onchange: () => {
      const k = dias.indexOf(i); cx.checked ? k < 0 && dias.push(i) : k >= 0 && dias.splice(k, 1);
      dias.sort(); aoMudar();
    } });
    return h("label", {}, cx, h("span", {}, n));
  }));
}
function mesDia(valor, aoMudar) {
  const [m, d] = (valor || "01-01").split("-").map(Number);
  const sm = h("select", {}, MESES.map((n, i) => h("option", { value: i + 1, selected: i + 1 === m }, n)));
  const sd = h("select", {}, Array.from({ length: 31 }, (_, i) => h("option", { value: i + 1, selected: i + 1 === d }, i + 1)));
  const emitir = () => aoMudar(`${pad(sm.value)}-${pad(sd.value)}`);
  sm.onchange = sd.onchange = emitir;
  return h("div", { class: "md" }, sd, sm);
}
const campo = (rotulo, el) => h("div", {}, h("label", { class: "campo" }, rotulo), el);
const texto = (obj, k, extra) => h("input", { type: "text", value: obj[k] || "", oninput: (e) => (obj[k] = e.target.value), ...(extra || {}) });

// ----- tela -----
export function desenhar() {
  if (!raiz || !E.cfg) return;
  const cfg = E.cfg;
  const pausaMsg = texto(cfg, "pausaMsg", { maxlength: "160" });
  const pausaWrap = h("div", { hidden: cfg.online }, campo("Mensagem quando estiver pausado", pausaMsg));
  const online = h("input", { type: "checkbox", checked: cfg.online, onchange: (e) => { cfg.online = e.target.checked; pausaWrap.hidden = cfg.online; } });
  const sync = h("input", { type: "checkbox", checked: cfg.syncCalendario, onchange: (e) => (cfg.syncCalendario = e.target.checked) });

  const regrasBox = h("div", {});
  const pintarRegras = () => {
    regrasBox.replaceChildren(...cfg.regras.map((r, i) => h("div", { class: "cartao" },
      h("div", { class: "cab" }, h("strong", {}, r.nome || "Período especial"),
        h("button", { type: "button", class: "btn perigo small", onclick: () => { if (confirm("Remover este período?")) { cfg.regras.splice(i, 1); pintarRegras(); } } }, "Remover")),
      campo("Nome (só para você)", texto(r, "nome", { maxlength: "40", placeholder: "Ex.: Dezembro, Férias..." })),
      h("div", { class: "duas" }, campo("Começa em", mesDia(r.de, (v) => (r.de = v))), campo("Termina em", mesDia(r.ate, (v) => (r.ate = v)))),
      h("label", { class: "campo" }, "Horários nesse período"), chipsHoras(r.times, () => {}),
      h("label", { class: "campo" }, "Dias da semana nesse período"), semana(r.dias, () => {}),
      h("label", { class: "campo" }, "A partir de quando só pelo WhatsApp (opcional)"),
      h("div", { class: "md" }, r.restritoDesde ? mesDia(r.restritoDesde, (v) => (r.restritoDesde = v)) : h("span", { class: "ajuda" }, "Não definido. "),
        h("button", { type: "button", class: "btn out small", onclick: () => { r.restritoDesde = r.restritoDesde ? null : r.de; pintarRegras(); } }, r.restritoDesde ? "Desativar" : "Definir")),
      h("p", { class: "ajuda" }, "Nesse período o site usa estes horários e dias no lugar dos padrões. Repete todo ano."))));
  };
  pintarRegras();

  const msg = h("p", { class: "msg" });
  const salvar = h("button", { type: "button", class: "btn wide" }, "Salvar alterações");
  salvar.onclick = () => ocupado(salvar, "Salvando...", async () => {
    msg.className = "msg";
    if (!cfg.times.length) { msg.textContent = "Deixe ao menos um horário padrão."; return; }
    const { r, j } = await acao({ action: "salvarConfig", cfg });
    const erro = erroDe(r, j, "Não foi possível salvar.");
    if (erro) { msg.textContent = erro; return; }
    E.cfg = j.cfg; E.times = j.times; marcarSalvo("cfg"); toast("Salvo! O site já usa as novas regras."); recarregar();
  });

  raiz.replaceChildren(
    h("section", { class: "bloco" }, h("h2", {}, "Agendamento online"),
      h("label", { class: "marcar" }, online, "Agendamento online ligado"),
      pausaWrap,
      campo("Aviso no topo do agendamento (opcional)", texto(cfg, "aviso", { maxlength: "200", placeholder: "Ex.: Semana que vem estarei de folga." }))),

    h("section", { class: "bloco" }, h("h2", {}, "Horários padrão"),
      h("p", { class: "ajuda" }, "Horários oferecidos nos dias normais de atendimento."), chipsHoras(cfg.times, () => {}),
      h("h3", {}, "Dias de atendimento"), semana(cfg.dias, () => {}),
      campo("Até quantos dias à frente a cliente pode agendar", h("input", { type: "number", min: "1", max: "365", value: cfg.janela, oninput: (e) => (cfg.janela = parseInt(e.target.value, 10) || 60) })),
      h("label", { class: "marcar" }, sync, h("span", {}, "A página inicial segue estes dias e prazo")),
      h("p", { class: "ajuda" }, "Desligado, a página inicial continua mostrando terça a sábado por 60 dias, como sempre foi. Ligue só se quiser que mudanças de dias (ex.: abrir aos domingos) apareçam para as clientes.")),

    h("section", { class: "bloco" }, h("h2", {}, "Períodos especiais (meses e datas)"),
      h("p", { class: "ajuda" }, "Para meses ou épocas com horários e dias diferentes, como dezembro. Valem todo ano."),
      regrasBox,
      h("button", { type: "button", class: "btn out small", onclick: () => {
        if (cfg.regras.length >= 12) return toast("Limite de 12 períodos.", true);
        cfg.regras.push({ nome: "", de: "01-01", ate: "01-31", times: [...cfg.times], dias: [...cfg.dias], restritoDesde: null }); pintarRegras();
      } }, "+ Novo período")),

    h("section", { class: "bloco" }, h("h2", {}, "Contato"),
      campo("WhatsApp da Lyli (com DDD)", texto(cfg, "wa", { type: "tel", placeholder: "(21) 96851-3808" })),
      campo("Link do Google Maps", texto(cfg, "maps", { type: "url", placeholder: "https://maps.app.goo.gl/..." })),
      campo("Frase de apresentação (abaixo da logo)", texto(cfg, "lead", { maxlength: "160" }))),

    h("div", { class: "rodapeSalvar" }, salvar, msg));
  // WhatsApp mostrado formatado
  const w = raiz.querySelector('input[type=tel]'); if (w && /^55\d{10,11}$/.test(cfg.wa)) w.value = cfg.wa.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}
