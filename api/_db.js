// Conexão compartilhada com o banco (MySQL/TiDB). Use só no servidor (pasta api/).
const mysql = require('mysql2/promise');
let pool;

function erro(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

// Lê e valida DATABASE_URL (tolera aspas e espaços sobrando no valor)
function lerConfig() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
  if (!raw) throw erro('ENV_MISSING', 'DATABASE_URL não está definida no ambiente');

  let u;
  try {
    u = new URL(raw);
  } catch {
    throw erro('ENV_INVALID', 'DATABASE_URL inválida. Formato: mysql://usuario:senha@host:4000/banco (senha com caracteres especiais precisa estar codificada)');
  }
  if (!/^mysql2?:$/.test(u.protocol)) throw erro('ENV_INVALID', 'DATABASE_URL deve começar com mysql://');
  if (!u.hostname || u.pathname.length < 2) throw erro('ENV_INVALID', 'DATABASE_URL precisa ter host e nome do banco');

  // DB_CA pode chegar com "\n" literal quando salvo em uma linha só
  const ca = process.env.DB_CA ? process.env.DB_CA.replace(/\\n/g, '\n').trim() : '';

  const semSsl = u.searchParams.get('ssl') === 'false' || ['localhost', '127.0.0.1', '::1'].includes(u.hostname);

  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
    // TLS obrigatório, exceto banco local (localhost/127.0.0.1) ou ?ssl=false explícito na URL
    ...(semSsl ? {} : { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true, ...(ca ? { ca } : {}) } }),
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 10000,
    enableKeepAlive: true,
  };
}

function db() {
  if (!pool) pool = mysql.createPool(lerConfig());
  return pool;
}

module.exports = { db };
