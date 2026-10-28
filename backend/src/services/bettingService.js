const { pool } = require('../config/db');
const selections = { LOCAL:'cuota_local', EMPATE:'cuota_empate', VISITANTE:'cuota_visitante' };
const fail = (message,status=400) => Object.assign(new Error(message),{status});
async function createDraft(userId,{tipo,monto,selecciones=[]}) {
 if(!['SIMPLE','COMBINADA'].includes(tipo)||!Number.isFinite(+monto)||+monto<=0) throw fail('Tipo o monto inválido');
 if((tipo==='SIMPLE'&&selecciones.length!==1)||(tipo==='COMBINADA'&&selecciones.length<2)) throw fail('Cantidad de selecciones inválida');
 const client=await pool.connect();
 try { await client.query('BEGIN');
  const user=(await client.query('SELECT saldo_virtual FROM usuarios WHERE id_usuario=$1 FOR UPDATE',[userId])).rows[0];
  if(!user) throw fail('Usuario no encontrado',404);
  const evs=[]; let total=1;
  for(const s of selecciones){
   if(!selections[s.seleccion]) throw fail('Selección inválida');
   if(evs.includes(String(s.id_evento))) throw fail('No se puede repetir un evento en la misma apuesta'); evs.push(String(s.id_evento));
   const e=(await client.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[s.id_evento])).rows[0];
   if(!e||!['PROGRAMADO','EN_VIVO'].includes(e.estado)) throw fail('Evento no disponible');
   const cuota=Number(e[selections[s.seleccion]]); total*=cuota;
   s.cuota_fijada=cuota;
  }
  if(Number(user.saldo_virtual)<+monto) throw fail('Saldo virtual insuficiente',409);
  const apuesta=(await client.query("INSERT INTO apuestas(id_usuario,tipo,monto,cuota_total,premio_potencial,estado) VALUES($1,$2,$3,$4,$5,'BORRADOR') RETURNING *",[userId,tipo,monto,total,+monto*total])).rows[0];
  for(const s of selecciones) await client.query("INSERT INTO detalle_apuestas(id_apuesta,id_evento,seleccion,cuota_fijada,estado) VALUES($1,$2,$3,$4,'PENDIENTE')",[apuesta.id_apuesta,s.id_evento,s.seleccion,s.cuota_fijada]);
  await client.query('COMMIT'); return apuesta;
 } catch(e){await client.query('ROLLBACK');throw e} finally{client.release()}
}
async function confirm(userId,id){
 const c=await pool.connect(); try{await c.query('BEGIN');
  const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];
  if(!a) throw fail('Apuesta no encontrada',404); if(a.estado!=='BORRADOR') throw fail('Solo se confirman apuestas en borrador',409);
  const u=(await c.query('SELECT saldo_virtual FROM usuarios WHERE id_usuario=$1 FOR UPDATE',[userId])).rows[0];
  const amount=Number(a.monto); if(Number(u.saldo_virtual)<amount) throw fail('Saldo virtual insuficiente',409);
  await c.query('UPDATE usuarios SET saldo_virtual=saldo_virtual-$1, actualizado_en=NOW() WHERE id_usuario=$2',[amount,userId]);
  const out=(await c.query("UPDATE apuestas SET estado='PENDIENTE' WHERE id_apuesta=$1 RETURNING *",[id])).rows[0]; await c.query('COMMIT');return out;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function updateDraft(userId,id,{monto,selecciones}){
 const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];if(!a)throw fail('Apuesta no encontrada',404);if(a.estado!=='BORRADOR')throw fail('Solo se editan apuestas en borrador',409);
  let total=Number(a.cuota_total);if(selecciones!==undefined){if(!Array.isArray(selecciones)||(a.tipo==='SIMPLE'&&selecciones.length!==1)||(a.tipo==='COMBINADA'&&selecciones.length<2))throw fail('Cantidad de selecciones inválida');await c.query('DELETE FROM detalle_apuestas WHERE id_apuesta=$1',[id]);total=1;const seen=new Set();for(const s of selecciones){if(!selections[s.seleccion]||seen.has(String(s.id_evento)))throw fail('Selección o evento inválido');seen.add(String(s.id_evento));const e=(await c.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[s.id_evento])).rows[0];if(!e||!['PROGRAMADO','EN_VIVO'].includes(e.estado))throw fail('Evento no disponible');const odd=Number(e[selections[s.seleccion]]);total*=odd;await c.query("INSERT INTO detalle_apuestas(id_apuesta,id_evento,seleccion,cuota_fijada,estado) VALUES($1,$2,$3,$4,'PENDIENTE')",[id,s.id_evento,s.seleccion,odd]);}}
  const stake=monto===undefined?Number(a.monto):Number(monto);if(!Number.isFinite(stake)||stake<=0)throw fail('Monto inválido');const out=(await c.query('UPDATE apuestas SET monto=$1,cuota_total=$2,premio_potencial=$3 WHERE id_apuesta=$4 RETURNING *',[stake,total,stake*total,id])).rows[0];await c.query('COMMIT');return out;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function deleteDraft(userId,id){const c=await pool.connect();try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 AND id_usuario=$2 FOR UPDATE',[id,userId])).rows[0];if(!a)throw fail('Apuesta no encontrada',404);if(a.estado!=='BORRADOR')throw fail('Solo se eliminan apuestas en borrador',409);await c.query('DELETE FROM detalle_apuestas WHERE id_apuesta=$1',[id]);const out=await c.query('DELETE FROM apuestas WHERE id_apuesta=$1 RETURNING *',[id]);await c.query('COMMIT');return out.rows[0]}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function mutateDetail(userId,perfil,detailId,data,action){const c=await pool.connect();try{await c.query('BEGIN');let d;if(action==='create'){const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE',[data.id_apuesta])).rows[0];if(!a||a.estado!=='BORRADOR'||(perfil==='APOSTADOR'&&String(a.id_usuario)!==String(userId)))throw fail('Apuesta en borrador no encontrada',404);const e=(await c.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[data.id_evento])).rows[0];if(!e||!['PROGRAMADO','EN_VIVO'].includes(e.estado)||!selections[data.seleccion])throw fail('Evento o selección inválidos');const odd=Number(e[selections[data.seleccion]]);d=(await c.query("INSERT INTO detalle_apuestas(id_apuesta,id_evento,seleccion,cuota_fijada,estado) VALUES($1,$2,$3,$4,'PENDIENTE') RETURNING *",[a.id_apuesta,e.id_evento,data.seleccion,odd])).rows[0];}
 else {d=(await c.query('SELECT d.*,a.id_usuario,a.tipo,a.estado apuesta_estado FROM detalle_apuestas d JOIN apuestas a USING(id_apuesta) WHERE d.id_detalle=$1 FOR UPDATE OF d,a',[detailId])).rows[0];if(!d||(perfil==='APOSTADOR'&&String(d.id_usuario)!==String(userId)))throw fail('Detalle no encontrado',404);if(d.apuesta_estado!=='BORRADOR')throw fail('Solo se editan detalles de apuestas en borrador',409);if(action==='delete'){const count=Number((await c.query('SELECT count(*) FROM detalle_apuestas WHERE id_apuesta=$1',[d.id_apuesta])).rows[0].count);if(count<=1||(d.tipo==='COMBINADA'&&count<=2))throw fail('La apuesta debe conservar una selección simple o dos combinadas');data.id_apuesta=d.id_apuesta;await c.query('DELETE FROM detalle_apuestas WHERE id_detalle=$1',[detailId]);d=null;}else{const ev=data.id_evento||d.id_evento,sel=data.seleccion||d.seleccion;if(!selections[sel])throw fail('Selección inválida');const e=(await c.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR SHARE',[ev])).rows[0];if(!e||!['PROGRAMADO','EN_VIVO'].includes(e.estado))throw fail('Evento no disponible');const odd=Number(e[selections[sel]]);d=(await c.query("UPDATE detalle_apuestas SET id_evento=$1,seleccion=$2,cuota_fijada=$3 WHERE id_detalle=$4 RETURNING *",[ev,sel,odd,detailId])).rows[0];}}
 const betId=data.id_apuesta||d?.id_apuesta||((await c.query('SELECT id_apuesta FROM detalle_apuestas WHERE id_detalle=$1',[detailId])).rows[0]?.id_apuesta);if(betId){const calc=(await c.query('SELECT count(*)::int n,coalesce(exp(sum(ln(cuota_fijada))),1) total FROM detalle_apuestas WHERE id_apuesta=$1',[betId])).rows[0];await c.query('UPDATE apuestas SET cuota_total=$1,premio_potencial=monto*$1 WHERE id_apuesta=$2',[calc.total,betId]);}await c.query('COMMIT');return d;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function settleEvent(eventId){
 const c=await pool.connect();try{await c.query('BEGIN');
  const e=(await c.query('SELECT * FROM eventos_deportivos WHERE id_evento=$1 FOR UPDATE',[eventId])).rows[0];
  if(!e)throw fail('Evento no encontrado',404);
  if(e.estado!=='FINALIZADO'&&e.estado!=='CANCELADO')throw fail('El evento debe estar finalizado o cancelado');
  if(e.estado==='FINALIZADO'&&!e.resultado){if(e.marcador_local==null||e.marcador_visitante==null)throw fail('Faltan marcadores'); const r=e.marcador_local>e.marcador_visitante?'LOCAL':e.marcador_local<e.marcador_visitante?'VISITANTE':'EMPATE'; await c.query('UPDATE eventos_deportivos SET resultado=$1 WHERE id_evento=$2',[r,eventId]);e.resultado=r;}
  const details=(await c.query("SELECT d.*,a.id_usuario,a.estado AS apuesta_estado FROM detalle_apuestas d JOIN apuestas a USING(id_apuesta) WHERE d.id_evento=$1 AND a.estado='PENDIENTE' FOR UPDATE OF d,a",[eventId])).rows;
  for(const d of details){const state=e.estado==='CANCELADO'?'ANULADA':d.seleccion===e.resultado?'ACERTADA':'FALLADA';await c.query('UPDATE detalle_apuestas SET estado=$1 WHERE id_detalle=$2 AND estado=\'PENDIENTE\'',[state,d.id_detalle]);}
  const ids=[...new Set(details.map(d=>d.id_apuesta))];
  for(const id of ids){const a=(await c.query('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE',[id])).rows[0];const ds=(await c.query('SELECT estado FROM detalle_apuestas WHERE id_apuesta=$1',[id])).rows;
   if(ds.some(d=>d.estado==='PENDIENTE'))continue;
   const lost=ds.some(d=>d.estado==='FALLADA');const payout=ds.every(d=>d.estado==='ANULADA')?Number(a.monto):lost?0:Number(a.premio_potencial);
   const status=lost?'PERDIDA':'GANADA'; const changed=await c.query("UPDATE apuestas SET estado=$1,fecha_liquidacion=NOW() WHERE id_apuesta=$2 AND estado='PENDIENTE' RETURNING id_apuesta",[status,id]);
   if(changed.rowCount&&payout>0)await c.query('UPDATE usuarios SET saldo_virtual=saldo_virtual+$1,actualizado_en=NOW() WHERE id_usuario=$2',[payout,a.id_usuario]);
  }
  await c.query('COMMIT');return {procesadas:details.length};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
module.exports={createDraft,confirm,updateDraft,deleteDraft,mutateDetail,settleEvent};
