// Teste: abra /api/db-ping no site. Pode apagar depois que funcionar.
const { db } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [rows] = await db().query('SELECT NOW() AS agora');
    res.status(200).json({ ok: true, agora: rows[0].agora });
  } catch (e) {
    console.error('[db-ping]', e.code || '', e.message);
    const config = e.code === 'ENV_MISSING' || e.code === 'ENV_INVALID';
    // "code" (ex.: ER_ACCESS_DENIED_ERROR, ECONNREFUSED) não revela segredo e permite o gvp corrigir sozinho
    res.status(500).json({
      ok: false,
      error: config ? e.message : 'falha ao consultar o banco',
      code: e.code || 'UNKNOWN',
    });
  }
};
