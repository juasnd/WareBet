// Simular PostgreSQL para no consultar ni modificar Neon.
jest.mock('../src/config/db', () => ({
  pool: {
    connect: jest.fn()
  },
  query: jest.fn(),
  inspectSchema: jest.fn()
}));
 
// Simular la verificación del token.
jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  verify: jest.fn()
}));
 
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../src/config/db');
const { app } = require('../src/app');
 
let client;
 
// Silenciar console.error durante los tests (el middleware de errores
// lo imprime en cada rechazo esperado y solo genera ruido).
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
 
afterAll(() => {
  console.error.mockRestore();
});
 
beforeEach(() => {
  jest.clearAllMocks();
 
  client = {
    query: jest.fn(),
    release: jest.fn()
  };
 
  pool.connect.mockResolvedValue(client);
});
 
describe('Detalle apuestas - Validación y verificación', () => {
  beforeEach(() => {
    query.mockReset();
    jwt.verify.mockReset();
  });
 
  test('GET /api/detalles requiere autenticación', async () => {
    const response = await request(app).get('/api/detalles');
    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(jwt.verify).not.toHaveBeenCalled();
  });
 
  test('GET /api/detalles/:id requiere autenticación', async () => {
    const response = await request(app).get('/api/detalles/1');
    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
 
  test('APOSTADOR solo ve sus propios detalles', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT d.* FROM detalle_apuestas')) {
        return { rows: [{ id_detalle: 10, id_apuesta: 20, id_evento: 7 }] };
      }
      return { rows: [] };
    });
 
    const response = await request(app)
      .get('/api/detalles')
      .set('Authorization', 'Bearer token-pruebas');
 
    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalled();
 
    // La consulta debe filtrar por el usuario autenticado (id 5),
    // ya sea por parámetro o por la columna id_usuario en el SQL.
    // Ajusta esta verificación si tu consulta está escrita distinto.
    const filtraPorUsuario = query.mock.calls.some(
      ([sql, params]) =>
        (Array.isArray(params) && params.includes(5)) ||
        /id_usuario/.test(sql)
    );
    expect(filtraPorUsuario).toBe(true);
  });
 
  test('No se puede crear detalle si la apuesta no está en BORRADOR', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 20, id_usuario: 5, estado: 'PENDIENTE' }] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .post('/api/detalles')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        id_apuesta: 20,
        id_evento: 7,
        seleccion: 'LOCAL'
      });
 
    expect(response.statusCode).toBe(404);
    expect(response.body.error).toMatch(/borrador no encontrada/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('No se puede crear detalle si el evento no está PROGRAMADO o EN_VIVO', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 20, id_usuario: 5, estado: 'BORRADOR' }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 7, estado: 'FINALIZADO', cuota_local: 1.8 }] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .post('/api/detalles')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        id_apuesta: 20,
        id_evento: 7,
        seleccion: 'LOCAL'
      });
 
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/inválidos/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('No permite selección inválida', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 20, id_usuario: 5, estado: 'BORRADOR' }] };
      }
      if (sql.includes('SELECT * FROM eventos_deportivos')) {
        return { rows: [{ id_evento: 7, estado: 'PROGRAMADO', cuota_local: 1.8 }] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .post('/api/detalles')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        id_apuesta: 20,
        id_evento: 7,
        seleccion: 'EMPATE2'
      });
 
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/inválidos/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('Solo se editan detalles de apuestas en BORRADOR', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT d.*,a.id_usuario,a.tipo,a.estado apuesta_estado')) {
        return {
          rows: [{
            id_detalle: 10,
            id_apuesta: 20,
            id_usuario: 5,
            tipo: 'SIMPLE',
            apuesta_estado: 'PENDIENTE'
          }]
        };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .patch('/api/detalles/10')
      .set('Authorization', 'Bearer token-pruebas')
      .send({ seleccion: 'LOCAL' });
 
    expect(response.statusCode).toBe(409);
    expect(response.body.error).toMatch(/borrador/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('No se puede dejar apuesta SIMPLE sin detalles válidos', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT d.*,a.id_usuario,a.tipo,a.estado apuesta_estado')) {
        return {
          rows: [{
            id_detalle: 10,
            id_apuesta: 20,
            id_usuario: 5,
            tipo: 'SIMPLE',
            apuesta_estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT count(*)')) {
        return { rows: [{ count: '1' }] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .delete('/api/detalles/10')
      .set('Authorization', 'Bearer token-pruebas');
 
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/conservar una selección simple/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('No se puede dejar apuesta COMBINADA con menos de 2 detalles', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('SELECT d.*,a.id_usuario,a.tipo,a.estado apuesta_estado')) {
        return {
          rows: [{
            id_detalle: 10,
            id_apuesta: 20,
            id_usuario: 5,
            tipo: 'COMBINADA',
            apuesta_estado: 'BORRADOR'
          }]
        };
      }
      if (sql.includes('SELECT count(*)')) {
        return { rows: [{ count: '2' }] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
 
    const response = await request(app)
      .delete('/api/detalles/10')
      .set('Authorization', 'Bearer token-pruebas');
 
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/dos combinadas/i);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
 
  test('GET /api/apuestas/:id/detalles devuelve solo detalles de esa apuesta', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 20, id_usuario: 5 }] };
      }
      if (sql.includes('SELECT * FROM detalle_apuestas WHERE id_apuesta')) {
        return { rows: [{ id_detalle: 10, id_apuesta: 20 }] };
      }
      return { rows: [] };
    });
 
    const response = await request(app)
      .get('/api/apuestas/20/detalles')
      .set('Authorization', 'Bearer token-pruebas');
 
    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].id_apuesta).toBe(20);
  });
 
  test('APOSTADOR no puede ver detalles de apuesta ajena', async () => {
    jwt.verify.mockReturnValue({
      id_usuario: 5,
      perfil: 'APOSTADOR'
    });
 
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM apuestas')) {
        return { rows: [{ id_apuesta: 20, id_usuario: 99 }] };
      }
      return { rows: [] };
    });
 
    const response = await request(app)
      .get('/api/apuestas/20/detalles')
      .set('Authorization', 'Bearer token-pruebas');
 
    expect(response.statusCode).toBe(404);
 
    // No debe haberse consultado la tabla de detalles de una apuesta ajena.
    const consultoDetalles = query.mock.calls.some(([sql]) =>
      sql.includes('SELECT * FROM detalle_apuestas')
    );
    expect(consultoDetalles).toBe(false);
  });
});


//npx jest tests/detalle_apuestas.validacion.test.js --runInBand