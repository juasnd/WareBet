// Simular PostgreSQL para no consultar ni modificar Neon en pruebas.
jest.mock('../src/config/db', () => ({
  pool: {
    connect: jest.fn()
  },
  query: jest.fn(),
  inspectSchema: jest.fn()
}));

// Simular la verificación del token JWT conservando el middleware real de autorización.
jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  verify: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool, query, inspectSchema } = require('../src/config/db');
const {
  createDraft,
  confirm,
  updateDraft,
  deleteDraft,
  mutateDetail,
  settleEvent
} = require('../src/services/bettingService');
const crud = require('../src/repositories/crudRepository');
const { notFound, errors } = require('../src/middlewares/errors');
const { fields } = require('../src/utils/sql');
const { app } = require('../src/app');

let client;

beforeEach(() => {
  jest.clearAllMocks();

  client = {
    query: jest.fn(),
    release: jest.fn()
  };

  pool.connect.mockResolvedValue(client);
});

// ============================================================
// 1. Pruebas unitarias: ciclo de vida de apuestas (borrador, edición, confirmación, eliminación)
// ============================================================

describe('Apuestas — responsable 3: creación de borradores (createDraft)', () => {
  test('crea un borrador SIMPLE válido, calcula cuota/premio e inserta detalle', async () => {
    const apuestaCreada = {
      id_apuesta: 10,
      id_usuario: 3,
      tipo: 'SIMPLE',
      monto: 50,
      cuota_total: 2,
      premio_potencial: 100,
      estado: 'BORRADOR'
    };

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT saldo_virtual FROM usuarios')) {
        return { rows: [{ saldo_virtual: 1000 }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return {
          rows: [{
            id_evento: 1,
            estado: 'PROGRAMADO',
            cuota_local: 2,
            cuota_empate: 3.1,
            cuota_visitante: 4
          }]
        };
      }
      if (sql.includes('INSERT INTO apuestas')) {
        return { rows: [apuestaCreada] };
      }
      return { rows: [] };
    });

    const resultado = await createDraft(3, {
      tipo: 'SIMPLE',
      monto: 50,
      selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }]
    });

    expect(resultado).toEqual(apuestaCreada);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO apuestas'),
      [3, 'SIMPLE', 50, 2, 100]
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO detalle_apuestas'),
      [10, 1, 'LOCAL', 2]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('crea un borrador COMBINADA multiplicando cuotas de varias selecciones', async () => {
    client.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT saldo_virtual FROM usuarios')) {
        return { rows: [{ saldo_virtual: 500 }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        const idEvento = params[0];
        return {
          rows: [{
            id_evento: idEvento,
            estado: 'EN_VIVO',
            cuota_local: 2,
            cuota_empate: 3,
            cuota_visitante: 4
          }]
        };
      }
      if (sql.includes('INSERT INTO apuestas')) {
        return {
          rows: [{
            id_apuesta: 11,
            id_usuario: 3,
            tipo: 'COMBINADA',
            monto: 20,
            cuota_total: 6,
            premio_potencial: 120,
            estado: 'BORRADOR'
          }]
        };
      }
      return { rows: [] };
    });

    const resultado = await createDraft(3, {
      tipo: 'COMBINADA',
      monto: 20,
      selecciones: [
        { id_evento: 1, seleccion: 'LOCAL' },
        { id_evento: 2, seleccion: 'EMPATE' }
      ]
    });

    expect(resultado.cuota_total).toBe(6);
    expect(resultado.premio_potencial).toBe(120);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['tipo inválido', { tipo: 'TRIPLE', monto: 25, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] }, 'Tipo o monto inválido'],
    ['monto cero', { tipo: 'SIMPLE', monto: 0, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] }, 'Tipo o monto inválido'],
    ['monto negativo', { tipo: 'SIMPLE', monto: -15, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] }, 'Tipo o monto inválido'],
    ['SIMPLE sin selecciones', { tipo: 'SIMPLE', monto: 25 }, 'Cantidad de selecciones inválida'],
    ['COMBINADA con 1 selección', { tipo: 'COMBINADA', monto: 25, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] }, 'Cantidad de selecciones inválida'],
    ['selecciones no es arreglo', { tipo: 'SIMPLE', monto: 25, selecciones: null }, 'Cantidad de selecciones inválida']
  ])('rechaza borrador con %s antes de abrir transacción', async (_caso, payload, mensaje) => {
    await expect(createDraft(3, payload)).rejects.toMatchObject({
      message: mensaje,
      status: 400
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('rechaza borrador si usuario no existe (404), selección inválida (400), evento no disponible (400), repetido (400) o saldo insuficiente (409)', async () => {
    // Caso 1: usuario no encontrado
    client.query.mockResolvedValue({ rows: [] });
    await expect(
      createDraft(99, { tipo: 'SIMPLE', monto: 20, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] })
    ).rejects.toMatchObject({ message: 'Usuario no encontrado', status: 404 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');

    // Caso 2: selección inválida
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT saldo_virtual')) return { rows: [{ saldo_virtual: 100 }] };
      return { rows: [] };
    });
    await expect(
      createDraft(3, { tipo: 'SIMPLE', monto: 20, selecciones: [{ id_evento: 1, seleccion: 'INVALIDA' }] })
    ).rejects.toMatchObject({ message: 'Selección inválida', status: 400 });

    // Caso 3: evento no disponible
    await expect(
      createDraft(3, { tipo: 'SIMPLE', monto: 20, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] })
    ).rejects.toMatchObject({ message: 'Evento no disponible', status: 400 });

    // Caso 4: evento repetido en combinada
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT saldo_virtual')) return { rows: [{ saldo_virtual: 100 }] };
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'PROGRAMADO', cuota_local: 1.5, cuota_empate: 3 }] };
      }
      return { rows: [] };
    });
    await expect(
      createDraft(3, {
        tipo: 'COMBINADA',
        monto: 20,
        selecciones: [
          { id_evento: 1, seleccion: 'LOCAL' },
          { id_evento: 1, seleccion: 'EMPATE' }
        ]
      })
    ).rejects.toMatchObject({ message: 'No se puede repetir un evento en la misma apuesta', status: 400 });

    // Caso 5: saldo insuficiente
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT saldo_virtual')) return { rows: [{ saldo_virtual: 10 }] };
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'PROGRAMADO', cuota_local: 2 }] };
      }
      return { rows: [] };
    });
    await expect(
      createDraft(3, { tipo: 'SIMPLE', monto: 50, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] })
    ).rejects.toMatchObject({ message: 'Saldo virtual insuficiente', status: 409 });
  });
});

describe('Apuestas — responsable 3: confirmación, edición y eliminación', () => {
  test('confirm descuenta saldo del usuario y pasa la apuesta a PENDIENTE', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, monto: 40, estado: 'BORRADOR' }] };
      }
      if (sql.includes('SELECT saldo_virtual FROM usuarios')) {
        return { rows: [{ saldo_virtual: 200 }] };
      }
      if (sql.includes('UPDATE apuestas SET estado=\'PENDIENTE\'')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, monto: 40, estado: 'PENDIENTE' }] };
      }
      return { rows: [] };
    });

    const confirmada = await confirm(3, 10);

    expect(confirmada.estado).toBe('PENDIENTE');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuarios SET saldo_virtual=saldo_virtual-$1'),
      [40, 3]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('confirm rechaza apuesta inexistente (404), no en borrador (409) o sin saldo (409)', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await expect(confirm(3, 999)).rejects.toMatchObject({
      message: 'Apuesta no encontrada',
      status: 404
    });

    client.query.mockResolvedValue({
      rows: [{ id_apuesta: 10, id_usuario: 3, monto: 40, estado: 'PENDIENTE' }]
    });
    await expect(confirm(3, 10)).rejects.toMatchObject({
      message: 'Solo se confirman apuestas en borrador',
      status: 409
    });

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, monto: 150, estado: 'BORRADOR' }] };
      }
      if (sql.includes('SELECT saldo_virtual')) {
        return { rows: [{ saldo_virtual: 50 }] };
      }
      return { rows: [] };
    });
    await expect(confirm(3, 10)).rejects.toMatchObject({
      message: 'Saldo virtual insuficiente',
      status: 409
    });
  });

  test('updateDraft actualiza monto y reemplaza selecciones recalculando cuota y premio', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return {
          rows: [{
            id_apuesta: 10,
            id_usuario: 3,
            tipo: 'SIMPLE',
            monto: 25,
            cuota_total: 1.8,
            estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return {
          rows: [{
            id_evento: 5,
            estado: 'PROGRAMADO',
            cuota_visitante: 2.5
          }]
        };
      }
      if (sql.includes('UPDATE apuestas SET monto=$1')) {
        return {
          rows: [{
            id_apuesta: 10,
            id_usuario: 3,
            tipo: 'SIMPLE',
            monto: 40,
            cuota_total: 2.5,
            premio_potencial: 100,
            estado: 'BORRADOR'
          }]
        };
      }
      return { rows: [] };
    });

    const actualizada = await updateDraft(3, 10, {
      monto: 40,
      selecciones: [{ id_evento: 5, seleccion: 'VISITANTE' }]
    });

    expect(actualizada.monto).toBe(40);
    expect(actualizada.cuota_total).toBe(2.5);
    expect(actualizada.premio_potencial).toBe(100);
    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM detalle_apuestas WHERE id_apuesta=$1',
      [10]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('updateDraft rechaza apuesta inexistente, estado distinto de BORRADOR, monto inválido y selecciones inválidas', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await expect(updateDraft(3, 99, { monto: 30 })).rejects.toMatchObject({ status: 404 });

    client.query.mockResolvedValue({
      rows: [{ id_apuesta: 10, id_usuario: 3, tipo: 'SIMPLE', monto: 25, cuota_total: 2, estado: 'PENDIENTE' }]
    });
    await expect(updateDraft(3, 10, { monto: 30 })).rejects.toMatchObject({ status: 409 });

    client.query.mockResolvedValue({
      rows: [{ id_apuesta: 10, id_usuario: 3, tipo: 'SIMPLE', monto: 25, cuota_total: 2, estado: 'BORRADOR' }]
    });
    await expect(updateDraft(3, 10, { monto: -5 })).rejects.toMatchObject({
      message: 'Monto inválido',
      status: 400
    });

    await expect(updateDraft(3, 10, { selecciones: 'invalido' })).rejects.toMatchObject({
      message: 'Cantidad de selecciones inválida',
      status: 400
    });
    await expect(updateDraft(3, 10, { selecciones: [] })).rejects.toMatchObject({
      message: 'Cantidad de selecciones inválida',
      status: 400
    });
    await expect(
      updateDraft(3, 10, { selecciones: [{ id_evento: 1, seleccion: 'OTRA' }] })
    ).rejects.toMatchObject({
      message: 'Selección o evento inválido',
      status: 400
    });

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return {
          rows: [{ id_apuesta: 12, id_usuario: 3, tipo: 'COMBINADA', monto: 20, cuota_total: 4, estado: 'BORRADOR' }]
        };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'PROGRAMADO', cuota_local: 2 }] };
      }
      return { rows: [] };
    });
    await expect(
      updateDraft(3, 12, {
        selecciones: [
          { id_evento: 1, seleccion: 'LOCAL' },
          { id_evento: 1, seleccion: 'LOCAL' }
        ]
      })
    ).rejects.toMatchObject({ message: 'Selección o evento inválido', status: 400 });

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return {
          rows: [{ id_apuesta: 10, id_usuario: 3, tipo: 'SIMPLE', monto: 20, cuota_total: 2, estado: 'BORRADOR' }]
        };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'FINALIZADO', cuota_local: 2 }] };
      }
      return { rows: [] };
    });
    await expect(
      updateDraft(3, 10, { selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] })
    ).rejects.toMatchObject({ message: 'Evento no disponible', status: 400 });
  });

  test('deleteDraft elimina detalles y apuesta en borrador o rechaza si no existe / no es borrador', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'BORRADOR' }] };
      }
      if (sql.includes('DELETE FROM apuestas')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'BORRADOR' }] };
      }
      return { rows: [] };
    });

    const eliminada = await deleteDraft(3, 10);
    expect(eliminada.id_apuesta).toBe(10);
    expect(client.query).toHaveBeenCalledWith('DELETE FROM detalle_apuestas WHERE id_apuesta=$1', [10]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');

    client.query.mockResolvedValue({ rows: [] });
    await expect(deleteDraft(3, 99)).rejects.toMatchObject({ status: 404 });

    client.query.mockResolvedValue({ rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'GANADA' }] });
    await expect(deleteDraft(3, 10)).rejects.toMatchObject({ status: 409 });
  });
});

// ============================================================
// 2. Pruebas unitarias: liquidación de apuestas (GANADA, PERDIDA, ANULADA) y sincronización con detalles
// ============================================================

describe('Apuestas — responsable 3: liquidación, pago final y sincronización de cuotas', () => {
  test('settleEvent calcula resultado del evento (LOCAL, VISITANTE, EMPATE), liquida apuesta GANADA y acredita premio', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return {
          rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: null, marcador_local: 2, marcador_visitante: 0 }]
        };
      }
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{ id_detalle: 100, id_apuesta: 10, id_evento: 7, seleccion: 'LOCAL', id_usuario: 3 }]
        };
      }
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return {
          rows: [{ id_apuesta: 10, id_usuario: 3, monto: 50, premio_potencial: 125, estado: 'PENDIENTE' }]
        };
      }
      if (sql.includes('SELECT estado FROM detalle_apuestas')) {
        return { rows: [{ estado: 'ACERTADA' }] };
      }
      if (sql.includes('UPDATE apuestas SET estado=$1')) {
        return { rowCount: 1, rows: [{ id_apuesta: 10 }] };
      }
      return { rows: [], rowCount: 0 };
    });

    const out = await settleEvent(7);
    expect(out).toEqual({ procesadas: 1 });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE apuestas SET estado=$1'),
      ['GANADA', 10]
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuarios SET saldo_virtual=saldo_virtual+$1'),
      [125, 3]
    );

    // Marcadores visitante y empate
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 8, estado: 'FINALIZADO', resultado: null, marcador_local: 0, marcador_visitante: 2 }] };
      }
      return { rows: [], rowCount: 0 };
    });
    await settleEvent(8);

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 9, estado: 'FINALIZADO', resultado: null, marcador_local: 1, marcador_visitante: 1 }] };
      }
      return { rows: [], rowCount: 0 };
    });
    await settleEvent(9);

    // Validaciones de settleEvent (no encontrado, estado no finalizable, marcador inválido)
    client.query.mockResolvedValue({ rows: [] });
    await expect(settleEvent(404)).rejects.toMatchObject({ status: 404 });

    client.query.mockResolvedValue({ rows: [{ id_evento: 7, estado: 'PROGRAMADO' }] });
    await expect(settleEvent(7)).rejects.toMatchObject({ status: 400 });

    client.query.mockResolvedValue({
      rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: null, marcador_local: -1, marcador_visitante: 0 }]
    });
    await expect(settleEvent(7)).rejects.toMatchObject({ status: 400 });
  });

  test('settleEvent marca apuesta como PERDIDA sin acreditar saldo cuando falla una selección', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return {
          rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: 'VISITANTE', marcador_local: 0, marcador_visitante: 1 }]
        };
      }
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{ id_detalle: 101, id_apuesta: 11, id_evento: 7, seleccion: 'LOCAL', id_usuario: 3 }]
        };
      }
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return {
          rows: [{ id_apuesta: 11, id_usuario: 3, monto: 50, premio_potencial: 100, estado: 'PENDIENTE' }]
        };
      }
      if (sql.includes('SELECT estado FROM detalle_apuestas')) {
        return { rows: [{ estado: 'FALLADA' }] };
      }
      if (sql.includes('UPDATE apuestas SET estado=$1')) {
        return { rowCount: 1, rows: [{ id_apuesta: 11 }] };
      }
      return { rows: [], rowCount: 0 };
    });

    await settleEvent(7);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE apuestas SET estado=$1'),
      ['PERDIDA', 11]
    );
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuarios SET saldo_virtual=saldo_virtual+$1'),
      expect.anything()
    );
  });

  test('settleEvent devuelve el monto apostado cuando el evento es CANCELADO y aún no cierra si hay detalles PENDIENTE', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 7, estado: 'CANCELADO' }] };
      }
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{ id_detalle: 102, id_apuesta: 12, id_evento: 7, seleccion: 'EMPATE', id_usuario: 3 }]
        };
      }
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return {
          rows: [{ id_apuesta: 12, id_usuario: 3, monto: 30, premio_potencial: 90, estado: 'PENDIENTE' }]
        };
      }
      if (sql.includes('SELECT estado FROM detalle_apuestas')) {
        return { rows: [{ estado: 'ANULADA' }] };
      }
      if (sql.includes('UPDATE apuestas SET estado=$1')) {
        return { rowCount: 1, rows: [{ id_apuesta: 12 }] };
      }
      return { rows: [], rowCount: 0 };
    });

    await settleEvent(7);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuarios SET saldo_virtual=saldo_virtual+$1'),
      [30, 3]
    );

    client.query.mockClear();
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: 'LOCAL' }] };
      }
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{ id_detalle: 103, id_apuesta: 13, id_evento: 7, seleccion: 'LOCAL', id_usuario: 3 }]
        };
      }
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return {
          rows: [{ id_apuesta: 13, id_usuario: 3, monto: 20, premio_potencial: 80, estado: 'PENDIENTE' }]
        };
      }
      if (sql.includes('SELECT estado FROM detalle_apuestas')) {
        return { rows: [{ estado: 'ACERTADA' }, { estado: 'PENDIENTE' }] };
      }
      return { rows: [], rowCount: 0 };
    });

    await settleEvent(7);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE apuestas SET estado=$1'),
      expect.anything()
    );
  });

  test('mutateDetail sincroniza cuota_total y premio_potencial de la apuesta en create, update, delete y valida errores', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'BORRADOR' }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 2, estado: 'PROGRAMADO', cuota_local: 2 }] };
      }
      if (sql.includes('SELECT * FROM detalle_apuestas WHERE id_apuesta=$1 ORDER BY')) {
        return { rows: [{ id_detalle: 55, id_apuesta: 10, id_evento: 2, seleccion: 'LOCAL', cuota_fijada: 2 }] };
      }
      if (sql.includes('SELECT count(*)::int n')) {
        return { rows: [{ n: 2, total: 4 }] };
      }
      return { rows: [] };
    });

    const creado = await mutateDetail(3, 'APOSTADOR', null, {
      id_apuesta: 10,
      id_evento: 2,
      seleccion: 'LOCAL'
    }, 'create');

    expect(creado.id_detalle).toBe(55);
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE apuestas SET cuota_total=$1,premio_potencial=monto*$1 WHERE id_apuesta=$2',
      [4, 10]
    );

    // Errores en createDetail
    client.query.mockResolvedValue({ rows: [] });
    await expect(
      mutateDetail(3, 'APOSTADOR', null, { id_apuesta: 99, id_evento: 2, seleccion: 'LOCAL' }, 'create')
    ).rejects.toMatchObject({ status: 404 });

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'BORRADOR' }] };
      }
      return { rows: [] };
    });
    await expect(
      mutateDetail(3, 'APOSTADOR', null, { id_apuesta: 10, id_evento: 2, seleccion: 'LOCAL' }, 'create')
    ).rejects.toMatchObject({ status: 400 });

    // Update detail
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{
            id_detalle: 55,
            id_apuesta: 10,
            id_evento: 2,
            seleccion: 'LOCAL',
            id_usuario: 3,
            tipo: 'COMBINADA',
            apuesta_estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 2, estado: 'PROGRAMADO', cuota_empate: 3 }] };
      }
      if (sql.includes('UPDATE detalle_apuestas SET id_evento=$1')) {
        return { rows: [{ id_detalle: 55, id_apuesta: 10, id_evento: 2, seleccion: 'EMPATE', cuota_fijada: 3 }] };
      }
      if (sql.includes('SELECT count(*)::int n')) {
        return { rows: [{ n: 2, total: 6 }] };
      }
      return { rows: [] };
    });

    const editado = await mutateDetail(3, 'APOSTADOR', 55, { seleccion: 'EMPATE' }, 'update');
    expect(editado.seleccion).toBe('EMPATE');

    // Errores en changeDetail / updateDetail / deleteDetail
    await expect(mutateDetail(3, 'APOSTADOR', 55, { seleccion: 'MALA' }, 'update')).rejects.toMatchObject({
      status: 400
    });

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{ id_detalle: 55, id_apuesta: 10, id_evento: 2, seleccion: 'LOCAL', id_usuario: 3, tipo: 'SIMPLE', apuesta_estado: 'BORRADOR' }]
        };
      }
      return { rows: [{ count: '1' }] };
    });
    await expect(mutateDetail(3, 'APOSTADOR', 55, {}, 'delete')).rejects.toMatchObject({ status: 400 });
    await expect(mutateDetail(3, 'APOSTADOR', 55, { seleccion: 'LOCAL' }, 'update')).rejects.toMatchObject({ status: 400 });

    client.query.mockResolvedValue({ rows: [] });
    await expect(mutateDetail(3, 'APOSTADOR', 999, {}, 'delete')).rejects.toMatchObject({ status: 404 });

    client.query.mockResolvedValue({
      rows: [{ id_detalle: 55, id_apuesta: 10, id_usuario: 3, apuesta_estado: 'PENDIENTE' }]
    });
    await expect(mutateDetail(3, 'APOSTADOR', 55, {}, 'delete')).rejects.toMatchObject({ status: 409 });

    // Delete detail exitoso (cuando combinada tiene 3 detalles)
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{
            id_detalle: 55,
            id_apuesta: 10,
            id_evento: 2,
            seleccion: 'EMPATE',
            id_usuario: 3,
            tipo: 'COMBINADA',
            apuesta_estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT count(*) FROM detalle_apuestas')) {
        return { rows: [{ count: '3' }] };
      }
      if (sql.includes('SELECT count(*)::int n')) {
        return { rows: [{ n: 2, total: 3.5 }] };
      }
      return { rows: [] };
    });

    const borrado = await mutateDetail(3, 'APOSTADOR', 55, {}, 'delete');
    expect(borrado).toBeNull();
  });
});

// ============================================================
// 3. Pruebas unitarias: repositorio CRUD común, utilidades SQL y middleware de errores
// ============================================================

describe('Apuestas — responsable 3: crudRepository, utils/sql y middlewares/errors', () => {
  test('crudRepository ejecuta list, get, insert, update y remove sobre la tabla apuestas', async () => {
    query.mockResolvedValue({
      rows: [{ id_apuesta: 10, tipo: 'SIMPLE', monto: 25 }]
    });

    const lista = await crud.list('apuestas');
    expect(lista).toHaveLength(1);

    const obtenida = await crud.get('apuestas', 10);
    expect(obtenida.id_apuesta).toBe(10);

    const insertada = await crud.insert('apuestas', { tipo: 'SIMPLE', monto: 25 });
    expect(insertada.id_apuesta).toBe(10);

    await expect(crud.insert('apuestas', {})).rejects.toMatchObject({ status: 400 });

    const sinCambios = await crud.update('apuestas', 10, {});
    expect(sinCambios.id_apuesta).toBe(10);

    const actualizada = await crud.update('apuestas', 10, { monto: 50 });
    expect(actualizada.id_apuesta).toBe(10);

    const eliminada = await crud.remove('apuestas', 10);
    expect(eliminada.id_apuesta).toBe(10);

    expect(fields('apuestas', { monto: 30, invalido: 'x', estado: undefined }, ['id_apuesta'])).toEqual({
      monto: 30
    });
    expect(fields('apuestas', null)).toEqual({});
  });

  test('middleware errors maneja estados explícitos, códigos PostgreSQL 23505/23503, error 500 y headersSent', () => {
    const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    notFound({}, res);
    expect(res.status).toHaveBeenCalledWith(404);

    errors({ status: 400, message: 'Monto inválido' }, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(400);

    errors({ code: '23505', message: 'duplicado' }, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(409);

    errors({ code: '23503', message: 'foranea' }, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(409);

    errors({ message: 'fallo inesperado' }, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(500);

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    errors(new Error('detalle dev'), {}, res, next);
    process.env.NODE_ENV = prevEnv;

    res.headersSent = true;
    errors(new Error('ya enviado'), {}, res, next);
    expect(next).toHaveBeenCalled();

    spyConsole.mockRestore();
  });
});

// ============================================================
// 4. Pruebas HTTP con Supertest: API /api/apuestas, detalles, reportes y permisos
// ============================================================

describe('Apuestas — responsable 3: API HTTP con Supertest', () => {
  const apuestaBase = {
    id_apuesta: 10,
    id_usuario: 3,
    tipo: 'SIMPLE',
    monto: 25,
    cuota_total: 1.8,
    premio_potencial: 45,
    estado: 'BORRADOR'
  };

  beforeEach(() => {
    query.mockReset();
    jwt.verify.mockReset();

    jwt.verify.mockReturnValue({
      id_usuario: 3,
      perfil: 'APOSTADOR'
    });
  });

  test('GET /api/apuestas como APOSTADOR filtra y devuelve únicamente sus propias apuestas', async () => {
    query
      .mockResolvedValueOnce({ rows: [apuestaBase] })
      .mockResolvedValueOnce({ rows: [apuestaBase] });

    const response = await request(app)
      .get('/api/apuestas?limit=50&offset=0')
      .set('Authorization', 'Bearer token-apostador');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([apuestaBase]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM apuestas WHERE id_usuario=$1'),
      [3, 50, 0]
    );
  });

  test('GET /api/apuestas como ADMIN devuelve el listado general de apuestas', async () => {
    jwt.verify.mockReturnValue({ id_usuario: 1, perfil: 'ADMIN' });
    query.mockResolvedValue({ rows: [apuestaBase] });

    const response = await request(app)
      .get('/api/apuestas')
      .set('Authorization', 'Bearer token-admin');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([apuestaBase]);
  });

  test('GET /api/apuestas/:id permite al APOSTADOR ver su apuesta y devuelve 404 si pertenece a otro usuario', async () => {
    query.mockResolvedValueOnce({ rows: [apuestaBase] });

    const propia = await request(app)
      .get('/api/apuestas/10')
      .set('Authorization', 'Bearer token-apostador');

    expect(propia.statusCode).toBe(200);
    expect(propia.body.id_apuesta).toBe(10);

    query.mockResolvedValueOnce({ rows: [{ ...apuestaBase, id_usuario: 99 }] });

    const ajena = await request(app)
      .get('/api/apuestas/10')
      .set('Authorization', 'Bearer token-apostador');

    expect(ajena.statusCode).toBe(404);
  });

  test('GET /api/apuestas/:id como ADMIN devuelve mensaje cuando el registro no existe', async () => {
    jwt.verify.mockReturnValue({ id_usuario: 1, perfil: 'ADMIN' });
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/apuestas/999')
      .set('Authorization', 'Bearer token-admin');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ error: 'Registro no encontrado' });
  });

  test('POST /api/apuestas crea un borrador de apuesta (201) y rechaza datos inválidos (400)', async () => {
    const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT saldo_virtual')) {
        return { rows: [{ saldo_virtual: 1000 }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'PROGRAMADO', cuota_local: 1.8 }] };
      }
      if (sql.includes('INSERT INTO apuestas')) {
        return { rows: [apuestaBase] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .post('/api/apuestas')
      .set('Authorization', 'Bearer token-apostador')
      .send({
        tipo: 'SIMPLE',
        monto: 25,
        selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }]
      });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual(apuestaBase);

    const invalida = await request(app)
      .post('/api/apuestas')
      .set('Authorization', 'Bearer token-apostador')
      .send({ tipo: 'SIMPLE', monto: -10, selecciones: [] });

    expect(invalida.statusCode).toBe(400);
    spyConsole.mockRestore();
  });

  test('PATCH /api/apuestas/:id actualiza el monto de un borrador propio', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [apuestaBase] };
      }
      if (sql.includes('UPDATE apuestas SET monto=$1')) {
        return { rows: [{ ...apuestaBase, monto: 40, premio_potencial: 72 }] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .patch('/api/apuestas/10')
      .set('Authorization', 'Bearer token-apostador')
      .send({ monto: 40 });

    expect(response.statusCode).toBe(200);
    expect(response.body.monto).toBe(40);
    expect(response.body.premio_potencial).toBe(72);
  });

  test('PATCH /api/apuestas/:id con confirmar:true confirma el borrador y cambia estado a PENDIENTE', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [apuestaBase] };
      }
      if (sql.includes('SELECT saldo_virtual')) {
        return { rows: [{ saldo_virtual: 500 }] };
      }
      if (sql.includes('UPDATE apuestas SET estado=\'PENDIENTE\'')) {
        return { rows: [{ ...apuestaBase, estado: 'PENDIENTE' }] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .patch('/api/apuestas/10')
      .set('Authorization', 'Bearer token-apostador')
      .send({ confirmar: true });

    expect(response.statusCode).toBe(200);
    expect(response.body.estado).toBe('PENDIENTE');
  });

  test('DELETE /api/apuestas/:id elimina un borrador propio y devuelve 200', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [apuestaBase] };
      }
      if (sql.includes('DELETE FROM apuestas')) {
        return { rows: [apuestaBase] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .delete('/api/apuestas/10')
      .set('Authorization', 'Bearer token-apostador');

    expect(response.statusCode).toBe(200);
    expect(response.body.id_apuesta).toBe(10);
  });

  test('GET /api/apuestas/:id/detalles devuelve detalles de apuesta propia y 404 si no existe o es ajena', async () => {
    query
      .mockResolvedValueOnce({ rows: [apuestaBase] })
      .mockResolvedValueOnce({
        rows: [{ id_detalle: 1, id_apuesta: 10, id_evento: 1, seleccion: 'LOCAL', cuota_fijada: 1.8 }]
      });

    const ok = await request(app)
      .get('/api/apuestas/10/detalles')
      .set('Authorization', 'Bearer token-apostador');

    expect(ok.statusCode).toBe(200);
    expect(ok.body).toHaveLength(1);

    query.mockResolvedValueOnce({ rows: [] });
    const inexistente = await request(app)
      .get('/api/apuestas/999/detalles')
      .set('Authorization', 'Bearer token-apostador');
    expect(inexistente.statusCode).toBe(404);

    query.mockResolvedValueOnce({ rows: [{ ...apuestaBase, id_usuario: 88 }] });
    const ajena = await request(app)
      .get('/api/apuestas/10/detalles')
      .set('Authorization', 'Bearer token-apostador');
    expect(ajena.statusCode).toBe(404);
  });

  test('GET /api/reportes devuelve métricas de apuestas para ADMIN/GESTOR y 403 para APOSTADOR', async () => {
    const ForbiddenRes = await request(app)
      .get('/api/reportes')
      .set('Authorization', 'Bearer token-apostador');
    expect(ForbiddenRes.statusCode).toBe(403);

    jwt.verify.mockReturnValue({ id_usuario: 1, perfil: 'ADMIN' });
    query.mockResolvedValueOnce({
      rows: [{
        apuestas: '5',
        apuestas_pendientes: '2',
        apuestas_ganadas: '2',
        apuestas_perdidas: '1',
        creditos_apostados: '150',
        ganancias_virtuales: '80'
      }]
    });

    const OkRes = await request(app)
      .get('/api/reportes')
      .set('Authorization', 'Bearer token-admin');

    expect(OkRes.statusCode).toBe(200);
    expect(OkRes.body).toHaveProperty('apuestas', '5');
    expect(OkRes.body).toHaveProperty('creditos_apostados', '150');
  });

  test('verifica autenticación (401 sin token o token inválido), permisos de GESTOR en apuestas (403) y salud/esquema', async () => {
    const sinToken = await request(app).get('/api/apuestas');
    expect(sinToken.statusCode).toBe(401);

    jwt.verify.mockImplementationOnce(() => {
      throw new Error('jwt expired');
    });
    const tokenInvalido = await request(app)
      .get('/api/apuestas')
      .set('Authorization', 'Bearer token-expirado');
    expect(tokenInvalido.statusCode).toBe(401);

    jwt.verify.mockReturnValue({ id_usuario: 2, perfil: 'GESTOR' });
    const gestorPost = await request(app)
      .post('/api/apuestas')
      .set('Authorization', 'Bearer token-gestor')
      .send({ tipo: 'SIMPLE', monto: 10, selecciones: [{ id_evento: 1, seleccion: 'LOCAL' }] });
    expect(gestorPost.statusCode).toBe(403);

    query.mockResolvedValueOnce({ rows: [{ now: new Date() }] });
    const healthOk = await request(app).get('/api/health');
    expect(healthOk.statusCode).toBe(200);

    query.mockRejectedValueOnce(new Error('db down'));
    const healthFail = await request(app).get('/api/health');
    expect(healthFail.statusCode).toBe(503);

    jwt.verify.mockReturnValue({ id_usuario: 1, perfil: 'ADMIN' });
    inspectSchema.mockResolvedValueOnce({ tables: {}, missing: [] });
    const schemaOk = await request(app)
      .get('/api/schema')
      .set('Authorization', 'Bearer token-admin');
    expect(schemaOk.statusCode).toBe(200);
  });

  test('integra rutas HTTP de detalles de apuesta (/api/detalles) y liquidación de apuestas al finalizar evento', async () => {
    // GET /api/detalles como APOSTADOR
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id_detalle: 1, id_apuesta: 10, seleccion: 'LOCAL' }] });
    const listDetalles = await request(app)
      .get('/api/detalles')
      .set('Authorization', 'Bearer token-apostador');
    expect(listDetalles.statusCode).toBe(200);

    // GET /api/detalles/:id como APOSTADOR (propio y ajeno)
    query
      .mockResolvedValueOnce({ rows: [{ id_detalle: 1, id_apuesta: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id_usuario: 3 }] });
    const getDetallePropio = await request(app)
      .get('/api/detalles/1')
      .set('Authorization', 'Bearer token-apostador');
    expect(getDetallePropio.statusCode).toBe(200);

    query
      .mockResolvedValueOnce({ rows: [{ id_detalle: 1, id_apuesta: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id_usuario: 99 }] });
    const getDetalleAjeno = await request(app)
      .get('/api/detalles/1')
      .set('Authorization', 'Bearer token-apostador');
    expect(getDetalleAjeno.statusCode).toBe(404);

    // POST, PATCH y DELETE en /api/detalles sobre apuesta en borrador
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas WHERE id_apuesta=$1 FOR UPDATE')) {
        return { rows: [{ id_apuesta: 10, id_usuario: 3, estado: 'BORRADOR' }] };
      }
      if (sql.includes('FROM detalle_apuestas d JOIN apuestas a')) {
        return {
          rows: [{
            id_detalle: 1,
            id_apuesta: 10,
            id_evento: 1,
            seleccion: 'LOCAL',
            id_usuario: 3,
            tipo: 'COMBINADA',
            apuesta_estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 1, estado: 'PROGRAMADO', cuota_local: 2, cuota_empate: 3 }] };
      }
      if (sql.includes('SELECT count(*) FROM detalle_apuestas')) {
        return { rows: [{ count: '3' }] };
      }
      if (sql.includes('SELECT count(*)::int n')) {
        return { rows: [{ n: 2, total: 4 }] };
      }
      return { rows: [{ id_detalle: 1, id_apuesta: 10, seleccion: 'EMPATE', cuota_fijada: 3 }] };
    });

    const postDetalle = await request(app)
      .post('/api/detalles')
      .set('Authorization', 'Bearer token-apostador')
      .send({ id_apuesta: 10, id_evento: 1, seleccion: 'LOCAL' });
    expect(postDetalle.statusCode).toBe(201);

    const patchDetalle = await request(app)
      .patch('/api/detalles/1')
      .set('Authorization', 'Bearer token-apostador')
      .send({ seleccion: 'EMPATE' });
    expect(patchDetalle.statusCode).toBe(200);

    const deleteDetalle = await request(app)
      .delete('/api/detalles/1')
      .set('Authorization', 'Bearer token-apostador');
    expect(deleteDetalle.statusCode).toBe(200);

    // PATCH /api/eventos/:id a FINALIZADO dispara settleEvent para liquidar apuestas
    jwt.verify.mockReturnValue({ id_usuario: 2, perfil: 'GESTOR' });
    query.mockResolvedValueOnce({
      rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: 'LOCAL', marcador_local: 2, marcador_visitante: 1 }]
    });
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 7, estado: 'FINALIZADO', resultado: 'LOCAL' }] };
      }
      return { rows: [], rowCount: 0 };
    });

    const liquidarRes = await request(app)
      .patch('/api/eventos/7')
      .set('Authorization', 'Bearer token-gestor')
      .send({ estado: 'FINALIZADO', resultado: 'LOCAL' });
    expect(liquidarRes.statusCode).toBe(200);
    expect(liquidarRes.body).toHaveProperty('liquidacion');

    // Validación de cuotas en evento previo a apostar
    const cuotaInvalidaPost = await request(app)
      .post('/api/eventos')
      .set('Authorization', 'Bearer token-gestor')
      .send({ cuota_local: 0.9 });
    expect(cuotaInvalidaPost.statusCode).toBe(400);

    query.mockResolvedValueOnce({ rows: [{ id_evento: 7, cuota_local: 2.1, estado: 'PROGRAMADO' }] });
    const cuotaPatchOk = await request(app)
      .patch('/api/eventos/7')
      .set('Authorization', 'Bearer token-gestor')
      .send({ cuota_local: 2.1 });
    expect(cuotaPatchOk.statusCode).toBe(200);
  });
});
