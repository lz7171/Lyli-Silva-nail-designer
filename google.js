// Fotos e avaliações do Google Maps (Places API "New").
// Precisa da variável GOOGLE_MAPS_API_KEY na Vercel. Opcional: GOOGLE_PLACE_ID.
const SHORT = "https://maps.app.goo.gl/cFfbbowAwcHpBYVq6";
const KEY = process.env.GOOGLE_MAPS_API_KEY;
let cache = null, cacheAt = 0, placeId = process.env.GOOGLE_PLACE_ID || null;

async function acharLugar() {
  if (placeId) return placeId;
  let q = "Lyli Silva Nail Designer", bias;
  try {
    const r = await fetch(SHORT, { redirect: "follow" });
    const u = decodeURIComponent(r.url);
    const m = u.match(/\/place\/([^/@]+)/);
    if (m) q = m[1].replace(/\+/g, " ");
    const c = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (c) bias = { circle: { center: { latitude: +c[1], longitude: +c[2] }, radius: 500 } };
  } catch (e) {}
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: q, languageCode: "pt-BR", locationBias: bias }),
  });
  const j = await r.json();
  placeId = j.places && j.places[0] && j.places[0].id;
  if (!placeId) throw new Error("Local não encontrado");
  return placeId;
}

async function dados() {
  if (cache && Date.now() - cacheAt < 6 * 3600e3) return cache;
  const id = await acharLugar();
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=pt-BR`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "rating,userRatingCount,reviews,photos,googleMapsUri" },
  });
  if (!r.ok) throw new Error("Places " + r.status);
  const j = await r.json();
  cache = {
    rating: j.rating || null,
    total: j.userRatingCount || 0,
    url: j.googleMapsUri || SHORT,
    reviews: (j.reviews || [])
      .filter((v) => v.text && v.text.text)
      .map((v) => ({
        autor: v.authorAttribution && v.authorAttribution.displayName,
        nota: v.rating,
        texto: v.text.text,
        quando: v.relativePublishTimeDescription,
      })),
    photos: (j.photos || []).slice(0, 6).map((p) => p.name),
  };
  cacheAt = Date.now();
  return cache;
}

module.exports = async (req, res) => {
  if (!KEY) return res.status(200).json({ disponivel: false });
  try {
    const d = await dados();
    if (req.query.foto !== undefined) {
      const name = d.photos[Number(req.query.foto)];
      if (!name) return res.status(404).end();
      const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${KEY}`);
      if (!r.ok) return res.status(502).end();
      res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600");
    return res.status(200).json({ disponivel: true, rating: d.rating, total: d.total, url: d.url, reviews: d.reviews, fotos: d.photos.length });
  } catch (e) {
    return res.status(200).json({ disponivel: false });
  }
};
