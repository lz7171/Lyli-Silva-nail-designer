// Entrega as fotos enviadas pelo painel (guardadas no banco).
const C = require("../lib/core");
const { RE_ID } = require("../lib/site");

module.exports = async (req, res) => {
  try {
    const id = String((req.query || {}).id || "");
    if (!RE_ID.test(id)) return res.status(404).end();
    const redis = C.getRedis();
    if (!redis) return res.status(503).end();
    let v = await redis.get(C.K.midia(id));
    if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
    if (!v || !v.b) return res.status(404).end();
    res.setHeader("Content-Type", v.m || "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // o id muda a cada foto nova
    return res.status(200).send(Buffer.from(v.b, "base64"));
  } catch (e) {
    console.error("media:", e);
    return res.status(500).end();
  }
};
