# API de apuestas deportivas

API REST con Express y PostgreSQL para gestionar usuarios, eventos y apuestas con créditos virtuales. Se conecta a las cuatro tablas existentes; el servidor no crea ni altera el esquema.

## Inicio

1. Node.js 20 o superior.
2. Copia `.env.example` a `.env` y configura `DATABASE_URL` y `JWT_SECRET`.
3. Ejecuta `npm install`, `npm run dev` (desarrollo) o `npm start` (producción). Escucha en `http://localhost:3000`.
4. Para crear el administrador inicial, proporciona `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` al entorno y ejecuta `npm run create-admin`.

La ruta `GET /api/health` prueba la conexión y responde sin datos sensibles. Al iniciar, se verifica con `SELECT NOW()` y se inspeccionan columnas en `information_schema.columns`. Usa `GET /api/schema` como ADMIN para consultar esa inspección.

## Rutas

Salvo registro, login y health, se requiere `Authorization: Bearer <JWT>`.

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/health` | Público |
| POST | `/api/auth/register` | Público; crea APOSTADOR con 1000 créditos |
| POST | `/api/auth/login` | Público; `{ "correo": "...", "clave": "..." }` |
| GET/PATCH | `/api/auth/me` | Usuario autenticado; PATCH admite `nombre` |
| PATCH | `/api/auth/password` | `{ "clave_actual": "...", "clave_nueva": "..." }` |
| GET | `/api/menu` | Menú permitido por perfil |
| GET/POST/PATCH/DELETE | `/api/usuarios` | ADMIN |
| GET/POST/PATCH/DELETE | `/api/eventos` | Lectura autenticada; cambios ADMIN/GESTOR |
| GET/POST/PATCH/DELETE | `/api/apuestas` | APOSTADOR ve sus datos; alta crea borrador |
| GET | `/api/apuestas/:id/detalles` | Dueño o perfil autorizado |
| GET | `/api/detalles` y `/api/detalles/:id` | APOSTADOR ve solo sus detalles; lectura ADMIN/GESTOR |
| GET | `/api/reportes` | ADMIN/GESTOR |

Crear borrador:

```json
{
  "tipo": "SIMPLE",
  "monto": 25,
  "selecciones": [{ "id_evento": 1, "seleccion": "LOCAL" }]
}
```

Para COMBINADA envía dos o más selecciones. Confirma con `PATCH /api/apuestas/:id` y cuerpo `{ "confirmar": true }`. El backend vuelve a bloquear el usuario y comprueba saldo antes de descontar. Las cuotas se guardan al crear el borrador. Cambiar `estado` de evento a FINALIZADO/CANCELADO liquida los detalles pendientes de forma transaccional e idempotente. Las cuotas cambiadas emiten `odds:updated` por Socket.IO.

La colección Postman importable está en `postman_collection.json`. Variables: `baseUrl` y `token`.

## Verificación

`npm test` ejecuta pruebas unitarias sin escribir en Neon. La conexión fue comprobada durante la implementación y las cuatro tablas y sus tipos fueron inspeccionados. Las pruebas de CRUD y liquidación contra datos no se ejecutan en la base real porque no se configuró una base de pruebas aislada; así se evita insertar o modificar registros existentes.
