const { pool } = require('../config/db');
const selections = { LOCAL:'cuota_local', EMPATE:'cuota_empate', VISITANTE:'cuota_visitante' };
const fail = (message,status=400) => Object.assign(new Error(message),{status});

function computeEventResult(event) {
  if (event.marcador_local > event.marcador_visitante) {
    return 'LOCAL';
  }
  if (event.marcador_local < event.marcador_visitante) {
    return 'VISITANTE';
  }
  return 'EMPATE';
}

function getDetailSettlementState(event, detail) {
  if (event.estado === 'CANCELADO') {
    return 'ANULADA';
  }
  if (detail.seleccion === event.resultado) {
    return 'ACERTADA';
  }
  return 'FALLADA';
}

async function insertDetalleApuesta(client, { id_apuesta, id_evento, seleccion, cuota_fijada }) {
  await client.query(
    "INSERT INTO detalle_apuestas(id_apuesta,id_evento,seleccion,cuota_fijada,estado) VALUES($1,$2,$3,$4,'PENDIENTE')",
    [id_apuesta, id_evento, seleccion, cuota_fijada]
  );
}

async function replaceDetallesForApuesta(client, apuestaId, selecciones, apuestaTipo) {
  if (!Array.isArray(selecciones)) {
    throw fail('Cantidad de selecciones inválida');
  }
  if ((apuestaTipo === 'SIMPLE' && selecciones.length !== 1) || (apuestaTipo === 'COMBINADA' && selecciones.length < 2)) {
    throw fail('Cantidad de selecciones inválida');
  }

  await client.query('DELETE FROM detalle_apuestas WHERE id_apuesta=$1', [apuestaId]);
  let total = 1;
  const seen = new Set();
  for (const s of selecciones) {
    if (!selections[s.seleccion]) {
      throw fail('Selección o evento inválido');
    }
    const eventoKey = String(s.id_evento);
    if (seen.has(eventoKey)) {
      throw fail('Selección o evento inválido');
    }
    seen.add(eventoKey);
    const e = (await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE', [s.id_evento])).rows[0];
    if (!e || !['PROGRAMADO', 'EN_VIVO'].includes(e.estado)) {
      throw fail('Evento no disponible');
    }
    const odd = Number(e[selections[s.seleccion]]);
    total *= odd;
    await insertDetalleApuesta(client, { id_apuesta: apuestaId, id_evento: s.id_evento, seleccion: s.seleccion, cuota_fijada: odd });
  }
  return total;
}

async function syncBetTotalsFromDetalles(client, betId) {
  if (!betId) {
    return;
  }
  const calc = (await client.query('SELECT count(*)::int n,coalesce(exp(sum(ln(cuota_fijada))),1) total FROM detalle_apuestas WHERE id_apuesta=$1', [betId])).rows[0];
  if (!calc) {
    return;
  }
  await client.query('UPDATE apuestas SET cuota_total=$1,premio_potencial=monto*$1 WHERE id_apuesta=$2', [calc.total, betId]);
}

async function createDraft(userId,{tipo,monto,selecciones=[]}) {
  if(!['SIMPLE','COMBINADA'].includes(tipo)||!Number.isFinite(+monto)||+monto<=0) {
    throw fail('Tipo o monto inválido');
  }
  if((tipo==='SIMPLE'&&selecciones.length!==1)||(tipo==='COMBINADA'&&selecciones.length<2)) {
    throw fail('Cantidad de selecciones inválida');
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const user=(await client.query('SELECT saldo_virtual FROM usuarios WHERE id_usuario=$1 FOR UPDATE',[userId])).rows[0];
    if(!user) {
      throw fail('Usuario no encontrado',404);
    }
    const evs=[];
    let total=1;
    for(const s of selecciones){
      if(!selections[s.seleccion]) {
        throw fail('Selección inválida');
      }
      if(evs.includes(String(s.id_evento))) {
        throw fail('No se puede repetir un evento en la misma apuesta');
      }
      evs.push(String(s.id_evento));
      const e=(await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[s.id_evento])).rows[0];
      if(!e || !['PROGRAMADO','EN_VIVO'].includes(e.estado)) {
        throw fail('Evento no disponible');
      }
      const cuota=Number(e[selections[s.seleccion]]);
      total *= cuota;
      s.cuota_fijada = cuota;
    }
    if(Number(user.saldo_virtual) < +monto) {
      throw fail('Saldo virtual insuficiente',409);
    }
    const apuesta=(await client.query('INSERT INTO apuestas(id_usuario,tipo,monto,cuota_total,premio_potencial,estado) VALUES($1,$2,$3,$4,$5,\'BORRADOR\') RETURNING *',[userId,tipo,monto,total,+monto*total])).rows[0];
    for(const s of selecciones) {
      await insertDetalleApuesta(client, { id_apuesta: apuesta.id_apuesta, id_evento: s.id_evento, seleccion: s.seleccion, cuota_fijada: s.cuota_fijada });
    }
    await client.query('COMMIT');
    return apuesta;
  } catch(e){
    await client.query('ROLLBACK');
    throw e;
  } finally{
    client.release();
  }
}

async function confirm(userId,id){
  const c=await pool.connect(); try{
    await c.query('BEGIN');
    const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];
    if(!a) {
      throw fail('Apuesta no encontrada',404);
    }
    if(a.estado!=='BORRADOR') {
      throw fail('Solo se confirman apuestas en borrador',409);
    }
    const u=(await c.query('SELECT saldo_virtual FROM usuarios WHERE id_usuario=$1 FOR UPDATE',[userId])).rows[0];
    const amount=Number(a.monto);
    if(Number(u.saldo_virtual)<amount) {
      throw fail('Saldo virtual insuficiente',409);
    }
    await c.query('UPDATE usuarios SET saldo_virtual=saldo_virtual-$1, actualizado_en=NOW() WHERE id_usuario=$2',[amount,userId]);
    const out=(await c.query('UPDATE apuestas SET estado=\'PENDIENTE\' WHERE id_apuesta=$1 RETURNING *',[id])).rows[0];
    await c.query('COMMIT');
    return out;
  }catch(e){
    await c.query('ROLLBACK');
    throw e;
  }finally{
    c.release();
  }
}

async function updateDraft(userId,id,{monto,selecciones}){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];
    if(!a) {
      throw fail('Apuesta no encontrada',404);
    }
    if(a.estado!=='BORRADOR') {
      throw fail('Solo se editan apuestas en borrador',409);
    }
    let total=Number(a.cuota_total);
    if(selecciones!==undefined){
      total = await replaceDetallesForApuesta(c, id, selecciones, a.tipo);
    }
    const stake=monto===undefined?Number(a.monto):Number(monto);
    if(!Number.isFinite(stake)||stake<=0) {
      throw fail('Monto inválido');
    }
    const out=(await c.query('UPDATE apuestas SET monto=$1,cuota_total=$2,premio_potencial=$3 WHERE id_apuesta=$4 RETURNING *',[stake,total,stake*total,id])).rows[0];
    await c.query('COMMIT');
    return out;
  }catch(e){
    await c.query('ROLLBACK');
    throw e;
  }finally{
    c.release();
  }
}

async function deleteDraft(userId,id){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];
    if(!a) {
      throw fail('Apuesta no encontrada',404);
    }
    if(a.estado!=='BORRADOR') {
      throw fail('Solo se eliminan apuestas en borrador',409);
    }
    await c.query('DELETE FROM detalle_apuestas WHERE id_apuesta=$1',[id]);
    const out=await c.query('DELETE FROM apuestas WHERE id_apuesta=$1 RETURNING *',[id]);
    await c.query('COMMIT');
    return out.rows[0];
  }catch(e){
    await c.query('ROLLBACK');
    throw e;
  }finally{
    c.release();
  }
}

async function mutateDetail(userId,perfil,detailId,data,action){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const result = action==='create'
      ? await createDetail(c,userId,perfil,data)
      : await changeDetail(c,userId,perfil,detailId,data,action);
    await syncBetTotalsFromDetalles(c,result.betId);
    await c.query('COMMIT');
    return result.detail;
  }catch(e){
    await c.query('ROLLBACK');
    throw e;
  }finally{
    c.release();
  }
}

async function createDetail(client,userId,perfil,data){
  const bet=(await client.query('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE',[data.id_apuesta])).rows[0];
  if(bet?.estado!=='BORRADOR' || (perfil==='APOSTADOR' && String(bet.id_usuario)!==String(userId))) {
    throw fail('Apuesta en borrador no encontrada',404);
  }
  const event=(await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[data.id_evento])).rows[0];
  if(!event || !['PROGRAMADO','EN_VIVO'].includes(event.estado) || !selections[data.seleccion]) {
    throw fail('Evento o selección inválidos');
  }
  const odd=Number(event[selections[data.seleccion]]);
  await insertDetalleApuesta(client,{id_apuesta:bet.id_apuesta,id_evento:event.id_evento,seleccion:data.seleccion,cuota_fijada:odd});
  let detail=(await client.query('SELECT * FROM detalle_apuestas WHERE id_apuesta=$1 AND id_evento=$2 AND seleccion=$3 ORDER BY id_detalle DESC LIMIT 1',[bet.id_apuesta,event.id_evento,data.seleccion])).rows[0];
  if(!detail){
    detail=(await client.query('SELECT * FROM detalle_apuestas WHERE id_apuesta=$1 ORDER BY id_detalle DESC LIMIT 1',[bet.id_apuesta])).rows[0];
  }
  return {detail,betId:bet.id_apuesta};
}

async function changeDetail(client,userId,perfil,detailId,data,action){
  const detail=(await client.query('SELECT d.*,a.id_usuario,a.tipo,a.estado apuesta_estado FROM detalle_apuestas d JOIN apuestas a USING(id_apuesta) WHERE d.id_detalle=$1 FOR UPDATE OF d,a',[detailId])).rows[0];
  if(!detail || (perfil==='APOSTADOR' && String(detail.id_usuario)!==String(userId))) {
    throw fail('Detalle no encontrado',404);
  }
  if(detail.apuesta_estado!=='BORRADOR') {
    throw fail('Solo se editan detalles de apuestas en borrador',409);
  }
  if(action==='delete'){
    await deleteDetail(client,detailId,data,detail);
    return {detail:null,betId:detail.id_apuesta};
  }
  const updated=await updateDetail(client,detailId,data,detail);
  return {detail:updated,betId:detail.id_apuesta};
}

async function deleteDetail(client,detailId,data,detail){
  const countResult=(await client.query('SELECT count(*) FROM detalle_apuestas WHERE id_apuesta=$1',[detail.id_apuesta])).rows[0];
  const count=Number(countResult.count);
  if(count<=1 || (detail.tipo==='COMBINADA' && count<=2)) {
    throw fail('La apuesta debe conservar una selección simple o dos combinadas');
  }
  data.id_apuesta=detail.id_apuesta;
  await client.query('DELETE FROM detalle_apuestas WHERE id_detalle=$1',[detailId]);
}

async function updateDetail(client,detailId,data,detail){
  const eventId=data.id_evento || detail.id_evento;
  const selection=data.seleccion || detail.seleccion;
  if(!selections[selection]) {
    throw fail('Selección inválida');
  }
  const event=(await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[eventId])).rows[0];
  if(!event || !['PROGRAMADO','EN_VIVO'].includes(event.estado)) {
    throw fail('Evento no disponible');
  }
  const odd=Number(event[selections[selection]]);
  return (await client.query('UPDATE detalle_apuestas SET id_evento=$1,seleccion=$2,cuota_fijada=$3 WHERE id_detalle=$4 RETURNING *',[eventId,selection,odd,detailId])).rows[0];
}

async function setFinalEventResult(client,eventId,event){
  if(event.estado==='FINALIZADO' && !event.resultado){
    const marcadores = [event.marcador_local, event.marcador_visitante];
    if (marcadores.some((marcador) => !Number.isInteger(marcador) || marcador < 0)) {
      throw fail('Los marcadores deben ser enteros no negativos');
    }
    const result = computeEventResult(event);
    await client.query('UPDATE eventos_deportivos SET resultado=$1 WHERE id_evento=$2',[result,eventId]);
    event.resultado = result;
  }
}

async function settlePendingDetails(client,eventId,event){
  const details=(await client.query('SELECT d.*,a.id_usuario,a.estado AS apuesta_estado FROM detalle_apuestas d JOIN apuestas a USING(id_apuesta) WHERE d.id_evento=$1 AND a.estado=\'PENDIENTE\' FOR UPDATE OF d,a',[eventId])).rows;
  for(const detail of details){
    const state = getDetailSettlementState(event, detail);
    await client.query('UPDATE detalle_apuestas SET estado=$1 WHERE id_detalle=$2 AND estado=\'PENDIENTE\'',[state, detail.id_detalle]);
  }
  return details;
}

async function settleBetAndCreditUser(client,betId){
  const bet=(await client.query('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE',[betId])).rows[0];
  const details=(await client.query('SELECT estado FROM detalle_apuestas WHERE id_apuesta=$1',[betId])).rows;
  if(details.some(detail=>detail.estado==='PENDIENTE')){
    return;
  }
  const lost=details.some(detail=>detail.estado==='FALLADA');
  const allVoided=details.every(detail=>detail.estado==='ANULADA');
  let payout;
  if(allVoided){
    payout=Number(bet.monto);
  }else if(lost){
    payout=0;
  }else{
    payout=Number(bet.premio_potencial);
  }
  const status=lost?'PERDIDA':'GANADA';
  const changed=await client.query('UPDATE apuestas SET estado=$1,fecha_liquidacion=NOW() WHERE id_apuesta=$2 AND estado=\'PENDIENTE\' RETURNING id_apuesta',[status,betId]);
  if(changed.rowCount&&payout>0){
    await client.query('UPDATE usuarios SET saldo_virtual=saldo_virtual+$1,actualizado_en=NOW() WHERE id_usuario=$2',[payout,bet.id_usuario]);
  }
}

async function settleEvent(eventId){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const event=(await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR UPDATE',[eventId])).rows[0];
    if(!event){
      throw fail('Evento no encontrado',404);
    }
    if(event.estado!=='FINALIZADO'&&event.estado!=='CANCELADO'){
      throw fail('El evento debe estar finalizado o cancelado');
    }
    await setFinalEventResult(client,eventId,event);
    const details=await settlePendingDetails(client,eventId,event);
    const betIds=[...new Set(details.map(detail=>detail.id_apuesta))];
    for(const betId of betIds){
      await settleBetAndCreditUser(client,betId);
    }
    await client.query('COMMIT');
    return {procesadas:details.length};
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

module.exports={createDraft,confirm,updateDraft,deleteDraft,mutateDetail,settleEvent};
