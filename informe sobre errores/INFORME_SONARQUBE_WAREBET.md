# Informe de remediación SonarQube — WareBet

## Objetivo

Dejar el proyecto con **0 incidencias abiertas** en el análisis de SonarQube. El snapshot actual es una línea base para repartir el trabajo; no demuestra que el código ya esté corregido. El *Quality Gate* aparece como **OK**, pero el proyecto conserva incidencias, así que el gate por sí solo no acredita el objetivo de cero.

## Snapshot consultado

- Fecha: 27 de octubre de 2026
- Servidor: SonarQube 26.9.0.129388 en `http://localhost:9000`
- Proyecto: `WareBet`
- Incidencias encontradas: **29**; abiertas: **29**
- Tipo: **29 code smells**, **0 bugs**, **0 vulnerabilidades**, **0 hotspots**. Los hallazgos actuales son de tipo `CODE_SMELL`.
- Severidades: CRITICAL: 3, MAJOR: 25, MINOR: 1
- Estimación de deuda de Sonar: **3 h 12 min** (estimación automática, no plazo real).
- Métricas: **140** líneas de código; duplicación **0.0%**; cobertura reportada **0.0%**. Cero cobertura puede indicar que no se importó el reporte de tests; no equivale a cero pruebas.
> **Cómo leer CRITICAL:** en este snapshot los tres `CRITICAL` son code smells de complejidad (`S3776`), no bugs críticos ni vulnerabilidades.

## Las cuatro tablas y cómo repartir el trabajo

| Responsable | Tabla | Qué debe atender |
|---|---|---|
| 1 | `usuarios` | Repositorio CRUD común; revisión con responsable 3 del débito de saldo en `confirm`; revisión con el equipo de liquidación cuando `settleEvent` acredita saldo. |
| 2 | `eventos_deportivos` | Repositorio CRUD común; validación de eventos y cuotas en creación/edición de selecciones; resultado y finalización del evento. |
| 3 | `apuestas` | Repositorio CRUD común; borradores, confirmación, edición y eliminación; estado/pago final de las apuestas. |
| 4 | `detalle_apuestas` | Repositorio CRUD común; altas/cambios/bajas de selecciones y actualización de estado por evento. |

**Trabajo compartido:** los 3 hallazgos de `crudRepository.js` se corrigen una sola vez y benefician a las cuatro tablas. `errors.js` y `server.js` son tareas transversales. Las funciones `updateDraft`, `mutateDetail` y `settleEvent` tocan varias tablas: asigne un responsable principal por función y revisores de las otras tablas involucradas; no cree cuatro copias de la misma incidencia.

## Errores concretos y corrección esperada

La columna “Tablas comprometidas” indica las tablas que ese flujo consulta o modifica, no que todas tengan un defecto de esquema. Las claves permiten abrir la incidencia exacta en el dashboard.

| Clave Sonar | Archivo:línea | Área | Tablas comprometidas | Severidad / regla | Qué está mal y qué debe cambiarse |
|---|---|---|---|---|---|
| `a608137f-3108-4549-898d-e4ce6ca8ef5b` | `backend/src/middlewares/errors.js:5` | middleware de errores | Transversal; no corresponde a una tabla | MAJOR / `javascript:S3358` | **Operador ternario anidado que dificulta leer la decisión.** Sustituir el ternario encadenado de err.code por if/switch; conservar 23505→409, 23503→409 y el default 500. |
| `4c05122f-f1e2-46a2-924f-a46877dd1bdc` | `backend/src/repositories/crudRepository.js:8` | CRUD genérico | usuarios; eventos_deportivos; apuestas; detalle_apuestas (capa común) | MAJOR / `javascript:S4624` | **Plantillas literales anidadas dentro del SQL dinámico.** Construir antes del SQL las listas quotedKeys y placeholders; insertar esas variables en la plantilla externa, sin plantillas dentro de map(). Mantener valores reales como parámetros $1..$n. |
| `6716c113-c867-48ea-9808-cb29a3e292d2` | `backend/src/repositories/crudRepository.js:8` | CRUD genérico | usuarios; eventos_deportivos; apuestas; detalle_apuestas (capa común) | MAJOR / `javascript:S4624` | **Plantillas literales anidadas dentro del SQL dinámico.** Construir antes del SQL las listas quotedKeys y placeholders; insertar esas variables en la plantilla externa, sin plantillas dentro de map(). Mantener valores reales como parámetros $1..$n. |
| `24fcfbd3-26b7-4e5d-bcd6-16d467a66006` | `backend/src/repositories/crudRepository.js:12` | CRUD genérico | usuarios; eventos_deportivos; apuestas; detalle_apuestas (capa común) | MAJOR / `javascript:S4624` | **Plantillas literales anidadas dentro del SQL dinámico.** Construir setClauses antes del SQL (una expresión por columna) y usarla en la plantilla externa; mantener valores en params y el id como último parámetro. |
| `1b617f55-73ca-4f22-a500-8a0b3f800fbf` | `backend/src/server.js:4` | inicio/verificación de servidor | Transversal; no corresponde a una tabla | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Poner llaves al if(schema.missing.length) que controla console.error; dejar console.log fuera para que se ejecute siempre, como ahora. |
| `f75b723d-dac4-4b87-8b3a-f34f93496cb4` | `backend/src/services/bettingService.js:14` | createDraft | eventos_deportivos; relación evento-apuesta/detalle | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Encerrar el throw de la validación evs.includes(...) entre llaves; mantener evs.push(...) después del if, porque debe ejecutarse para cada selección válida. |
| `eb8be734-bfb3-45d2-a6c9-f626a8791cdd` | `backend/src/services/bettingService.js:29` | confirm | apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves al guard !a y al guard de estado BORRADOR, como dos comprobaciones independientes y secuenciales. |
| `8de16674-7e5f-4da2-be1e-0322b6b50569` | `backend/src/services/bettingService.js:35` | updateDraft | apuestas; edición de selecciones enlaza eventos y detalles | CRITICAL / `javascript:S3776` | **Complejidad cognitiva por encima del máximo configurado.** Dividir updateDraft: validar monto/selecciones, reemplazar detalles y recalcular la apuesta en helpers pequeños. Pasar el mismo cliente transaccional a los helpers; conservar BEGIN/COMMIT/ROLLBACK. |
| `46a08a45-932e-4fac-be1f-e0d6487fa4cc` | `backend/src/services/bettingService.js:36` | updateDraft | apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de apuesta inexistente y estado BORRADOR; preservar que el segundo solo se alcanza si existe la apuesta. |
| `1eba7e93-ab7d-4047-9e2d-bb8694b9aa0f` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de selección repetida/inválida y evento no disponible; mantener DELETE/seen.add/cálculo de cuota solo dentro del bloque de reemplazo y en el orden actual. |
| `79977df5-3452-4cea-8fe5-b8fc970047c5` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de selección repetida/inválida y evento no disponible; mantener DELETE/seen.add/cálculo de cuota solo dentro del bloque de reemplazo y en el orden actual. |
| `d2015f77-a4cd-41e0-badb-4c1f4162b04d` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de selección repetida/inválida y evento no disponible; mantener DELETE/seen.add/cálculo de cuota solo dentro del bloque de reemplazo y en el orden actual. |
| `ba6d7fb4-5a5f-4931-afc8-8fbbb2ee574f` | `backend/src/services/bettingService.js:38` | updateDraft | apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a la validación de monto; ejecutar UPDATE apuestas solo después de que el monto sea válido. |
| `6b6aa3cc-176f-48d4-9cf6-fbcbab10cd60` | `backend/src/services/bettingService.js:40` | deleteDraft | apuestas; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de apuesta inexistente y borrador; dejar los DELETE después de que ambos guards hayan pasado. |
| `b42e037d-7e9b-4781-86bb-6bf366980ce4` | `backend/src/services/bettingService.js:40` | deleteDraft | apuestas; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a los guards de apuesta inexistente y borrador; dejar los DELETE después de que ambos guards hayan pasado. |
| `448833a6-53e1-4f29-adc5-316445970487` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a la validación de apuesta borrador y a la validación de evento; mantener la consulta/creación de detalle solo después de validar. |
| `f362308a-c1b9-46aa-94a2-6afc133b2be0` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a la validación de apuesta borrador y a la validación de evento; mantener la consulta/creación de detalle solo después de validar. |
| `28d878b1-4b08-40dd-99f4-da4135834a62` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | CRITICAL / `javascript:S3776` | **Complejidad cognitiva por encima del máximo configurado.** Dividir mutateDetail en rutas create/update/delete y una rutina de recálculo. Mantener las comprobaciones de dueño/perfil y todos los cambios bajo la misma transacción. |
| `36986403-39a0-4175-a152-5a310417125b` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MINOR / `javascript:S6582` | **Sonar recomienda optional chaining para la comprobación segura de null.** Cambiar !a || a.estado!==BORRADOR por a?.estado!==BORRADOR (o equivalente legible); el caso inexistente debe seguir produciendo el mismo error 404 y no acceder a a.estado. |
| `15f21462-3ab4-4188-9f0b-e939f118d730` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Reformatear el if/else de edición/eliminación con llaves en cada rama; dar llaves a guards de propietario, estado, selección y evento. Preservar el límite mínimo de selecciones. |
| `a6c15d55-59d7-4957-aa8b-849b3c8fe951` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Reformatear el if/else de edición/eliminación con llaves en cada rama; dar llaves a guards de propietario, estado, selección y evento. Preservar el límite mínimo de selecciones. |
| `b2eb8494-f6df-400c-b4b0-7037a85c49b4` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Reformatear el if/else de edición/eliminación con llaves en cada rama; dar llaves a guards de propietario, estado, selección y evento. Preservar el límite mínimo de selecciones. |
| `c1a4c5d4-5992-40cf-acf0-385e2813db31` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Reformatear el if/else de edición/eliminación con llaves en cada rama; dar llaves a guards de propietario, estado, selección y evento. Preservar el límite mínimo de selecciones. |
| `c1bac08c-c35c-42f9-a7f0-30767c214325` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas; eventos_deportivos; detalle_apuestas | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Reformatear el if/else de edición/eliminación con llaves en cada rama; dar llaves a guards de propietario, estado, selección y evento. Preservar el límite mínimo de selecciones. |
| `9eafc095-cbcc-4e46-8e31-6b16c8007246` | `backend/src/services/bettingService.js:45` | settleEvent | eventos_deportivos; detalle_apuestas; apuestas; usuarios (saldo/pago) | CRITICAL / `javascript:S3776` | **Complejidad cognitiva por encima del máximo configurado.** Dividir settleEvent en cálculo del resultado, liquidación de detalles y cierre/pago de apuestas. Mantener locks, idempotencia y crédito a usuarios atómicos. |
| `fd8071f8-2421-4816-a88e-6855621d82d3` | `backend/src/services/bettingService.js:50` | settleEvent | eventos_deportivos | MAJOR / `javascript:S2681` | **Bloque condicional sin llaves / sentencia resaltada que Sonar considera fuera del control esperado.** Dar llaves a la validación de marcadores dentro de la rama FINALIZADO sin resultado; resultado y UPDATE de evento deben ejecutarse solo después de validar ambos marcadores. |
| `6cfd0155-135b-4361-84fd-ebac3276f20c` | `backend/src/services/bettingService.js:50` | settleEvent | eventos_deportivos | MAJOR / `javascript:S3358` | **Operador ternario anidado que dificulta leer la decisión.** Sustituir la comparación anidada de marcadores por if/else (local, visitante, empate); preservar exactamente el resultado. |
| `a66b345b-d3cc-4c62-b567-cbbced7ed132` | `backend/src/services/bettingService.js:52` | settleEvent | detalle_apuestas; resultado de eventos_deportivos | MAJOR / `javascript:S3358` | **Operador ternario anidado que dificulta leer la decisión.** Sustituir el ternario del estado de detalle por if/else: evento cancelado→ANULADA; de lo contrario selección correcta→ACERTADA; si no→FALLADA. |
| `5a21264d-21a5-4423-a259-e6ad9d556a04` | `backend/src/services/bettingService.js:56` | settleEvent | detalle_apuestas; apuestas (liquidación) | MAJOR / `javascript:S3358` | **Operador ternario anidado que dificulta leer la decisión.** Sustituir el ternario del pago por if/else con este orden: todos ANULADA→monto; si existe FALLADA→0; si no→premio_potencial. |

## Plan de trabajo recomendado

### 1. CRUD compartido — responsable de capa de datos

- `crudRepository.js:8` (`S4624`, 2 incidencias): los nombres de columnas y los placeholders se interpolan con plantillas dentro de otra plantilla. Precalcular, antes del query, `quotedKeys = keys.map(...)` y `placeholders = keys.map(...)`; luego formar el SQL con esas listas. La consulta debe seguir pasando los valores en `keys.map(k => data[k])` como parámetros, sin interpolar valores del usuario.
- `crudRepository.js:12` (`S4624`, 1 incidencia): precalcular `setClauses = keys.map((k,i) => ...)` y usar `setClauses.join(...)` en el SQL. Mantener parámetros de valores y el id como parámetro final. `tables` e `idColumns` deben seguir viniendo de mapas permitidos.
- Tablas: `usuarios`, `eventos_deportivos`, `apuestas`, `detalle_apuestas`. Una sola corrección; hacer revisión compartida de los cuatro recursos.

### 2. Usuarios y saldo — responsable 1 con revisión del responsable 3

- No hay hallazgos localizados directamente en `authController.js` ni en SQL exclusivo de `usuarios` en este snapshot.
- Revisar el flujo común `confirm` (`bettingService.js:29`): valida la fila de `apuestas` y luego consulta/actualiza el saldo en `usuarios` (`:30–32`). El hallazgo Sonar de la línea 29 es de llaves/legibilidad; al cambiarlo no alterar el orden de validaciones ni permitir debitar sin apuesta válida.
- `settleEvent` (`:58`) acredita saldo a `usuarios`; la incidencia de complejidad está en la función completa (línea 45), por lo que el responsable de liquidación debe pedir revisión de quien lleva `usuarios`.

### 3. Eventos — responsable 2

- `createDraft` (`:14`) evita repetir un mismo evento en una selección combinada. El `throw` es condicional; `evs.push(...)` debe seguir ejecutándose para cada evento válido.
- `updateDraft` (`:37`) consulta y bloquea `eventos_deportivos` con `FOR SHARE`, valida que esté `PROGRAMADO` o `EN_VIVO` y toma la cuota; comparte la edición de `detalle_apuestas` y la actualización de `apuestas`.
- `mutateDetail` (`:41–42`) vuelve a comprobar disponibilidad de evento y cuota al crear/editar un detalle.
- `settleEvent` (`:47–50`) bloquea el evento, exige estado finalizado/cancelado y deduce `resultado` a partir de marcadores. La decisión de ganador de la línea 50 debe expresarse como `if/else` claro y conservar empate cuando los marcadores sean iguales.

### 4. Apuestas y detalles — responsables 3 y 4 coordinados

- `confirm` (`:29`) confirma solo una apuesta existente en borrador; no mezclar el guard de inexistencia con el guard de estado.
- `updateDraft` (`:35–38`) es compleja (18 frente a 15). Separar validación, reemplazo de detalles y recálculo del importe/cuotas. Toda operación debe seguir en la transacción actual.
- `deleteDraft` (`:40`) borra primero los detalles del borrador y después la apuesta. Preservar esta secuencia y rollback si cualquiera de las operaciones falla.
- `mutateDetail` (`:41–43`) es compleja (27 frente a 15). Separar crear, editar, eliminar y recalcular cuota total. Mantener validación de dueño/perfil, mínimo de selecciones (simple 1; combinada 2), bloqueos `FOR UPDATE`/`FOR SHARE` y actualización de la apuesta dentro de la misma transacción.
- `settleEvent` (`:51–58`) actualiza los detalles pendientes; luego cierra cada apuesta cuando no quedan detalles pendientes y calcula el pago. Preservar idempotencia (`WHERE estado=... RETURNING`), estados y crédito de saldo.
- Ternarios en `settleEvent`: `:52` define detalle anulado/acertado/fallado; `:56` define pago. Convertir a `if/else` sin cambiar prioridad: cancelado devuelve monto; si hay detalle fallado paga cero; si todos se anularon devuelve monto; en otro caso usa premio potencial.

### 5. Tareas transversales

- `errors.js:5` (`S3358`): el ternario anidado decide estado HTTP. Cambiar a `if/else` o `switch`, conservando `err.status` primero, `23505` y `23503` como 409, y 500 por defecto.
- `server.js:4` (`S2681`): el `if(schema.missing.length)` solo debe condicionar el mensaje de error por tablas faltantes. Encerrar ese `console.error` entre llaves; mantener `console.log` de inicio fuera del `if` para que se muestre incluso con las cuatro tablas presentes.
- `bettingService.js:41` (`S6582`): simplificar el guard `!a || a.estado !== BORRADOR` usando optional chaining (`a?.estado`) de manera que `a` inexistente continúe rechazándose antes de leer propiedades.

## Qué significan las incidencias de llaves (`S2681`)

Hay varias marcadas dentro de líneas muy compactas de `bettingService.js`. Sonar resalta sentencias que aparecen después de un `if`/`else` o una validación. **No envuelva automáticamente toda la línea en un `if`**: primero confirme la intención del flujo. Agregue llaves a cada guard/ramificación, ponga cada operación en su bloque correcto y conserve las sentencias que deben ejecutarse siempre después de que el guard no lance error. En particular, `evs.push` y el log de arranque son intencionalmente posteriores/incondicionales. La tabla de arriba indica el fragmento y el comportamiento que debe preservarse para cada clave.

## Criterio de cierre: cero hallazgos

Después de aplicar las correcciones y guardar los cambios:

1. Volver a ejecutar el scanner desde la raíz del proyecto, con el `projectKey=WareBet` y `sonar.sources=.`; no copiar tokens al informe ni al repositorio.
2. Esperar a que el análisis termine en SonarQube y abrir `http://localhost:9000/dashboard?id=WareBet`.
3. Verificar que la búsqueda de incidencias abiertas del proyecto devuelve **0** y que `code_smells=0`. `bugs=0` y `vulnerabilities=0` deben continuar en cero.
4. Revisar el Quality Gate por separado. Un gate `OK` puede coexistir con incidencias si las condiciones configuradas no exigen cero; para la meta del grupo, manda el conteo abierto y no solo el color del gate.
5. Si aparecen nuevas claves después del siguiente análisis, agregarlas al reparto antes de declarar el trabajo terminado.

## Trazabilidad y límites

- Snapshot consultado directamente desde la API local de SonarQube. El conteo cambiará cuando se suba un análisis nuevo.
- Relación con tablas deducida del SQL presente en `backend/src/services/bettingService.js`, `backend/src/repositories/crudRepository.js` y de los nombres en `backend/src/utils/sql.js`.
- Las tablas comprometidas son dependencias del flujo. No se afirma que el esquema PostgreSQL esté roto; la deuda encontrada está principalmente en legibilidad/estructura del código JavaScript.
- Dashboard: [Proyecto WareBet en SonarQube](http://localhost:9000/dashboard?id=WareBet).


