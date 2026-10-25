require('dotenv').config();

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('Falta DATABASE_URL o JWT_SECRET en la configuración.');
  process.exit(1);
}

const { server, pool } = require('./app');
const port = Number(process.env.PORT) || 3000;

async function verifyDatabase() {
  const { inspectSchema, query } = require('./config/db');
  await query('SELECT NOW()');
  const schema = await inspectSchema();
  if (schema.missing.length > 0) {
    console.error(`Faltan tablas requeridas: ${schema.missing.join(', ')}`);
  }
  console.log(`API escuchando en http://localhost:${port}; PostgreSQL conectado; tablas verificadas: ${4 - schema.missing.length}/4`);
}

server.listen(port, async () => {
  try {
    await verifyDatabase();
  } catch (err) {
    console.error('Servidor iniciado, pero no se pudo verificar PostgreSQL:', err.code || 'error');
  }
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
