"use strict";
// Conteúdo editável da página inicial (textos, cores, logo, galeria, serviços...).
// A página inicial (site/index.html) NÃO é alterada em disco: o servidor aplica as
// edições do painel sobre ela no momento em que é entregue. Sem edições salvas,
// a página sai idêntica ao arquivo original.
const { K } = require("./redis");
const { esc, txt } = require("./util");
const { diasComAtendimento } = require("./config");

const ORIG_WA = "5521968513808";
const ORIG_FONE = "(21) 96851-3808";
const RE_COR = /^#[0-9a-fA-F]{6}$/;
const RE_ID = /^[a-f0-9]{16}$/;

const DEFAULT_SITE = {
  titulo: "Lyli Silva Nail Designer | Agendamento",
  descricao: "Agende seu horário com Lyli Silva Nail Designer. Atendimento de terça a sábado.",
  logo: null,
  botao: "Agendar horário",
  tituloAgenda: "Agendamento",
  dicaAgenda: "Só aparecem os horários livres.",
  tituloInfo: "Informações",
  mapsLabel: "Ver no Google Maps",
  rodape: "Lyli Silva Nail Designer",
  cores: { bg: "#f1dfc7", ink: "#141827", mut: "#5f5a52", line: "#d9c3a3", soft: "#e6d1b5" },
  sobre: { ativo: false, posicao: "meio", titulo: "Sobre mim", texto: "" },
  servicos: { ativo: false, posicao: "meio", titulo: "Serviços", itens: [] },
  galeria: { ativo: false, posicao: "meio", titulo: "Meus trabalhos", fotos: [] },
  infoExtra: [],
};

const posicao = (v) => (v === "topo" ? "topo" : "meio");
function limparSite(x) {
  x = x && typeof x === "object" ? x : {};
  const d = DEFAULT_SITE, c = x.cores && typeof x.cores === "object" ? x.cores : {};
  const cor = (k) => (RE_COR.test(c[k]) ? c[k].toLowerCase() : d.cores[k]);
  const so = x.sobre || {}, sv = x.servicos || {}, ga = x.galeria || {};
  const link = (v) => (typeof v === "string" && /^(https:\/\/|tel:|mailto:)/.test(v.trim()) ? v.trim().slice(0, 300) : "");
  return {
    titulo: txt(x.titulo, d.titulo, 90) || d.titulo,
    descricao: txt(x.descricao, d.descricao, 200) || d.descricao,
    logo: RE_ID.test(x.logo) ? x.logo : null,
    botao: txt(x.botao, d.botao, 40) || d.botao,
    tituloAgenda: txt(x.tituloAgenda, d.tituloAgenda, 50) || d.tituloAgenda,
    dicaAgenda: txt(x.dicaAgenda, d.dicaAgenda, 160),
    tituloInfo: txt(x.tituloInfo, d.tituloInfo, 50) || d.tituloInfo,
    mapsLabel: txt(x.mapsLabel, d.mapsLabel, 50) || d.mapsLabel,
    rodape: txt(x.rodape, d.rodape, 120),
    cores: { bg: cor("bg"), ink: cor("ink"), mut: cor("mut"), line: cor("line"), soft: cor("soft") },
    sobre: { ativo: so.ativo === true, posicao: posicao(so.posicao), titulo: txt(so.titulo, d.sobre.titulo, 60), texto: txt(so.texto, "", 2000) },
    servicos: {
      ativo: sv.ativo === true, posicao: posicao(sv.posicao), titulo: txt(sv.titulo, d.servicos.titulo, 60),
      itens: (Array.isArray(sv.itens) ? sv.itens : []).slice(0, 30)
        .map((i) => ({ nome: txt(i && i.nome, "", 60), preco: txt(i && i.preco, "", 30), desc: txt(i && i.desc, "", 160) }))
        .filter((i) => i.nome),
    },
    galeria: {
      ativo: ga.ativo === true, posicao: posicao(ga.posicao), titulo: txt(ga.titulo, d.galeria.titulo, 60),
      fotos: (Array.isArray(ga.fotos) ? ga.fotos : []).slice(0, 36)
        .map((f) => ({ id: f && f.id, legenda: txt(f && f.legenda, "", 80) })).filter((f) => RE_ID.test(f.id)),
    },
    infoExtra: (Array.isArray(x.infoExtra) ? x.infoExtra : []).slice(0, 8)
      .map((i) => ({ rotulo: txt(i && i.rotulo, "", 30), texto: txt(i && i.texto, "", 120), link: link(i && i.link) }))
      .filter((i) => i.rotulo && i.texto),
  };
}
async function carregarSite(redis) {
  try { const v = await redis.get(K.site); return limparSite(typeof v === "string" ? JSON.parse(v) : v); }
  catch (e) { return limparSite(null); }
}

// ---------- Aplicação das edições sobre a página original ----------
const foneBonito = (wa) => {
  const d = String(wa).replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
};
const CSS_BLOCOS = `<style id="x-blocos">
.x-aviso{margin:28px 0 0;padding:14px 16px;border:1px solid var(--ink);text-align:center;font-size:15px}
.x-txt{white-space:pre-line;color:var(--mut);margin:0}
.x-srv{list-style:none;margin:0;padding:0}
.x-srv li{padding:14px 0;border-bottom:1px solid var(--line)}
.x-srv .l{display:flex;justify-content:space-between;gap:16px;font-weight:500}
.x-srv .d{display:block;color:var(--mut);font-size:15px;margin-top:2px}
.x-gal{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0}
.x-gal figure{margin:0}
.x-gal img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover}
.x-gal figcaption{font-size:13px;color:var(--mut);padding-top:4px}
@media(min-width:560px){.x-gal{grid-template-columns:repeat(3,1fr)}}
</style>`;

function renderHome(html, cfg, site) {
  let out = html, avisos = [];
  // troca só se o trecho existir; se a página mudar no futuro, ignora em vez de quebrar
  const trocar = (de, para) => {
    const sub = typeof para === "function" ? para : () => para; // evita que "$1" seja interpretado em textos livres
    if (typeof de === "string") { if (out.includes(de)) out = out.replace(de, sub); else avisos.push(de.slice(0, 30)); }
    else if (de.test(out)) out = out.replace(de, sub);
    else avisos.push(String(de).slice(0, 30));
  };
  const D = DEFAULT_SITE;

  if (site.titulo !== D.titulo) trocar(`<title>${D.titulo}</title>`, `<title>${esc(site.titulo)}</title>`);
  if (site.descricao !== D.descricao) trocar(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(site.descricao)}">`);
  if (site.logo) trocar(/(<img class="logo" src=")[^"]*(")/, (m, a, b) => `${a}/api/media?id=${site.logo}${b}`);
  if (cfg.lead !== "Escolha o dia e o horário e confirme direto no WhatsApp.") trocar(/(<p class="lead">)[^<]*(<\/p>)/, (m, a, b) => `${a}${esc(cfg.lead)}${b}`);
  if (site.botao !== D.botao) trocar(`href="#agendar">${D.botao}</a>`, `href="#agendar">${esc(site.botao)}</a>`);
  if (site.tituloAgenda !== D.tituloAgenda) trocar(`<h2>${D.tituloAgenda}</h2>`, `<h2>${esc(site.tituloAgenda)}</h2>`);
  if (site.dicaAgenda !== D.dicaAgenda) trocar(`<p class="dica">${D.dicaAgenda}</p>`, site.dicaAgenda ? `<p class="dica">${esc(site.dicaAgenda)}</p>` : "");
  if (site.tituloInfo !== D.tituloInfo) trocar(`<h2>${D.tituloInfo}</h2>`, `<h2>${esc(site.tituloInfo)}</h2>`);
  if (site.rodape !== D.rodape) trocar(`<footer>${D.rodape}</footer>`, `<footer>${esc(site.rodape)}</footer>`);
  if (site.mapsLabel !== D.mapsLabel) trocar(`>${D.mapsLabel}</a>`, `>${esc(site.mapsLabel)}</a>`);

  // WhatsApp e Maps (configurações da agenda)
  if (cfg.wa !== ORIG_WA) {
    out = out.split(ORIG_WA).join(cfg.wa);
    trocar(`>${ORIG_FONE}</a>`, `>${foneBonito(cfg.wa)}</a>`);
    trocar(`WhatsApp: ${ORIG_FONE}.</p>`, `WhatsApp: ${foneBonito(cfg.wa)}.</p>`);
  }
  if (cfg.maps !== "https://maps.app.goo.gl/cFfbbowAwcHpBYVq6?g_st=iw") out = out.split("https://maps.app.goo.gl/cFfbbowAwcHpBYVq6?g_st=iw").join(esc(cfg.maps));

  // Cores
  const cores = Object.keys(D.cores).filter((k) => site.cores[k] !== D.cores[k]);
  if (cores.length) trocar("</head>", `<style id="x-cores">:root{${cores.map((k) => `--${k}:${site.cores[k]}`).join(";")}}</style>\n</head>`);

  // Calendário: só obedece aos dias/janela do painel se o botão estiver ligado
  if (cfg.syncCalendario) {
    const dias = diasComAtendimento(cfg).filter((x) => !x[1]).map((x) => x[0]); // dias "só pelo WhatsApp" ficam de fora
    const a = "const JANELA_DIAS = 60;", b = "if (d.getUTCDay() < 2) continue; // domingo e segunda: sem atendimento";
    if (out.includes(a) && out.includes(b)) {
      out = out.replace(a, () => `const JANELA_DIAS = ${cfg.janela};\nconst DIAS_OK = new Set(${JSON.stringify(dias)});`);
      out = out.replace(b, () => "if (!DIAS_OK.has(d.toISOString().slice(0, 10))) continue;");
    } else avisos.push("calendario");
  }

  // Blocos novos
  const topo = [], meio = [];
  const aviso = !cfg.online ? cfg.pausaMsg : cfg.aviso;
  if (aviso) topo.push(`<div class="x-aviso" role="status">${esc(aviso)}</div>`);
  const bloco = (b, corpo) => (b.posicao === "topo" ? topo : meio).push(`<section>\n  <h2>${esc(b.titulo)}</h2>\n  ${corpo}\n</section>`);
  if (site.sobre.ativo && site.sobre.texto) bloco(site.sobre, `<p class="x-txt">${esc(site.sobre.texto)}</p>`);
  if (site.servicos.ativo && site.servicos.itens.length) {
    bloco(site.servicos, `<ul class="x-srv">${site.servicos.itens.map((i) =>
      `<li><span class="l"><span>${esc(i.nome)}</span><span>${esc(i.preco)}</span></span>${i.desc ? `<span class="d">${esc(i.desc)}</span>` : ""}</li>`).join("")}</ul>`);
  }
  if (site.galeria.ativo && site.galeria.fotos.length) {
    bloco(site.galeria, `<div class="x-gal">${site.galeria.fotos.map((f) =>
      `<figure><img loading="lazy" src="/api/media?id=${f.id}" alt="${esc(f.legenda || site.galeria.titulo)}">${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ""}</figure>`).join("")}</div>`);
  }
  if (topo.length || meio.length) {
    if (topo.length) trocar('<section id="agendar">', topo.join("\n") + '\n<section id="agendar">');
    if (meio.length) trocar(/<section>\s*<h2>[^<]*<\/h2>\s*<div class="info">/, (m) => meio.join("\n") + "\n" + m);
    trocar("</head>", CSS_BLOCOS + "\n</head>");
  }
  // Linhas extras em "Informações" (Instagram, endereço, horário...)
  if (site.infoExtra.length) {
    const extra = site.infoExtra.map((i) => `<div><b>${esc(i.rotulo)}</b>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.texto)}</a>` : `<span>${esc(i.texto)}</span>`}</div>`).join("\n    ");
    trocar(/(<div><b>WhatsApp<\/b>.*?<\/div>)/, (m) => `${m}\n    ${extra}`);
  }
  return { html: out, avisos };
}
module.exports = { DEFAULT_SITE, limparSite, carregarSite, renderHome, RE_ID };
