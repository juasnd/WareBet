const { pool } = require('../config/db');

const selections = {
  LOCAL: 'cuota_local',
  EMPATE: 'cuota_empate',
  VISITANTE: 'cuota_visitante'
};

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function hasValidSelectionType(type, count) {
  if (type === 'SIMPLE') {
    return count === 1;
  }
  return type === 'COMBINADA' && count >= 2;
}

function validateStake(stake) {
  if (!Number.isFinite(Number(stake)) || Number(stake) <= 0) {
    throw fail('Monto inválido');
  }
}

async function getAvailableEvent(client, eventId) {
  const result = await client.query(
    'SELECT * FROM eventos_deportivos WHERE id_evento = $1 FOR SHARE',
    [eventId]
  );
  const event = result.rows[0];
  if (!event || !['PROGRAMADO', 'EN_VIVO'].includes(event.estado)) {
    throw fail('Evento no disponible');
  }
  return event;
}

async function getSelectionOdds(client, selection) {
  const column = selections[selection.seleccion];
  if (!column) {
    throw fail('Selección inválida');
  }
  const event = await getAvailableEvent(client, selection.id_evento);
  return Number(event[column]);
}

async function insertBetDetails(client, betId, selectionsToInsert) {
  for (const selection of selectionsToInsert) {
    await client.query(
      "INSERT INTO detalle_apuestas (id_apuesta, id_evento, seleccion, cuota_fijada, estado) VALUES ($1, $2, $3, $4, 'PENDIENTE')",
      [betId, selection.id_evento, selection.seleccion, selection.cuota_fijada]
    );
  }
}

async function createDraft(userId, { tipo, monto, selecciones = [] }) {
  validateStake(monto);
  if (!hasValidSelectionType(tipo, selecciones.length)) {
    throw fail('Tipo o cantidad de selecciones inválida');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT saldo_virtual FROM usuarios WHERE id_usuario = $1 FOR UPDATE',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw fail('Usuario no encontrado', 404);
    }

    const eventIds = new Set();
    let totalOdds = 1;
    const details = [];
    for (const selection of selecciones) {
      const eventId = String(selection.id_evento);
      if (eventIds.has(eventId)) {
        throw fail('No se puede repetir un evento en la misma apuesta');
      }
      eventIds.add(eventId);
      const odds = await getSelectionOdds(client, selection);
      totalOdds *= odds;
      details.push({ ...selection, cuota_fijada: odds });
    }

    if (Number(user.saldo_virtual) < Number(monto)) {
      throw fail('Saldo virtual insuficiente', 409);
    }

    const betResult = await client.query(
      "INSERT INTO apuestas (id_usuario, tipo, monto, cuota_total, premio_potencial, estado) VALUES ($1, $2, $3, $4, $5, 'BORRADOR') RETURNING *",
      [userId, tipo, monto, totalOdds, Number(monto) * totalOdds]
    );
    const bet = betResult.rows[0];
    await insertBetDetails(client, bet.id_apuesta, details);
    await client.query('COMMIT');
    return bet;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function confirm(userId, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const betResult = await client.query(
      'SELECT * FROM apuestas WHERE id_apuesta = $1 AND id_usuario = $2 FOR UPDATE',
      [id, userId]
    );
    const bet = betResult.rows[0];
    if (!bet) {
      throw fail('Apuesta no encontrada', 404);
    }
    if (bet.estado !== 'BORRADOR') {
      throw fail('Solo se confirman apuestas en borrador', 409);
    }

    const userResult = await client.query(
      'SELECT saldo_virtual FROM usuarios WHERE id_usuario = $1 FOR UPDATE',
      [userId]
    );
    const user = userResult.rows[0];
    if (Number(user.saldo_virtual) < Number(bet.monto)) {
      throw fail('Saldo virtual insuficiente', 409);
    }

    await client.query(
      'UPDATE usuarios SET saldo_virtual = saldo_virtual - $1, actualizado_en = NOW() WHERE id_usuario = $2',
      [bet.monto, userId]
    );
    const updated = await client.query(
      "UPDATE apuestas SET estado = 'PENDIENTE' WHERE id_apuesta = $1 RETURNING *",
      [id]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findOwnedDraft(client, userId, id) {
  const result = await client.query(
    'SELECT * FROM apuestas WHERE id_apuesta = $1 AND id_usuario = $2 FOR UPDATE',
    [id, userId]
  );
  const bet = result.rows[0];
  if (!bet) {
    throw fail('Apuesta no encontrada', 404);
  }
  if (bet.estado !== 'BORRADOR') {
    throw fail('Solo se modifican apuestas en borrador', 409);
  }
  return bet;
}

async function replaceDraftSelections(client, bet, selectionsToUse) {
  if (!Array.isArray(selectionsToUse) || !hasValidSelectionType(bet.tipo, selectionsToUse.length)) {
    throw fail('Cantidad de selecciones inválida');
  }

  await client.query('DELETE FROM detalle_apuestas WHERE id_apuesta = $1', [bet.id_apuesta]);
  const eventIds = new Set();
  const details = [];
  let totalOdds = 1;
  for (const selection of selectionsToUse) {
    const eventId = String(selection.id_evento);
    if (eventIds.has(eventId)) {
      throw fail('No se puede repetir un evento en la misma apuesta');
    }
    eventIds.add(eventId);
    const odds = await getSelectionOdds(client, selection);
    totalOdds *= odds;
    details.push({ ...selection, cuota_fijada: odds });
  }
  await insertBetDetails(client, bet.id_apuesta, details);
  return totalOdds;
}

async function updateDraft(userId, id, { monto, selecciones }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bet = await findOwnedDraft(client, userId, id);
    const stake = monto === undefined ? Number(bet.monto) : Number(monto);
    validateStake(stake);
    let totalOdds = Number(bet.cuota_total);
    if (selecciones !== undefined) {
      totalOdds = await replaceDraftSelections(client, bet, selecciones);
    }

    const result = await client.query(
      'UPDATE apuestas SET monto = $1, cuota_total = $2, premio_potencial = $3 WHERE id_apuesta = $4 RETURNING *',
      [stake, totalOdds, stake * totalOdds, id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteDraft(userId, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await findOwnedDraft(client, userId, id);
    await client.query('DELETE FROM detalle_apuestas WHERE id_apuesta = $1', [id]);
    const result = await client.query(
      'DELETE FROM apuestas WHERE id_apuesta = $1 RETURNING *',
      [id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createDetail(client, userId, profile, data) {
  const betResult = await client.query(
    'SELECT * FROM apuestas WHERE id_apuesta = $1 FOR UPDATE',
    [data.id_apuesta]
  );
  const bet = betResult.rows[0];
  const isDifferentOwner = bet && profile === 'APOSTADOR' && String(bet.id_usuario) !== String(userId);
  if (bet?.estado !== 'BORRADOR' || isDifferentOwner) {
    throw fail('Apuesta en borrador no encontrada', 404);
  }

  const odds = await getSelectionOdds(client, data);
  const result = await client.query(
    "INSERT INTO detalle_apuestas (id_apuesta, id_evento, seleccion, cuota_fijada, estado) VALUES ($1, $2, $3, $4, 'PENDIENTE') RETURNING *",
    [bet.id_apuesta, data.id_evento, data.seleccion, odds]
  );
  return result.rows[0];
}

async function findEditableDetail(client, userId, profile, detailId) {
  const result = await client.query(
    'SELECT d.*, a.id_usuario, a.tipo, a.estado AS apuesta_estado FROM detalle_apuestas d JOIN apuestas a USING (id_apuesta) WHERE d.id_detalle = $1 FOR UPDATE OF d, a',
    [detailId]
  );
  const detail = result.rows[0];
  const isDifferentOwner = detail && profile === 'APOSTADOR' && String(detail.id_usuario) !== String(userId);
  if (!detail || isDifferentOwner) {
    throw fail('Detalle no encontrado', 404);
  }
  if (detail.apuesta_estado !== 'BORRADOR') {
    throw fail('Solo se editan detalles de apuestas en borrador', 409);
  }
  return detail;
}

async function updateDetail(client, detailId, current, data) {
  const selection = {
    id_evento: data.id_evento || current.id_evento,
    seleccion: data.seleccion || current.seleccion
  };
  const odds = await getSelectionOdds(client, selection);
  const result = await client.query(
    'UPDATE detalle_apuestas SET id_evento = $1, seleccion = $2, cuota_fijada = $3 WHERE id_detalle = $4 RETURNING *',
    [selection.id_evento, selection.seleccion, odds, detailId]
  );
  return result.rows[0];
}

async function deleteDetail(client, detailId, detail) {
  const result = await client.query(
    'SELECT count(*)::int AS count FROM detalle_apuestas WHERE id_apuesta = $1',
    [detail.id_apuesta]
  );
  const count = result.rows[0].count;
  if (count <= 1 || (detail.tipo === 'COMBINADA' && count <= 2)) {
    throw fail('La apuesta debe conservar una selección simple o dos combinadas');
  }
  await client.query('DELETE FROM detalle_apuestas WHERE id_detalle = $1', [detailId]);
}

async function refreshBetOdds(client, betId) {
  const result = await client.query(
    'SELECT coalesce(exp(sum(ln(cuota_fijada))), 1) AS total FROM detalle_apuestas WHERE id_apuesta = $1',
    [betId]
  );
  await client.query(
    'UPDATE apuestas SET cuota_total = $1, premio_potencial = monto * $1 WHERE id_apuesta = $2',
    [result.rows[0].total, betId]
  );
}

async function mutateDetail(userId, profile, detailId, data, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let detail;
    let betId;
    if (action === 'create') {
      detail = await createDetail(client, userId, profile, data);
      betId = detail.id_apuesta;
    } else {
      const current = await findEditableDetail(client, userId, profile, detailId);
      betId = current.id_apuesta;
      if (action === 'delete') {
        await deleteDetail(client, detailId, current);
      } else {
        detail = await updateDetail(client, detailId, current, data);
      }
    }
    await refreshBetOdds(client, betId);
    await client.query('COMMIT');
    return detail;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function getResultFromScore(event) {
  if (event.marcador_local === null || event.marcador_visitante === null) {
    throw fail('Faltan marcadores');
  }
  if (event.marcador_local > event.marcador_visitante) {
    return 'LOCAL';
  }
  if (event.marcador_local < event.marcador_visitante) {
    return 'VISITANTE';
  }
  return 'EMPATE';
}

async function lockFinalEvent(client, eventId) {
  const result = await client.query(
    'SELECT * FROM eventos_deportivos WHERE id_evento = $1 FOR UPDATE',
    [eventId]
  );
  const event = result.rows[0];
  if (!event) {
    throw fail('Evento no encontrado', 404);
  }
  if (!['FINALIZADO', 'CANCELADO'].includes(event.estado)) {
    throw fail('El evento debe estar finalizado o cancelado');
  }
  if (event.estado === 'FINALIZADO' && !event.resultado) {
    event.resultado = getResultFromScore(event);
    await client.query(
      'UPDATE eventos_deportivos SET resultado = $1 WHERE id_evento = $2',
      [event.resultado, eventId]
    );
  }
  return event;
}

function getDetailState(event, detail) {
  if (event.estado === 'CANCELADO') {
    return 'ANULADA';
  }
  return detail.seleccion === event.resultado ? 'ACERTADA' : 'FALLADA';
}

async function settlePendingDetails(client, eventId, event) {
  const result = await client.query(
    "SELECT d.* FROM detalle_apuestas d JOIN apuestas a USING (id_apuesta) WHERE d.id_evento = $1 AND a.estado = 'PENDIENTE' FOR UPDATE OF d, a",
    [eventId]
  );
  for (const detail of result.rows) {
    const state = getDetailState(event, detail);
    await client.query(
      "UPDATE detalle_apuestas SET estado = $1 WHERE id_detalle = $2 AND estado = 'PENDIENTE'",
      [state, detail.id_detalle]
    );
  }
  return result.rows;
}

async function settleBet(client, betId) {
  const betResult = await client.query(
    'SELECT * FROM apuestas WHERE id_apuesta = $1 FOR UPDATE',
    [betId]
  );
  const bet = betResult.rows[0];
  const detailsResult = await client.query(
    'SELECT estado FROM detalle_apuestas WHERE id_apuesta = $1',
    [betId]
  );
  const details = detailsResult.rows;
  if (details.some((detail) => detail.estado === 'PENDIENTE')) {
    return;
  }

  const isLost = details.some((detail) => detail.estado === 'FALLADA');
  const allVoided = details.every((detail) => detail.estado === 'ANULADA');
  let payout = Number(bet.premio_potencial);
  if (isLost) {
    payout = 0;
  } else if (allVoided) {
    payout = Number(bet.monto);
  }
  const status = isLost ? 'PERDIDA' : 'GANADA';
  const updated = await client.query(
    "UPDATE apuestas SET estado = $1, fecha_liquidacion = NOW() WHERE id_apuesta = $2 AND estado = 'PENDIENTE' RETURNING id_apuesta",
    [status, betId]
  );
  if (updated.rowCount > 0 && payout > 0) {
    await client.query(
      'UPDATE usuarios SET saldo_virtual = saldo_virtual + $1, actualizado_en = NOW() WHERE id_usuario = $2',
      [payout, bet.id_usuario]
    );
  }
}

async function settleEvent(eventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await lockFinalEvent(client, eventId);
    const details = await settlePendingDetails(client, eventId, event);
    const betIds = [...new Set(details.map((detail) => detail.id_apuesta))];
    for (const betId of betIds) {
      await settleBet(client, betId);
    }
    await client.query('COMMIT');
    return { procesadas: details.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createDraft, confirm, updateDraft, deleteDraft, mutateDetail, settleEvent };
