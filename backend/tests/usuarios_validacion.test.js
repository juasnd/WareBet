// La suite usa PostgreSQL simulado y no accede a la base de datos real.
jest.mock('../src/config/db', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn()
  },
  query: jest.fn(),
  inspectSchema: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  verify: jest.fn(),
  sign: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');
const { app } = require('../src/app');

let client;

const usuario = {
  id_usuario: 7,
  nombre: 'Ana Pérez',
  correo: 'ana@example.com',
  clave_hash: 'hash-secreto',
  perfil: 'APOSTADOR',
  opciones_menu: [],
  saldo_virtual: 1000,
  activo: true
};

function autenticar(perfil = 'ADMIN', id_usuario = 1) {
  jwt.verify.mockReturnValue({ id_usuario, perfil });
}

function conToken(ruta) {
  return ruta.set('Authorization', 'Bearer token-pruebas');
}

beforeEach(() => {
  jest.clearAllMocks();
  autenticar();
  jwt.sign.mockReturnValue('jwt-firmado');
  bcrypt.hash.mockResolvedValue('hash-generado');
  bcrypt.compare.mockResolvedValue(true);

  client = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValue(client);
});

describe('Usuarios — registro y autenticación', () => {
  test.each([
    ['sin nombre', { correo: 'ana@example.com', clave: 'clave-segura' }],
    ['sin correo', { nombre: 'Ana', clave: 'clave-segura' }],
    ['sin contraseña', { nombre: 'Ana', correo: 'ana@example.com' }],
    ['contraseña corta', { nombre: 'Ana', correo: 'ana@example.com', clave: '1234567' }]
  ])('rechaza registro %s sin consultar la base', async (_caso, datos) => {
    const response = await request(app).post('/api/auth/register').send(datos);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Nombre, correo y contraseña/i);
    expect(query).not.toHaveBeenCalled();
  });

  test('registra usuario normalizando el correo y aplicando valores seguros', async () => {
    query.mockResolvedValue({ rows: [usuario] });

    const response = await request(app).post('/api/auth/register').send({
      nombre: 'Ana Pérez',
      correo: '  ANA@Example.com ',
      clave: 'clave-segura',
      perfil: 'ADMIN',
      saldo_virtual: 90000,
      activo: false,
      campo_desconocido: 'ignorar'
    });

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty('clave_hash');
    expect(response.body).toMatchObject({ perfil: 'APOSTADOR', saldo_virtual: 1000, activo: true });
    expect(bcrypt.hash).toHaveBeenCalledWith('clave-segura', 12);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuarios'),
      expect.arrayContaining(['ANA@Example.com'.toLowerCase(), 'hash-generado', 'APOSTADOR', 1000])
    );
  });

  test('devuelve 409 al registrar un correo duplicado', async () => {
    query.mockRejectedValue(Object.assign(new Error('correo duplicado'), { code: '23505' }));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app).post('/api/auth/register').send({
      nombre: 'Ana', correo: 'ana@example.com', clave: 'clave-segura'
    });

    errorLog.mockRestore();
    expect(response.status).toBe(409);
  });

  test('inicia sesión con correo normalizado y no expone el hash', async () => {
    pool.query.mockResolvedValue({ rows: [usuario] });

    const response = await request(app).post('/api/auth/login').send({
      correo: ' ANA@EXAMPLE.COM ', clave: 'clave-segura'
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ token: 'jwt-firmado', usuario: { id_usuario: 7 } });
    expect(response.body.usuario).not.toHaveProperty('clave_hash');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('lower(correo)'), ['ana@example.com']
    );
    expect(bcrypt.compare).toHaveBeenCalledWith('clave-segura', usuario.clave_hash);
    expect(jwt.sign).toHaveBeenCalledWith(
      { id_usuario: 7, perfil: 'APOSTADOR' }, process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
  });

  test.each([
    ['usuario inexistente', [], 'clave-segura'],
    ['contraseña incorrecta', [usuario], 'incorrecta'],
    ['usuario desactivado', [{ ...usuario, activo: false }], 'clave-segura']
  ])('rechaza inicio de sesión con %s', async (_caso, rows, clave) => {
    pool.query.mockResolvedValue({ rows });
    if (clave === 'incorrecta') bcrypt.compare.mockResolvedValue(false);

    const response = await request(app).post('/api/auth/login').send({
      correo: 'ana@example.com', clave
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Correo o contraseña incorrectos/);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});

describe('Usuarios — consulta y privacidad', () => {
  test('GET /api/usuarios exige autenticación', async () => {
    const response = await request(app).get('/api/usuarios');

    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  test('solo ADMIN puede listar usuarios y la respuesta oculta clave_hash', async () => {
    autenticar('GESTOR', 2);
    const denegada = await conToken(request(app).get('/api/usuarios'));
    expect(denegada.status).toBe(403);
    expect(query).not.toHaveBeenCalled();

    autenticar('ADMIN', 1);
    query.mockResolvedValue({ rows: [usuario] });
    const permitida = await conToken(request(app).get('/api/usuarios?limit=10&offset=2'));

    expect(permitida.status).toBe(200);
    expect(permitida.body).toHaveLength(1);
    expect(permitida.body[0]).not.toHaveProperty('clave_hash');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM usuarios'), [10, 2]);
  });

  test('GET /api/usuarios/:id devuelve usuario seguro o el mensaje de no encontrado', async () => {
    query.mockResolvedValueOnce({ rows: [usuario] }).mockResolvedValueOnce({ rows: [] });

    const encontrado = await conToken(request(app).get('/api/usuarios/7'));
    const inexistente = await conToken(request(app).get('/api/usuarios/99'));

    expect(encontrado.status).toBe(200);
    expect(encontrado.body).not.toHaveProperty('clave_hash');
    expect(inexistente.status).toBe(200);
    expect(inexistente.body).toEqual({ error: 'Registro no encontrado' });
  });

  test('GET /api/auth/me devuelve el perfil propio sin clave_hash', async () => {
    query.mockResolvedValue({ rows: [usuario] });
    autenticar('APOSTADOR', 7);

    const response = await conToken(request(app).get('/api/auth/me'));

    expect(response.status).toBe(200);
    expect(response.body.id_usuario).toBe(7);
    expect(response.body).not.toHaveProperty('clave_hash');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id_usuario"=$1'), [7]
    );
  });

  test('GET /api/menu devuelve opciones del perfil y respeta las ocultas', async () => {
    query.mockResolvedValue({ rows: [{ ...usuario, opciones_menu: ['-eventos'] }] });
    autenticar('APOSTADOR', 7);

    const response = await conToken(request(app).get('/api/menu'));

    expect(response.status).toBe(200);
    expect(response.body.perfil).toBe('APOSTADOR');
    expect(response.body.opciones.map(({ id }) => id)).toEqual(['dashboard', 'mis-apuestas', 'perfil']);
  });
});

describe('Usuarios — administración y perfil', () => {
  test('ADMIN crea usuario con clave cifrada y valores predeterminados', async () => {
    query.mockResolvedValue({ rows: [usuario] });

    const response = await conToken(request(app).post('/api/usuarios').send({
      nombre: 'Ana Pérez', correo: 'ana@example.com', clave: 'clave-segura',
      perfil: 'APOSTADOR', saldo_virtual: 0, activo: false
    }));

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty('clave_hash');
    expect(bcrypt.hash).toHaveBeenCalledWith('clave-segura', 12);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuarios'),
      expect.arrayContaining(['hash-generado', 'APOSTADOR', 1000])
    );
  });

  test('POST /api/usuarios exige clave y restringe la escritura a ADMIN', async () => {
    const sinClave = await conToken(request(app).post('/api/usuarios').send({ nombre: 'Ana' }));
    expect(sinClave.status).toBe(400);
    expect(sinClave.body.error).toBe('Falta clave');

    autenticar('APOSTADOR', 7);
    const sinPermiso = await conToken(request(app).post('/api/usuarios').send({
      nombre: 'Ana', correo: 'ana@example.com', clave: 'clave-segura'
    }));
    expect(sinPermiso.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  test('actualiza datos del perfil propio sin permitir cambiar campos protegidos', async () => {
    query.mockResolvedValue({ rows: [{ ...usuario, nombre: 'Ana María' }] });
    autenticar('APOSTADOR', 7);

    const response = await conToken(request(app).patch('/api/auth/me').send({
      nombre: 'Ana María', perfil: 'ADMIN', saldo_virtual: 999999,
      correo: 'otro@example.com', campo_desconocido: true
    }));

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Ana María');
    expect(response.body).not.toHaveProperty('clave_hash');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuarios'),
      expect.arrayContaining(['Ana María', expect.any(Date), 7])
    );
  });

  test('rechaza actualización del perfil sin campos permitidos', async () => {
    autenticar('APOSTADOR', 7);

    const response = await conToken(request(app).patch('/api/auth/me').send({
      perfil: 'ADMIN', saldo_virtual: 5, correo: 'cambio@example.com'
    }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No hay campos de perfil permitidos');
    expect(query).not.toHaveBeenCalled();
  });

  test('rechaza opciones_menu que no sea una lista', async () => {
    const response = await conToken(request(app).patch('/api/usuarios/7').send({
      opciones_menu: 'dashboard'
    }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('opciones_menu debe ser una lista');
    expect(query).not.toHaveBeenCalled();
  });

  test('cambia contraseña dentro de transacción y revierte si la actual es incorrecta', async () => {
    autenticar('APOSTADOR', 7);
    bcrypt.compare.mockResolvedValue(false);
    client.query.mockImplementation(async (sql) => (
      sql.includes('SELECT * FROM usuarios') ? { rows: [usuario] } : { rows: [] }
    ));
    const incorrecta = await conToken(request(app).patch('/api/auth/password').send({
      clave_actual: 'vieja', clave_nueva: 'nueva-segura'
    }));

    expect(incorrecta.status).toBe(400);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2,
      'SELECT * FROM usuarios WHERE id_usuario=$1 FOR UPDATE', [7]);
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    autenticar('APOSTADOR', 7);
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('hash-nueva');
    client = {
      query: jest.fn().mockImplementation(async (sql) => (
        sql.includes('SELECT * FROM usuarios') ? { rows: [usuario] } : { rows: [] }
      )),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(client);

    const correcta = await conToken(request(app).patch('/api/auth/password').send({
      clave_actual: 'vieja', clave_nueva: 'nueva-segura'
    }));

    expect(correcta.status).toBe(200);
    expect(correcta.body).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
