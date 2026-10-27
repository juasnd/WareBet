# APIs de WareBet por tabla y responsable

Documento basado en las rutas implementadas en `backend/src/app.js`, los permisos de `backend/src/config/permissions.js` y las operaciones de `backend/src/services/bettingService.js`.

Se conserva la numeración del informe `informes/INFORME_SONARQUBE_WAREBET.md`. Los nombres de los integrantes quedan por asignar.

## Reparto del trabajo

| Responsable | Tabla en PostgreSQL | Recurso de la API | Alcance principal |
|---|---|---|---|
| 1 — nombre pendiente | `usuarios` | `/api/usuarios`, `/api/auth`, `/api/menu` | Usuarios, autenticación, perfil y revisión del saldo. |
| 2 — nombre pendiente | `eventos_deportivos` | `/api/eventos` | Eventos, cuotas, marcadores y resultados. |
| 3 — nombre pendiente | `apuestas` | `/api/apuestas` | Creación de borradores, edición, confirmación y eliminación. |
| 4 — nombre pendiente | `detalle_apuestas` | `/api/detalles` | Selecciones de cada apuesta y consulta de sus detalles. |

## Configuración para consumir la API

- URL local predeterminada: `http://localhost:3000` (el puerto puede cambiar mediante `PORT`).
- Enviar cuerpos JSON con `Content-Type: application/json`.
- Todas las rutas requieren `Authorization: Bearer <token>`, excepto registro, inicio de sesión y salud.
- Obtener el token mediante `POST /api/auth/login`; la respuesta contiene `token` y `usuario`.
- Las cuatro rutas de listado admiten `?limit=100&offset=0`; el límite predeterminado es 100 y el máximo previsto es 200.
- Los perfiles del sistema son `ADMIN`, `GESTOR` y `APOSTADOR`. No equivalen a los cuatro responsables del equipo.
- El CRUD utiliza `PATCH` para editar; no hay rutas `PUT` implementadas.

## 1. Responsable 1 — tabla `usuarios`

Clave primaria: `id_usuario`.

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| POST | `/api/auth/register` | Registrar un apostador con saldo virtual inicial de 1000. | Público |
| POST | `/api/auth/login` | Iniciar sesión y obtener un JWT. | Público |
| GET | `/api/auth/me` | Consultar el usuario autenticado. | Cualquier perfil autenticado |
| PATCH | `/api/auth/me` | Actualizar el nombre del usuario autenticado. | Cualquier perfil autenticado |
| PATCH | `/api/auth/password` | Cambiar la contraseña del usuario autenticado. | Cualquier perfil autenticado |
| GET | `/api/menu` | Consultar el menú del usuario según su perfil y opciones. | Cualquier perfil autenticado |
| GET | `/api/usuarios` | Listar usuarios. | ADMIN |
| GET | `/api/usuarios/:id` | Consultar un usuario por ID. | ADMIN |
| POST | `/api/usuarios` | Crear un usuario desde administración. | ADMIN |
| PATCH | `/api/usuarios/:id` | Actualizar un usuario desde administración. | ADMIN |
| DELETE | `/api/usuarios/:id` | Eliminar un usuario. | ADMIN |

### Cuerpos de ejemplo

Registro público:

```json
{"nombre":"Usuario Demo","correo":"demo@example.com","clave":"clave-demo-123"}
```

Inicio de sesión:

```json
{"correo":"demo@example.com","clave":"clave-demo-123"}
```

Editar el perfil propio:

```json
{"nombre":"Nuevo nombre"}
```

Cambiar contraseña:

```json
{"clave_actual":"clave-demo-123","clave_nueva":"nueva-clave-123"}
```

Crear un usuario como ADMIN:

```json
{"nombre":"Gestor Demo","correo":"gestor@example.com","clave":"clave-gestor-123","perfil":"GESTOR","opciones_menu":[]}
```

El registro público exige nombre, correo y clave de al menos ocho caracteres. El cambio de contraseña también exige ocho caracteres para la nueva clave. Estas validaciones de longitud no están implementadas en el CRUD administrativo. Las respuestas de usuario excluyen `clave_hash`.

**Coordinación:** revisar con el responsable 3 el descuento de saldo al confirmar una apuesta y con los responsables 2, 3 y 4 el abono al liquidar resultados.

## 2. Responsable 2 — tabla `eventos_deportivos`

Clave primaria: `id_evento`. La ruta utiliza `eventos`, aunque la tabla se llama `eventos_deportivos`.

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/api/eventos` | Listar eventos deportivos. | ADMIN, GESTOR, APOSTADOR |
| GET | `/api/eventos/:id` | Consultar un evento por ID. | ADMIN, GESTOR, APOSTADOR |
| POST | `/api/eventos` | Crear un evento. | ADMIN, GESTOR |
| PATCH | `/api/eventos/:id` | Actualizar datos, cuotas, estado o resultado. | ADMIN, GESTOR |
| DELETE | `/api/eventos/:id` | Eliminar un evento. | ADMIN, GESTOR |

### Cuerpos de ejemplo

Crear evento:

```json
{
  "deporte":"Futbol",
  "competencia":"Liga Demo",
  "equipo_local":"Equipo A",
  "equipo_visitante":"Equipo B",
  "fecha_inicio":"2026-11-01T18:00:00-05:00",
  "cuota_local":1.8,
  "cuota_empate":3.2,
  "cuota_visitante":4.1,
  "estado":"PROGRAMADO"
}
```

Actualizar cuotas:

```json
{"cuota_local":1.9,"cuota_empate":3.1,"cuota_visitante":4.0}
```

Finalizar evento:

```json
{"estado":"FINALIZADO","marcador_local":2,"marcador_visitante":1,"resultado":"LOCAL"}
```

Cancelar evento:

```json
{"estado":"CANCELADO"}
```

Al editar cuotas, el backend exige valores numéricos mayores que 1 y emite el evento Socket.IO `odds:updated` con `{ "evento": ... }`. Esta validación de cuotas está en `PATCH`, no en `POST`.

Actualizar un evento a `FINALIZADO` o `CANCELADO` activa la liquidación y devuelve `{ "evento": ..., "liquidacion": { "procesadas": ... } }`. Si se finaliza sin un resultado guardado, el servicio lo calcula a partir de los marcadores.

**Coordinación:** la liquidación actualiza detalles, apuestas y saldos; debe revisarse con los otros tres responsables.

## 3. Responsable 3 — tabla `apuestas`

Clave primaria: `id_apuesta`. Relación con usuarios mediante `id_usuario`.

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/api/apuestas` | Listar apuestas; el apostador solo recibe las propias. | ADMIN, GESTOR, APOSTADOR |
| GET | `/api/apuestas/:id` | Consultar una apuesta; el apostador solo puede consultar las propias. | ADMIN, GESTOR, APOSTADOR |
| POST | `/api/apuestas` | Crear un borrador junto con sus selecciones. | ADMIN, APOSTADOR |
| PATCH | `/api/apuestas/:id` | Editar monto o selecciones de un borrador propio. | ADMIN, APOSTADOR |
| PATCH | `/api/apuestas/:id` | Confirmar un borrador propio con `confirmar: true`. | ADMIN, APOSTADOR |
| DELETE | `/api/apuestas/:id` | Eliminar un borrador propio y sus detalles. | ADMIN, APOSTADOR |

Las dos operaciones `PATCH` usan la misma ruta: el campo `confirmar` determina cuál se ejecuta. Incluso para ADMIN, la creación utiliza el ID del usuario autenticado y la edición, confirmación y eliminación exigen propiedad de la apuesta.

### Cuerpos de ejemplo

Crear apuesta simple:

```json
{"tipo":"SIMPLE","monto":25,"selecciones":[{"id_evento":1,"seleccion":"LOCAL"}]}
```

Crear apuesta combinada:

```json
{"tipo":"COMBINADA","monto":25,"selecciones":[{"id_evento":1,"seleccion":"LOCAL"},{"id_evento":2,"seleccion":"EMPATE"}]}
```

Editar monto:

```json
{"monto":40}
```

Confirmar:

```json
{"confirmar":true}
```

Reglas del flujo:

- `SIMPLE` exige una selección y `COMBINADA` al menos dos.
- El monto debe ser numérico y mayor que cero.
- No se permite repetir un evento al crear una apuesta o reemplazar sus selecciones.
- Solo se seleccionan eventos `PROGRAMADO` o `EN_VIVO`; la selección puede ser `LOCAL`, `EMPATE` o `VISITANTE`.
- El backend calcula las cuotas y el premio potencial a partir de los eventos.
- Crear el borrador verifica saldo suficiente; confirmar vuelve a verificarlo, descuenta el monto y cambia el estado a `PENDIENTE`.
- Solo se editan y eliminan apuestas en estado `BORRADOR`.

**Coordinación:** el responsable 4 revisa las selecciones y el responsable 1 los movimientos de saldo.

## 4. Responsable 4 — tabla `detalle_apuestas`

Clave primaria: `id_detalle`. Relaciones mediante `id_apuesta` e `id_evento`. El recurso CRUD se llama `detalles`.

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/api/detalles` | Listar detalles; el apostador solo recibe los de sus apuestas. | ADMIN, GESTOR, APOSTADOR |
| GET | `/api/detalles/:id` | Consultar un detalle; el apostador solo puede consultar los propios. | ADMIN, GESTOR, APOSTADOR |
| POST | `/api/detalles` | Añadir una selección a una apuesta en borrador. | ADMIN, APOSTADOR |
| PATCH | `/api/detalles/:id` | Cambiar evento o selección de un detalle en borrador. | ADMIN, APOSTADOR |
| DELETE | `/api/detalles/:id` | Eliminar un detalle de una apuesta en borrador. | ADMIN, APOSTADOR |
| GET | `/api/apuestas/:id/detalles` | Consultar los detalles de una apuesta concreta. | Cualquier perfil autenticado; APOSTADOR solo de apuestas propias |

### Cuerpos de ejemplo

Añadir selección:

```json
{"id_apuesta":1,"id_evento":2,"seleccion":"VISITANTE"}
```

Editar selección:

```json
{"seleccion":"EMPATE"}
```

El servicio fija `cuota_fijada` a partir del evento y recalcula `cuota_total` y `premio_potencial` de la apuesta después de cada alta, cambio o baja. APOSTADOR solo modifica detalles propios; ADMIN puede modificar los de otros usuarios si la apuesta está en borrador.

La eliminación impide dejar una apuesta sin selecciones o una combinada con menos de dos. El alta individual de detalles no contiene las mismas comprobaciones de cantidad y eventos repetidos que la creación completa de apuestas; esa diferencia debe considerarse al probar estas rutas.

**Coordinación:** revisar los cálculos con el responsable 3 y la disponibilidad de eventos con el responsable 2.

## Rutas transversales

Estas rutas no representan una quinta tabla; se propone distribuirlas así:

| Método | Ruta | Función | Acceso | Responsable propuesto |
|---|---|---|---|---|
| GET | `/api/health` | Verificar API y conexión a PostgreSQL. | Público | 2, con revisión del equipo |
| GET | `/api/schema` | Inspeccionar el esquema de la base de datos. | ADMIN | 1, con revisión del equipo |
| GET | `/api/reportes` | Consultar conteos de usuarios, eventos y apuestas, y totales de créditos y ganancias. | ADMIN, GESTOR | 3, con revisión de 1, 2 y 4 |

## Respuestas y pruebas compartidas

- Las creaciones exitosas devuelven `201`; las demás operaciones exitosas usan normalmente `200`.
- `401`: falta el token, es inválido o expiró; también se utiliza para credenciales de inicio de sesión incorrectas.
- `403`: el perfil no tiene el permiso requerido.
- `400`: validaciones de entrada o reglas del servicio, por ejemplo monto inválido.
- `404`: rutas inexistentes, determinadas búsquedas sin resultado o restricciones de propiedad.
- `409`: conflictos como saldo insuficiente, estado no editable y errores PostgreSQL de unicidad o clave foránea.

El comportamiento ante IDs inexistentes varía según la ruta: algunas consultas CRUD devuelven `200` con `{"error":"Registro no encontrado"}` y algunas operaciones pueden responder con un cuerpo vacío. Al documentar o probar, conservar esta distinción respecto de las rutas que sí devuelven `404`.

Cada responsable debe comprobar sus rutas con los perfiles permitidos y denegados. Los cambios al repositorio CRUD, autenticación y manejo de errores son compartidos. Este inventario se verificó contra el código fuente; no implica una ejecución de peticiones contra la base de datos.
