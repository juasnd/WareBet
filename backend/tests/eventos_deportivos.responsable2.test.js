
// Simular PostgreSQL para no consultar ni modificar Neon.
jest.mock('../src/config/db', () => ({
  pool: {
    connect: jest.fn()
  },
  query: jest.fn(),
  inspectSchema: jest.fn()
}));

// Simular la verificación del token.
// Los permisos por perfil se comprueban con el middleware real.
jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  verify: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../src/config/db');
const {
  settleEvent,
  createDraft
} = require('../src/services/bettingService');
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

// Preparar las respuestas simuladas de la liquidación.
// Estos casos no incluyen apuestas asociadas al evento.
function prepararEvento(evento) {
  client.query.mockImplementation(async (sql) => {
    if (sql.includes('SELECT * FROM eventos_deportivos')) {
      return {
        rows: evento ? [evento] : []
      };
    }

    return {
      rows: [],
      rowCount: 0
    };
  });
}

// ============================================================
// 1. Pruebas unitarias: marcadores y resultados
// ============================================================

describe('Eventos deportivos — responsable 2: resultados', () => {
  test.each([
    [2, 1, 'LOCAL'],
    [0, 3, 'VISITANTE'],
    [1, 1, 'EMPATE'],
    [0, 0, 'EMPATE']
  ])(
    'marcador %i-%i produce %s',
    async (local, visitante, resultado) => {
      prepararEvento({
        estado: 'FINALIZADO',
        marcador_local: local,
        marcador_visitante: visitante
      });

      await expect(settleEvent(7)).resolves.toEqual({
        procesadas: 0
      });

      expect(client.query).toHaveBeenCalledWith(
        expect.stringMatching(
          /UPDATE\s+eventos_deportivos\s+SET\s+resultado\s*=\s*\$1\s+WHERE\s+id_evento\s*=\s*\$2/i
        ),
        [resultado, 7]
      );

      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  );

  test.each([
    ['nulo', null],
    ['ausente', undefined],
    ['negativo', -1],
    ['decimal', 1.5],
    ['texto', 'abc'],
    ['no finito', NaN]
  ])(
    'rechaza marcador %s y revierte',
    async (_nombre, marcador) => {
      prepararEvento({
        estado: 'FINALIZADO',
        marcador_local: marcador,
        marcador_visitante: 1
      });

      await expect(settleEvent(7)).rejects.toMatchObject({
        status: 400
      });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['PROGRAMADO', 'EN_VIVO'])(
    'no liquida un evento %s',
    async (estado) => {
      prepararEvento({ estado });

      await expect(settleEvent(7)).rejects.toMatchObject({
        status: 400
      });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  );

  test('evento inexistente devuelve 404', async () => {
    prepararEvento(null);

    await expect(settleEvent(7)).rejects.toMatchObject({
      status: 404
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('evento cancelado no necesita marcadores', async () => {
    prepararEvento({
      estado: 'CANCELADO',
      marcador_local: null,
      marcador_visitante: null
    });

    await expect(settleEvent(7)).resolves.toEqual({
      procesadas: 0
    });

    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE eventos_deportivos'),
      expect.anything()
    );

    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('conserva el resultado ya guardado', async () => {
    prepararEvento({
      estado: 'FINALIZADO',
      resultado: 'VISITANTE',
      marcador_local: 0,
      marcador_visitante: 2
    });

    await settleEvent(7);

    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE eventos_deportivos'),
      expect.anything()
    );

    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 2. Pruebas unitarias: disponibilidad de eventos
// ============================================================

describe('Eventos deportivos — responsable 2: disponibilidad', () => {
  test.each(['FINALIZADO', 'CANCELADO', 'INEXISTENTE'])(
    'impide seleccionar un evento %s',
    async (estado) => {
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT saldo_virtual')) {
          return {
            rows: [{ saldo_virtual: 1000 }]
          };
        }

        if (sql.includes('SELECT * FROM eventos_deportivos')) {
          return {
            rows: estado === 'INEXISTENTE' ? [] : [{ estado }]
          };
        }

        return {
          rows: []
        };
      });

      await expect(
        createDraft(2, {
          tipo: 'SIMPLE',
          monto: 10,
          selecciones: [
            {
              id_evento: 7,
              seleccion: 'LOCAL'
            }
          ]
        })
      ).rejects.toMatchObject({
        message: 'Evento no disponible',
        status: 400
      });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');

      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO apuestas'),
        expect.anything()
      );

      expect(client.release).toHaveBeenCalledTimes(1);
    }
  );
});

// ============================================================
// 3. Pruebas HTTP con Supertest: CRUD, cuotas y permisos
// ============================================================

describe('Eventos deportivos — responsable 2: API con Supertest', () => {
  const evento = {
    id_evento: 7,
    deporte: 'Futbol',
    competencia: 'Liga Demo',
    equipo_local: 'Equipo A',
    equipo_visitante: 'Equipo B',
    fecha_inicio: '2026-11-01T18:00:00-05:00',
    cuota_local: 1.8,
    cuota_empate: 3.2,
    cuota_visitante: 4.1,
    estado: 'PROGRAMADO'
  };

  beforeEach(() => {
    query.mockReset();
    jwt.verify.mockReset();

    jwt.verify.mockReturnValue({
      id_usuario: 2,
      perfil: 'GESTOR'
    });
  });

  test('GET /api/eventos devuelve una lista vacía', async () => {
    query.mockResolvedValue({
      rows: []
    });

    const response = await request(app)
      .get('/api/eventos')
      .set('Authorization', 'Bearer token-pruebas');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
    expect(query).toHaveBeenCalled();
  });

  test('GET /api/eventos devuelve los eventos disponibles', async () => {
    query.mockResolvedValue({
      rows: [evento]
    });

    const response = await request(app)
      .get('/api/eventos')
      .set('Authorization', 'Bearer token-pruebas');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([evento]);
  });

  test('GET /api/eventos/:id devuelve un evento', async () => {
    query.mockResolvedValue({
      rows: [evento]
    });

    const response = await request(app)
      .get('/api/eventos/7')
      .set('Authorization', 'Bearer token-pruebas');

    expect(response.statusCode).toBe(200);
    expect(response.body.id_evento).toBe(7);
    expect(response.body.equipo_local).toBe('Equipo A');

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+"id_evento"\s*=\s*\$1/i),
      ['7']
    );
  });

  test('POST /api/eventos permite crear un evento', async () => {
    query.mockResolvedValue({
      rows: [evento]
    });

    const nuevoEvento = {
      deporte: evento.deporte,
      competencia: evento.competencia,
      equipo_local: evento.equipo_local,
      equipo_visitante: evento.equipo_visitante,
      fecha_inicio: evento.fecha_inicio,
      cuota_local: evento.cuota_local,
      cuota_empate: evento.cuota_empate,
      cuota_visitante: evento.cuota_visitante,
      estado: evento.estado
    };

    const response = await request(app)
      .post('/api/eventos')
      .set('Authorization', 'Bearer token-pruebas')
      .send(nuevoEvento);

    expect(response.statusCode).toBe(201);
    expect(response.body).toHaveProperty('id_evento', 7);
    expect(response.body.equipo_local).toBe('Equipo A');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO eventos_deportivos'),
      expect.arrayContaining(['Equipo A', 'Equipo B'])
    );
  });

  test('POST /api/eventos rechaza una cuota menor o igual a 1', async () => {
    query.mockResolvedValue({
      rows: [{ ...evento, cuota_local: 1 }]
    });

    const response = await request(app)
      .post('/api/eventos')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        deporte: evento.deporte,
        competencia: evento.competencia,
        equipo_local: evento.equipo_local,
        equipo_visitante: evento.equipo_visitante,
        fecha_inicio: evento.fecha_inicio,
        cuota_local: 1,
        cuota_empate: evento.cuota_empate,
        cuota_visitante: evento.cuota_visitante,
        estado: evento.estado
      });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test('PATCH /api/eventos/:id permite actualizar una cuota', async () => {
    query.mockResolvedValue({
      rows: [{ ...evento, cuota_local: 2 }]
    });

    const response = await request(app)
      .patch('/api/eventos/7')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        cuota_local: 2
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.cuota_local).toBe(2);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE eventos_deportivos'),
      [2, '7']
    );
  });

  test('PATCH /api/eventos/:id rechaza una cuota inválida', async () => {
    const response = await request(app)
      .patch('/api/eventos/7')
      .set('Authorization', 'Bearer token-pruebas')
      .send({
        cuota_local: 0
      });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(query).not.toHaveBeenCalled();
  });

  test('DELETE /api/eventos/:id permite eliminar un evento', async () => {
    query.mockResolvedValue({
      rows: [evento]
    });

    const response = await request(app)
      .delete('/api/eventos/7')
      .set('Authorization', 'Bearer token-pruebas');

    expect(response.statusCode).toBe(200);
    expect(response.body.id_evento).toBe(7);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM eventos_deportivos'),
      ['7']
    );
  });

  test('GET /api/eventos exige autenticación', async () => {
    const response = await request(app)
      .get('/api/eventos');

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  test.each(['post', 'patch', 'delete'])(
    'APOSTADOR no puede realizar %s sobre eventos',
    async (method) => {
      jwt.verify.mockReturnValue({
        id_usuario: 3,
        perfil: 'APOSTADOR'
      });

      const ruta = method === 'post'
        ? '/api/eventos'
        : '/api/eventos/7';

      const response = await request(app)[method](ruta)
        .set('Authorization', 'Bearer token-pruebas')
        .send({
          cuota_local: 2
        });

      expect(response.statusCode).toBe(403);
      expect(query).not.toHaveBeenCalled();
    }
  );
});
