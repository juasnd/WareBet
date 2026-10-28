const { query } = require('../config/db');
const { allowed, tables } = require('../utils/sql');
const idColumns = { usuarios:'id_usuario', eventos:'id_evento', apuestas:'id_apuesta', detalles:'id_detalle' };
async function list(resource, { limit=100, offset=0 }={}) { return (await query(`SELECT * FROM ${tables[resource]} ORDER BY 1 LIMIT $1 OFFSET $2`, [limit, offset])).rows; }
async function get(resource,id,client=query) { return (await client(`SELECT * FROM ${tables[resource]} WHERE "${idColumns[resource]}"=$1`,[id])).rows[0]; }
async function insert(resource,data,client=query) {
 const keys=Object.keys(data); if(!keys.length) throw Object.assign(new Error('No hay campos válidos'),{status:400});
 const columns=keys.map(k=>'"'+k+'"').join(',');
 const placeholders=keys.map((_,i)=>'$'+(i+1)).join(',');
 return (await client(`INSERT INTO ${tables[resource]} (${columns}) VALUES (${placeholders}) RETURNING *`,keys.map(k=>data[k]))).rows[0];
}
async function update(resource,id,data,client=query) {
 const keys=Object.keys(data); if(!keys.length) return get(resource,id,client);
 const assignments=keys.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',');
 return (await client(`UPDATE ${tables[resource]} SET ${assignments} WHERE "${idColumns[resource]}"=$${keys.length+1} RETURNING *`,[...keys.map(k=>data[k]),id])).rows[0];
}
async function remove(resource,id,client=query) { return (await client(`DELETE FROM ${tables[resource]} WHERE "${idColumns[resource]}"=$1 RETURNING *`,[id])).rows[0]; }
module.exports = { list,get,insert,update,remove,idColumns };
