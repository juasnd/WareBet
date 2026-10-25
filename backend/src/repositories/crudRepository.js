const { query } = require('../config/db');
const { tables } = require('../utils/sql');

const idColumns = {
  usuarios: 'id_usuario',
  eventos: 'id_evento',
  apuestas: 'id_apuesta',
  detalles: 'id_detalle'
};

function getTable(resource) {
  const table = tables[resource];
  if (!table) {
    throw Object.assign(new Error('Recurso no válido'), { status: 400 });
  }
  return table;
}

function getIdColumn(resource) {
  const column = idColumns[resource];
  if (!column) {
    throw Object.assign(new Error('Recurso no válido'), { status: 400 });
  }
  return column;
}

async function list(resource, { limit = 100, offset = 0 } = {}) {
  const table = getTable(resource);
  const result = await query(`SELECT * FROM ${table} ORDER BY 1 LIMIT $1 OFFSET $2`, [limit, offset]);
  return result.rows;
}

async function get(resource, id, client = query) {
  const table = getTable(resource);
  const idColumn = getIdColumn(resource);
  const sql = `SELECT * FROM ${table} WHERE "${idColumn}" = $1`;
  const result = await client(sql, [id]);
  return result.rows[0];
}

async function insert(resource, data, client = query) {
  const table = getTable(resource);
  const keys = Object.keys(data);
  if (keys.length === 0) {
    throw Object.assign(new Error('No hay campos válidos'), { status: 400 });
  }

  const columns = keys.map((key) => `"${key}"`).join(', ');
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
  const result = await client(sql, keys.map((key) => data[key]));
  return result.rows[0];
}

async function update(resource, id, data, client = query) {
  const table = getTable(resource);
  const idColumn = getIdColumn(resource);
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return get(resource, id, client);
  }

  const assignments = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
  const sql = `UPDATE ${table} SET ${assignments} WHERE "${idColumn}" = $${keys.length + 1} RETURNING *`;
  const result = await client(sql, [...keys.map((key) => data[key]), id]);
  return result.rows[0];
}

async function remove(resource, id, client = query) {
  const table = getTable(resource);
  const idColumn = getIdColumn(resource);
  const sql = `DELETE FROM ${table} WHERE "${idColumn}" = $1 RETURNING *`;
  const result = await client(sql, [id]);
  return result.rows[0];
}

module.exports = { list, get, insert, update, remove, idColumns };
