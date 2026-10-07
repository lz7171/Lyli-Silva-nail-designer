// Biblioteca de fotos: enviar (com compressão), escolher e apagar.
import { $, h, toast, ocupado } from "./util.js";
import { acao, erroDe } from "./api.js";
import { E } from "./estado.js";

export const urlFoto = (id) => `/api/media?id=${id}`;

// Reduz a foto no próprio celular/computador antes de enviar (rápido e leve)
async function comprimir(arquivo) {
  const bmp = await createImageBitmap(arquivo);
  let lado = 1400, qualidade = 0.85;
  for (let i = 0; i < 6; i++) {
    const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * esc); cv.height = Math.round(bmp.height * esc);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", qualidade);
    if (dataUrl.length * 0.75 <= 450 * 1024) return dataUrl;
    lado = Math.round(lado * 0.8); qualidade = Math.max(0.6, qualidade - 0.05);
  }
  throw new Error("Foto grande demais mesmo reduzida.");
}

export async function enviarFotos(arquivos, aoTerminar) {
  let enviadas = 0;
  for (const f of arquivos) {
    if (!/^image\//.test(f.type)) { toast(`"${f.name}" não é uma imagem.`, true); continue; }
    try {
      const dataUrl = await comprimir(f);
      const { r, j } = await acao({ action: "subirFoto", dataUrl, nome: f.name.replace(/\.[^.]+$/, "") });
      const erro = erroDe(r, j, "Não foi possível enviar a foto.");
      if (erro) { toast(erro, true); continue; }
      E.midias = j.midias; enviadas++;
    } catch (e) { toast(`Não consegui preparar "${f.name}".`, true); }
  }
  if (enviadas) toast(enviadas === 1 ? "Foto enviada." : `${enviadas} fotos enviadas.`);
  aoTerminar && aoTerminar();
}

// Botão "Enviar fotos" (abre a galeria do celular)
export function botaoEnviar(texto, aoTerminar, multiplas) {
  const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: !!multiplas, hidden: true });
  const btn = h("button", { type: "button", class: "btn out small" }, texto);
  btn.onclick = () => input.click();
  input.onchange = () => ocupado(btn, "Enviando...", () => enviarFotos([...input.files], aoTerminar)).then(() => (input.value = ""));
  return h("span", {}, btn, input);
}

// Janelinha para escolher uma foto já enviada
export function escolherFoto() {
  return new Promise((resolve) => {
    const dlg = $("dlgFotos");
    const fechar = (v) => { dlg.close(); resolve(v); };
    const desenhar = () => {
      dlg.replaceChildren(
        h("h2", {}, "Escolha uma foto"),
        h("p", { class: "ajuda" }, "Toque na foto desejada."),
        E.midias.length
          ? h("div", { class: "fotos" }, E.midias.map((m) => h("button", { type: "button", class: "foto", style: "padding:0;cursor:pointer", onclick: () => fechar(m.id) }, h("img", { src: urlFoto(m.id), alt: m.nome, loading: "lazy" }))))
          : h("p", { class: "vazio" }, "Nenhuma foto enviada ainda."),
        h("div", { class: "topo" }, botaoEnviar("Enviar nova foto", desenhar, true), h("span", { class: "grow" }), h("button", { type: "button", class: "btn out small", onclick: () => fechar(null) }, "Fechar")),
      );
    };
    dlg.onclose = () => resolve(null);
    desenhar(); dlg.showModal();
  });
}
