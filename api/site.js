// Entrega a página inicial. O arquivo site/index.html NUNCA é alterado em disco:
// as edições feitas no painel são aplicadas por cima, na hora de entregar.
// Se qualquer coisa falhar (banco fora do ar, edição inválida), entrega o original.
const fs = require("fs");
const path = require("path");
const C = require("../lib/core");
const S = require("../lib/site");

let ORIGINAL = null;
function lerOriginal() {
  if (ORIGINAL) return ORIGINAL;
  const candidatos = [path.join(process.cwd(), "site", "index.html"), path.join(__dirname, "..", "site", "index.html")];
  for (const p of candidatos) { try { ORIGINAL = fs.readFileSync(p, "utf8"); return ORIGINAL; } catch (e) {} }
  throw new Error("site/index.html não encontrado");
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).end(); }
  let html;
  try { html = lerOriginal(); } catch (e) { console.error("site:", e); return res.status(500).send("Página indisponível no momento."); }
  let saida = html;
  try {
    const redis = C.getRedis();
    if (redis) {
      const [cfg, site] = await Promise.all([C.carregarCfg(redis), S.carregarSite(redis)]);
      const r = S.renderHome(html, cfg, site);
      saida = r.html;
      if (r.avisos.length) console.warn("site: trechos não encontrados:", r.avisos.join(" | "));
    }
  } catch (e) { console.error("site (usando original):", e); saida = html; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=20, stale-while-revalidate=120");
  return res.status(200).send(req.method === "HEAD" ? "" : saida);
};
