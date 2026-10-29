# Informe de Validación y Verificación — Tabla `apuestas` (Responsable 3)

## 1. Alcance y Resumen Ejecutivo

- **Proyecto:** `WareBet` (`apuestas-deportivas-backend`)
- **Responsable:** Responsable 3 — Tabla `apuestas`
- **Recursos y módulos evaluados:**
  - Endpoints CRUD y rutas asociadas en `backend/src/app.js`:
    - `GET /api/apuestas` (listado general para `ADMIN`/`GESTOR` y filtrado de apuestas propias para `APOSTADOR`)
    - `GET /api/apuestas/:id` (consulta individual con control de propiedad)
    - `POST /api/apuestas` (creación transaccional de borrador `SIMPLE` o `COMBINADA`)
    - `PATCH /api/apuestas/:id` (edición de monto/selecciones en borrador o confirmación con `confirmar: true`)
    - `DELETE /api/apuestas/:id` (eliminación de borrador y sus selecciones asociadas)
    - `GET /api/apuestas/:id/detalles` (consulta de selecciones de una apuesta)
    - `GET /api/reportes` (métricas globales de apuestas, créditos apostados y ganancias virtuales)
  - Servicio de dominio: `backend/src/services/bettingService.js` (`createDraft`, `confirm`, `updateDraft`, `deleteDraft`, `replaceDetallesForApuesta`, `syncBetTotalsFromDetalles`, `mutateDetail`, `settleEvent`, `settleBetAndCreditUser`)
  - Capa de datos y transversal: `backend/src/repositories/crudRepository.js`, `backend/src/middlewares/auth.js`, `backend/src/middlewares/errors.js`, `backend/src/utils/sql.js`, `backend/src/config/permissions.js`
- **Resultados obtenidos:**
  - **Pruebas con Jest y Supertest:** **32 pruebas aprobadas** de 32 (0 fallidas), superando el mínimo requerido de 15 pruebas.
  - **Verificación estática con ESLint:** Configuración dedicada con **7 reglas explícitas** más las reglas recomendadas de `@eslint/js`. Se detectaron y corrigieron **3 errores estáticos** en el código fuente, logrando **0 errores y 0 advertencias**.
  - **Cobertura de código (Coverage):** **90.02 % en sentencias (Statements)**, **84.24 % en ramas (Branches)**, **90.47 % en funciones (Functions)** y **99.31 % en líneas (Lines)**, superando en todas las métricas el objetivo del **80 %**.

---

## 2. Comandos Utilizados

Todos los comandos se ejecutaron dentro del directorio `backend`:

```powershell
# 1. Ubicarse en la carpeta del backend
cd backend

# 2. Instalar dependencias (incluyendo jest, supertest, eslint y @eslint/js)
npm install

# 3. Ejecutar verificación estática inicial con ESLint para el alcance de apuestas
npx eslint --config eslint.responsable3.config.cjs src/app.js src/services/bettingService.js src/repositories/crudRepository.js src/middlewares/auth.js src/middlewares/errors.js src/utils/sql.js eslint.responsable3.config.cjs

# 4. Aplicar correcciones automáticas de ESLint donde aplica
npx eslint --config eslint.responsable3.config.cjs src/app.js src/services/bettingService.js src/repositories/crudRepository.js src/middlewares/auth.js src/middlewares/errors.js src/utils/sql.js tests/apuestas.responsable3.test.js eslint.responsable3.config.cjs --fix

# 5. Verificar que ESLint finalice con 0 errores y 0 advertencias
npm run lint:apuestas

# 6. Ejecutar la suite de pruebas de apuestas (Jest + Supertest) y generar reporte de cobertura
npm test
# (O su equivalente específico: npm run test:apuestas)

# 7. Comprobar compatibilidad con las demás pruebas del repositorio
npm run test:eventos
npm run lint:eventos
npm run test:unit
```

### Scripts configurados en `backend/package.json`

| Script | Comando ejecutado | Propósito |
|---|---|---|
| `npm test` | `jest --runInBand --runTestsByPath tests/apuestas.responsable3.test.js --coverage` | Ejecuta las 32 pruebas unitarias y de integración HTTP de `apuestas` y calcula la cobertura. |
| `npm run test:apuestas` | `jest --runInBand --runTestsByPath tests/apuestas.responsable3.test.js --coverage` | Alias dedicado para el Responsable 3 (`apuestas`). |
| `npm run lint:apuestas` | `eslint --config eslint.responsable3.config.cjs ... --max-warnings 0` | Ejecuta el análisis estático con ESLint sobre los módulos de `apuestas` y su archivo de pruebas. |
| `npm run lint` | `eslint --config eslint.responsable3.config.cjs ... --max-warnings 0` | Comando general de linting estático en el backend. |
| `npm run test:unit` | `node --test tests/unit.test.js` | Conserva las pruebas base con `node:test`. |

---

## 3. Verificación Estática mediante ESLint

### 3.1. Configuración y Reglas Aplicadas (`backend/eslint.responsable3.config.cjs`)

Se creó el archivo `backend/eslint.responsable3.config.cjs` utilizando el formato Flat Config de ESLint 10 sobre CommonJS. Además del conjunto base `@eslint/js` (`js.configs.recommended.rules`), se definieron **7 reglas específicas de calidad y estilo**:

| # | Regla ESLint | Configuración | Propósito en la verificación estática |
|---|---|---|---|
| 1 | `semi` | `['error', 'always']` | Exige punto y coma explícito al final de cada sentencia para evitar ambigüedades de ASI (*Automatic Semicolon Insertion*). |
| 2 | `quotes` | `['error', 'single']` | Estandariza el uso de comillas simples en todas las cadenas de texto y consultas SQL. |
| 3 | `eqeqeq` | `['error', 'always']` | Obliga a utilizar comparaciones estrictas (`===` y `!==`), previniendo coerciones implícitas de tipos en validaciones de IDs, montos o estados. |
| 4 | `no-var` | `'error'` | Prohíbe declaraciones con `var`, forzando ámbito de bloque mediante `let` o `const`. |
| 5 | `prefer-const` | `'error'` | Exige `const` para toda referencia que no sea reasignada tras su declaración. |
| 6 | `no-eval` | `'error'` | Bloquea el uso de `eval()` por motivos de seguridad e inyección de código. |
| 7 | `no-unused-vars` | `['error', { argsIgnorePattern: '^_' }]` | Detecta variables o importaciones declaradas pero nunca utilizadas, permitiendo parámetros intencionalmente ignorados con prefijo `_`. |

### 3.2. Hallazgos Detectados por ESLint y Correcciones Realizadas

Durante la primera ejecución del análisis estático (`npx eslint --config eslint.responsable3.config.cjs ...`), ESLint reportó **3 errores**:

```text
C:\Users\NW\WareBet\backend\src\app.js
  25:451  error  'data' is never reassigned. Use 'const' instead  prefer-const

C:\Users\NW\WareBet\backend\src\repositories\crudRepository.js
  2:9  error  'allowed' is assigned a value but never used  no-unused-vars

C:\Users\NW\WareBet\backend\src\services\bettingService.js
  27:5  error  Strings must use singlequote  quotes

✖ 3 problems (3 errors, 0 warnings)
```

**Acciones correctivas aplicadas:**
1. **`backend/src/app.js` (línea 25 — regla `prefer-const`):** Se sustituyó `let data = fields(...)` por `const data = fields(...)` en el controlador `PATCH /api/:path/:id`, dado que la referencia del objeto no se reasigna.
2. **`backend/src/repositories/crudRepository.js` (línea 2 — regla `no-unused-vars`):** Se eliminó la desestructuración sin uso de `allowed` en `const { tables } = require('../utils/sql');`.
3. **`backend/src/services/bettingService.js` (línea 27 — regla `quotes`):** En `insertDetalleApuesta`, se reemplazó la cadena con comillas dobles por comillas simples con escape (`'INSERT INTO detalle_apuestas(id_apuesta,id_evento,seleccion,cuota_fijada,estado) VALUES($1,$2,$3,$4,\'PENDIENTE\')'`).

Tras estas correcciones, la ejecución de `npm run lint:apuestas` (y también `npm run lint:eventos`) finalizó con **0 errores y 0 advertencias**.

---

## 4. Validación Dinámica con Jest y Supertest (`tests/apuestas.responsable3.test.js`)

### 4.1. Mejora de Validación Funcional en `createDraft`

Al revisar el flujo de creación de borradores en `backend/src/services/bettingService.js` (línea 78), se identificó que si el cliente enviaba `selecciones: null` o un valor que no fuera arreglo, `createDraft` podía intentar acceder a `selecciones.length` sin verificar `Array.isArray(selecciones)` (a diferencia de `replaceDetallesForApuesta`, que sí lo comprobaba). Se fortaleció la guarda en `createDraft`:

```javascript
if (!Array.isArray(selecciones) || (tipo === 'SIMPLE' && selecciones.length !== 1) || (tipo === 'COMBINADA' && selecciones.length < 2)) {
  throw fail('Cantidad de selecciones inválida');
}
```

### 4.2. Catálogo de las 32 Pruebas Implementadas

Las pruebas se estructuraron en `backend/tests/apuestas.responsable3.test.js` aislando la base de datos PostgreSQL mediante `jest.mock('../src/config/db')` y simulando la firma JWT con `jest.mock('jsonwebtoken')` mientras se conserva el middleware real de autorización por perfiles (`ADMIN`, `GESTOR`, `APOSTADOR`):

| # | Bloque / Suite | Caso de prueba | Resultado esperado | Estado |
|---|---|---|---|---|
| 1 | `createDraft` | Crear borrador `SIMPLE` válido | Calcula `cuota_total` y `premio_potencial`, inserta apuesta y detalle dentro de transacción `BEGIN`/`COMMIT`. | PASS |
| 2 | `createDraft` | Crear borrador `COMBINADA` válido | Multiplica cuotas de múltiples eventos (`EN_VIVO`/`PROGRAMADO`) y calcula premio potencial. | PASS |
| 3 | `createDraft` | Rechazar tipo inválido (`TRIPLE`) | Lanza error `400` (`Tipo o monto inválido`) sin abrir conexión al pool. | PASS |
| 4 | `createDraft` | Rechazar monto igual a `0` | Lanza error `400` (`Tipo o monto inválido`) antes de iniciar transacción. | PASS |
| 5 | `createDraft` | Rechazar monto negativo (`-15`) | Lanza error `400` (`Tipo o monto inválido`) antes de iniciar transacción. | PASS |
| 6 | `createDraft` | Rechazar apuesta `SIMPLE` sin selecciones | Lanza error `400` (`Cantidad de selecciones inválida`). | PASS |
| 7 | `createDraft` | Rechazar apuesta `COMBINADA` con 1 sola selección | Lanza error `400` (`Cantidad de selecciones inválida`). | PASS |
| 8 | `createDraft` | Rechazar `selecciones: null` (no es arreglo) | Lanza error `400` (`Cantidad de selecciones inválida`). | PASS |
| 9 | `createDraft` | Rechazar por usuario inexistente (`404`), selección inválida (`400`), evento no disponible (`400`), evento repetido (`400`) o saldo insuficiente (`409`) | Ejecuta `ROLLBACK` y libera el cliente en cada condición de error. | PASS |
| 10 | Confirmación y edición | `confirm` de borrador propio con saldo suficiente | Descuenta `monto` de `saldo_virtual` en `usuarios`, pasa apuesta a `PENDIENTE` y hace `COMMIT`. | PASS |
| 11 | Confirmación y edición | `confirm` con apuesta inexistente (`404`), estado no borrador (`409`) o saldo insuficiente (`409`) | Revierte transacción con `ROLLBACK` y devuelve el código de estado respectivo. | PASS |
| 12 | Confirmación y edición | `updateDraft` actualizando monto y reemplazando selecciones | Elimina detalles previos, inserta nuevas selecciones y recalcula `cuota_total` y `premio_potencial`. | PASS |
| 13 | Confirmación y edición | `updateDraft` ante apuesta inexistente (`404`), estado `PENDIENTE` (`409`), monto negativo (`400`), selecciones inválidas/repetidas o evento finalizado (`400`) | Revierte la transacción (`ROLLBACK`) sin modificar la apuesta. | PASS |
| 14 | Confirmación y edición | `deleteDraft` en estado `BORRADOR` y rechazos (`404` / `409`) | Elimina primero `detalle_apuestas`, luego la fila en `apuestas`, o revierte si no es borrador. | PASS |
| 15 | Liquidación y pago | `settleEvent` calcula resultado (`LOCAL`, `VISITANTE`, `EMPATE`), liquida apuesta como `GANADA` y acredita `premio_potencial` | Actualiza estado de la apuesta a `GANADA` y suma el premio al `saldo_virtual` del usuario. | PASS |
| 16 | Liquidación y pago | `settleEvent` con selección fallida | Marca el detalle como `FALLADA`, la apuesta como `PERDIDA` y no acredita saldo (`payout = 0`). | PASS |
| 17 | Liquidación y pago | `settleEvent` con evento `CANCELADO` y combinadas con detalles pendientes | Si todos los detalles son `ANULADA`, reintegra el `monto` apostado; si hay detalles en `PENDIENTE`, no cierra aún la apuesta. | PASS |
| 18 | Sincronización | `mutateDetail` (`create`, `update`, `delete`) y validaciones | Recalcula `cuota_total` y `premio_potencial` en `apuestas` tras cada cambio de detalle y valida mínimos de selecciones. | PASS |
| 19 | Capa común | `crudRepository` (`list`, `get`, `insert`, `update`, `remove`) y `utils/sql` (`fields`) | Verifica las consultas parametrizadas sobre la tabla `apuestas` y el filtrado de columnas permitidas. | PASS |
| 20 | Capa común | Middleware `errors` y `notFound` | Comprueba respuestas `404`, errores con `status`, códigos PostgreSQL `23505`/`23503` (`409`), error `500` y delegación con `headersSent`. | PASS |
| 21 | API Supertest | `GET /api/apuestas` como `APOSTADOR` | Filtra por `id_usuario` autenticado (`200 OK`) respetando `limit` y `offset`. | PASS |
| 22 | API Supertest | `GET /api/apuestas` como `ADMIN` | Devuelve el listado general de apuestas mediante `crud.list('apuestas')` (`200 OK`). | PASS |
| 23 | API Supertest | `GET /api/apuestas/:id` como `APOSTADOR` (propia vs. ajena) | Devuelve `200` para apuesta propia y `404` cuando pertenece a otro usuario. | PASS |
| 24 | API Supertest | `GET /api/apuestas/:id` como `ADMIN` para registro inexistente | Responde `200` con `{"error": "Registro no encontrado"}`. | PASS |
| 25 | API Supertest | `POST /api/apuestas` válido (`201`) e inválido (`400`) | Crea el borrador con estado `201` o devuelve `400` ante monto/selecciones inválidas. | PASS |
| 26 | API Supertest | `PATCH /api/apuestas/:id` para editar monto | Actualiza el monto y el premio potencial del borrador (`200 OK`). | PASS |
| 27 | API Supertest | `PATCH /api/apuestas/:id` con `{"confirmar": true}` | Confirma el borrador propio y devuelve la apuesta en estado `PENDIENTE` (`200 OK`). | PASS |
| 28 | API Supertest | `DELETE /api/apuestas/:id` | Elimina el borrador propio y sus detalles (`200 OK`). | PASS |
| 29 | API Supertest | `GET /api/apuestas/:id/detalles` | Devuelve los detalles de una apuesta propia (`200`) y `404` si no existe o es de otro apostador. | PASS |
| 30 | API Supertest | `GET /api/reportes` por perfil (`ADMIN` vs `APOSTADOR`) | Devuelve conteos de apuestas y créditos para `ADMIN` (`200`) y rechaza a `APOSTADOR` (`403`). | PASS |
| 31 | API Supertest | Seguridad: sin token (`401`), token inválido (`401`), `GESTOR` intentando escribir en `/api/apuestas` (`403`), `/api/health` y `/api/schema` | Comprueba autenticación JWT, control de acceso basado en roles y endpoints de estado. | PASS |
| 32 | API Supertest | Integración HTTP con `/api/detalles` y liquidación al finalizar evento en `/api/eventos/:id` | Comprueba el flujo HTTP completo de edición de selecciones de una apuesta y su liquidación automática. | PASS |

---

## 5. Resultados de Cobertura de Código (Coverage > 80 %)

Al ejecutar `npm test` (que corre Jest con `--coverage`), se obtuvo el siguiente reporte de cobertura sobre los módulos del backend vinculados al flujo de apuestas:

```text
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
--------------------|---------|----------|---------|---------|-------------------
All files           |   90.02 |    84.24 |   90.47 |   99.31 |                   
 src                |   74.25 |    66.16 |   71.42 |     100 |                   
  app.js            |   74.25 |    66.16 |   71.42 |     100 | 5-14,16,20-26     
 src/config         |     100 |      100 |     100 |     100 |                   
  permissions.js    |     100 |      100 |     100 |     100 |                   
 src/middlewares    |     100 |      100 |     100 |     100 |                   
  auth.js           |     100 |      100 |     100 |     100 |                   
  errors.js         |     100 |      100 |     100 |     100 |                   
 src/repositories   |     100 |      100 |     100 |     100 |                   
  crudRepository.js |     100 |      100 |     100 |     100 |                   
 src/services       |   99.12 |    97.14 |     100 |   99.09 |                   
  bettingService.js |   99.12 |    97.14 |     100 |   99.09 | 65,69             
 src/utils          |     100 |      100 |     100 |     100 |                   
  sql.js            |     100 |      100 |     100 |     100 |                   
--------------------|---------|----------|---------|---------|-------------------
Test Suites: 1 passed, 1 total
Tests:       32 passed, 32 total
```

### Resumen de métricas frente al umbral requerido (> 80 %)

| Métrica | Cobertura Alcanzada | Umbral Mínimo | Cumplimiento |
|---|---:|---:|---|
| **Statements (Sentencias)** | **90.02 %** | 80.00 % | Cumple (+10.02 %) |
| **Branches (Ramas)** | **84.24 %** | 80.00 % | Cumple (+4.24 %) |
| **Functions (Funciones)** | **90.47 %** | 80.00 % | Cumple (+10.47 %) |
| **Lines (Líneas)** | **99.31 %** | 80.00 % | Cumple (+19.31 %) |

Además del resumen en consola, Jest genera automáticamente los reportes detallados en `backend/coverage/`:
- Reporte interactivo HTML: `backend/coverage/lcov-report/index.html`
- Reporte LCOV para herramientas de análisis (como SonarQube): `backend/coverage/lcov.info`
- Reporte XML Clover / JSON: `backend/coverage/clover.xml` y `backend/coverage/coverage-final.json`
