const allowed = {
  usuarios: ['id_usuario','nombre','correo','clave_hash','perfil','opciones_menu','saldo_virtual','activo','creado_en','actualizado_en'],
  eventos: ['id_evento','deporte','competencia','equipo_local','equipo_visitante','fecha_inicio','marcador_local','marcador_visitante','cuota_local','cuota_empate','cuota_visitante','resultado','estado','creado_en','actualizado_en'],
  apuestas: ['id_apuesta','id_usuario','tipo','monto','cuota_total','premio_potencial','estado','fecha_creacion','fecha_liquidacion'],
  detalles: ['id_detalle','id_apuesta','id_evento','seleccion','cuota_fijada','estado']
};
const tables = { usuarios: 'usuarios', eventos: 'eventos_deportivos', apuestas: 'apuestas', detalles: 'detalle_apuestas' };
function fields(resource, data, omit = []) {
  const result = Object.fromEntries(Object.entries(data || {}).filter(([k,v]) => allowed[resource].includes(k) && !omit.includes(k) && v !== undefined));
  return result;
}
module.exports = { allowed, tables, fields };
