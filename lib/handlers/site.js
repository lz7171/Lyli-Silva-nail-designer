"use strict";
// Conteúdo da página inicial e biblioteca de fotos.
const crypto = require("crypto");
const C = require("../core");
const S = require("../site");
const { HttpError } = require("../erros");

const MAX_BYTES = 600 * 1024, MAX_FOTOS = 60;
const MAGIC = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP",
};
async function lerIndice(redis) {
  try { const v = await redis.get(C.K.midiasIndice); const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

module.exports = {
  lerIndice,
  async salvarSite({ redis, body }) {
    const site = S.limparSite(body.site);
    await redis.set(C.K.site, site);
    return { ok: true, site };
  },
  async subirFoto({ redis, body }) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ""));
    if (!m) throw new HttpError(400, "Imagem inválida. Use JPG, PNG ou WebP.");
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length || buf.length > MAX_BYTES) throw new HttpError(400, "Imagem muito grande. Use uma foto menor.");
    if (!MAGIC[m[1]](buf)) throw new HttpError(400, "O arquivo não é uma imagem válida.");
    const indice = await lerIndice(redis);
    if (indice.length >= MAX_FOTOS) throw new HttpError(400, `Limite de ${MAX_FOTOS} fotos. Apague alguma antes.`);
    const id = crypto.randomBytes(8).toString("hex");
    await redis.set(C.K.midia(id), { m: m[1], b: m[2] });
    indice.unshift({ id, nome: C.limparNome(body.nome).slice(0, 40) || "foto", em: Date.now() });
    await redis.set(C.K.midiasIndice, indice);
    return { ok: true, id, midias: indice };
  },
  async removerFoto({ redis, body }) {
    const id = String(body.id || "");
    if (!S.RE_ID.test(id)) throw new HttpError(400, "Foto inválida");
    await redis.del(C.K.midia(id));
    const indice = (await lerIndice(redis)).filter((x) => x.id !== id);
    await redis.set(C.K.midiasIndice, indice);
    // tira a foto do site se estiver em uso (evita imagem quebrada)
    const site = await S.carregarSite(redis);
    site.galeria.fotos = site.galeria.fotos.filter((f) => f.id !== id);
    if (site.logo === id) site.logo = null;
    await redis.set(C.K.site, site);
    return { ok: true, midias: indice, site };
  },
};
