const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined, max: 10, connectionTimeoutMillis: 10000 });
pool.on('error', (err) => console.error('Error inesperado en el pool PostgreSQL:', err.message));
const query = (text, params) => pool.query(text, params);
async function inspectSchema() {
  const expected = ['USUARIOS','EVENTOS_DEPORTIVOS','APUESTAS','DETALLE_APUESTAS'];
  const { rows } = await query("SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND upper(table_name) = ANY($1::text[]) ORDER BY table_name, ordinal_position", [expected]);
  const tables = Object.fromEntries(expected.map(n => [n, rows.filter(r => r.table_name.toUpperCase() === n)]));
  const missing = expected.filter(n => !tables[n].length);
  return { tables, missing };
}
module.exports = { pool, query, inspectSchema };
