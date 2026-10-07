// Aba "Site": textos, cores, logo, galeria, serviços e informações da página inicial.
import { h, toast, ocupado } from "./util.js";
import { acao, erroDe } from "./api.js";
import { E } from "./estado.js";
import { urlFoto, botaoEnviar, escolherFoto } from "./fotos.js";

let raiz, recarregar = () => {};
export function montar(el, aoSalvar) { raiz = el; recarregar = aoSalvar; desenhar(); }

const campo = (r, el) => h("div", {}, h("label", { class: "campo" }, r), el);
const texto = (o, k, extra) => h("input", { type: "text", value: o[k] || "", oninput: (e) => (o[k] = e.target.value), ...(extra || {}) });
const posicao = (o) => h("select", { onchange: (e) => (o.posicao = e.target.value) },
  h("option", { value: "meio", selected: o.posicao !== "topo" }, "Depois do agendamento"), h("option", { value: "topo", selected: o.posicao === "topo" }, "Antes do agendamento"));
const ligar = (o, rotulo) => h("label", { class: "marcar" }, h("input", { type: "checkbox", checked: o.ativo, onchange: (e) => (o.ativo = e.target.checked) }), rotulo);
const PADRAO = { bg: "#f1dfc7", ink: "#141827", mut: "#5f5a52", line: "#d9c3a3", soft: "#e6d1b5" };
const NOMES_COR = { bg: "Fundo", ink: "Texto e botões", mut: "Texto suave", line: "Linhas", soft: "Fundo suave" };

export function desenhar() {
  if (!raiz || !E.site) return;
  const s = E.site;

  // Logo
  const logoBox = h("div", { class: "logoAtual" });
  const pintarLogo = () => logoBox.replaceChildren(
    s.logo ? h("img", { src: urlFoto(s.logo), alt: "Logo atual" }) : h("span", { class: "ajuda" }, "Usando a logo original do site."),
    h("button", { type: "button", class: "btn out small", onclick: async () => { const id = await escolherFoto(); if (id) { s.logo = id; pintarLogo(); } } }, "Trocar logo"),
    s.logo ? h("button", { type: "button", class: "btn perigo small", onclick: () => { s.logo = null; pintarLogo(); } }, "Voltar à original") : null);
  pintarLogo();

  // Cores
  const cores = h("div", { class: "cores" }, Object.keys(PADRAO).map((k) =>
    h("label", {}, NOMES_COR[k], h("input", { type: "color", value: s.cores[k], oninput: (e) => (s.cores[k] = e.target.value) }))));

  // Serviços
  const srvBox = h("div", {});
  const pintarSrv = () => {
    srvBox.replaceChildren(...s.servicos.itens.map((it, i) => h("div", { class: "cartao" },
      h("div", { class: "duas" }, campo("Serviço", texto(it, "nome", { maxlength: "60" })), campo("Preço", texto(it, "preco", { maxlength: "30", placeholder: "R$ 90" }))),
      campo("Descrição (opcional)", texto(it, "desc", { maxlength: "160" })),
      h("button", { type: "button", class: "btn perigo small", onclick: () => { s.servicos.itens.splice(i, 1); pintarSrv(); } }, "Remover"))));
  };
  pintarSrv();

  // Galeria
  const galBox = h("div", {});
  const pintarGal = () => {
    galBox.replaceChildren(h("div", { class: "fotos" }, s.galeria.fotos.map((f, i) => h("div", { class: "foto" },
      h("img", { src: urlFoto(f.id), alt: "", loading: "lazy" }),
      h("button", { type: "button", class: "x", "aria-label": "Tirar da galeria", onclick: () => { s.galeria.fotos.splice(i, 1); pintarGal(); } }, "×"),
      h("input", { type: "text", placeholder: "Legenda", value: f.legenda || "", maxlength: "80", oninput: (e) => (f.legenda = e.target.value) })))));
  };
  pintarGal();

  // Biblioteca
  const bib = h("div", {});
  const pintarBib = () => {
    bib.replaceChildren(
      botaoEnviar("Enviar fotos", () => { pintarBib(); }, true),
      E.midias.length ? h("div", { class: "fotos" }, E.midias.map((m) => {
        const x = h("button", { type: "button", class: "x", "aria-label": "Apagar foto" }, "×");
        x.onclick = () => ocupado(x, "…", async () => {
          if (!confirm("Apagar esta foto? Ela também sai do site.")) return;
          const { r, j } = await acao({ action: "removerFoto", id: m.id });
          const erro = erroDe(r, j, "Não foi possível apagar.");
          if (erro) return toast(erro, true);
          E.midias = j.midias; E.site.logo = j.site.logo; E.site.galeria.fotos = j.site.galeria.fotos; desenhar();
        });
        return h("div", { class: "foto" }, h("img", { src: urlFoto(m.id), alt: m.nome, loading: "lazy" }), x);
      })) : h("p", { class: "vazio" }, "Nenhuma foto enviada ainda."));
  };
  pintarBib();

  // Informações extras
  const infoBox = h("div", {});
  const pintarInfo = () => {
    infoBox.replaceChildren(...s.infoExtra.map((it, i) => h("div", { class: "cartao" },
      h("div", { class: "duas" }, campo("Título", texto(it, "rotulo", { maxlength: "30", placeholder: "Instagram" })), campo("Texto", texto(it, "texto", { maxlength: "120", placeholder: "@lylisilva" }))),
      campo("Link (opcional)", texto(it, "link", { type: "url", placeholder: "https://instagram.com/..." })),
      h("button", { type: "button", class: "btn perigo small", onclick: () => { s.infoExtra.splice(i, 1); pintarInfo(); } }, "Remover"))));
  };
  pintarInfo();

  const msg = h("p", { class: "msg" });
  const salvar = h("button", { type: "button", class: "btn wide" }, "Salvar e publicar no site");
  salvar.onclick = () => ocupado(salvar, "Salvando...", async () => {
    msg.className = "msg";
    const { r, j } = await acao({ action: "salvarSite", site: s });
    const erro = erroDe(r, j, "Não foi possível salvar.");
    if (erro) { msg.textContent = erro; return; }
    E.site = j.site; toast("Salvo! Em até 20 segundos aparece no site."); recarregar();
  });

  raiz.replaceChildren(
    h("section", { class: "bloco" }, h("h2", {}, "Textos principais"),
      campo("Título da aba do navegador", texto(s, "titulo", { maxlength: "90" })),
      campo("Descrição para o Google", texto(s, "descricao", { maxlength: "200" })),
      h("div", { class: "duas" }, campo("Botão do topo", texto(s, "botao", { maxlength: "40" })), campo("Título do agendamento", texto(s, "tituloAgenda", { maxlength: "50" }))),
      campo("Frase abaixo do título do agendamento", texto(s, "dicaAgenda", { maxlength: "160" })),
      h("div", { class: "duas" }, campo("Título das informações", texto(s, "tituloInfo", { maxlength: "50" })), campo("Texto do link do mapa", texto(s, "mapsLabel", { maxlength: "50" }))),
      campo("Texto do rodapé", texto(s, "rodape", { maxlength: "120" })),
      h("p", { class: "ajuda" }, "A frase de apresentação, o WhatsApp e o mapa ficam na aba Horários e dias.")),

    h("section", { class: "bloco" }, h("h2", {}, "Logo"), logoBox),
    h("section", { class: "bloco" }, h("h2", {}, "Cores"), cores,
      h("button", { type: "button", class: "btn out small", onclick: () => { s.cores = { ...PADRAO }; desenhar(); } }, "Voltar às cores originais")),

    h("section", { class: "bloco" }, h("h2", {}, "Sobre mim"), ligar(s.sobre, "Mostrar no site"),
      h("div", { class: "duas" }, campo("Título", texto(s.sobre, "titulo", { maxlength: "60" })), campo("Onde aparece", posicao(s.sobre))),
      h("label", { class: "campo" }, "Texto"), h("textarea", { maxlength: "2000", oninput: (e) => (s.sobre.texto = e.target.value) }, s.sobre.texto)),

    h("section", { class: "bloco" }, h("h2", {}, "Serviços e preços"), ligar(s.servicos, "Mostrar no site"),
      h("div", { class: "duas" }, campo("Título", texto(s.servicos, "titulo", { maxlength: "60" })), campo("Onde aparece", posicao(s.servicos))),
      srvBox, h("button", { type: "button", class: "btn out small", onclick: () => { if (s.servicos.itens.length >= 30) return; s.servicos.itens.push({ nome: "", preco: "", desc: "" }); pintarSrv(); } }, "+ Serviço")),

    h("section", { class: "bloco" }, h("h2", {}, "Galeria de fotos"), ligar(s.galeria, "Mostrar no site"),
      h("div", { class: "duas" }, campo("Título", texto(s.galeria, "titulo", { maxlength: "60" })), campo("Onde aparece", posicao(s.galeria))),
      galBox, h("button", { type: "button", class: "btn out small", onclick: async () => { const id = await escolherFoto(); if (id && s.galeria.fotos.length < 36 && !s.galeria.fotos.some((f) => f.id === id)) { s.galeria.fotos.push({ id, legenda: "" }); pintarGal(); } } }, "+ Adicionar foto à galeria")),

    h("section", { class: "bloco" }, h("h2", {}, "Informações extras"),
      h("p", { class: "ajuda" }, "Linhas novas na seção de informações (Instagram, endereço, horário de funcionamento...)."),
      infoBox, h("button", { type: "button", class: "btn out small", onclick: () => { if (s.infoExtra.length >= 8) return; s.infoExtra.push({ rotulo: "", texto: "", link: "" }); pintarInfo(); } }, "+ Linha")),

    h("section", { class: "bloco" }, h("h2", {}, "Biblioteca de fotos"),
      h("p", { class: "ajuda" }, "Todas as fotos enviadas. As fotos são reduzidas automaticamente para o site carregar rápido."), bib),

    h("div", { class: "rodapeSalvar" }, salvar, msg));
}
