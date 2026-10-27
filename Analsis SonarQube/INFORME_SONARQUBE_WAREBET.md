# Informe detallado de SonarQube — WareBet

- **Fecha de consulta:** 27 de octubre de 2026
- **Servidor:** `http://localhost:9000` (SonarQube 26.9.0.129388)
- **Proyecto:** `WareBet`
- **Estado del Quality Gate:** OK
- **Estado de hallazgos:** 29 abiertos de 29 recuperados

## Resumen ejecutivo

El proyecto registra **29 code smells**, **0 bugs**, **0 vulnerabilidades** y **0 hotspots de seguridad**. Los 29 hallazgos recuperados son de tipo CODE_SMELL. Severidades: CRITICAL: 3, MAJOR: 25, MINOR: 1. En consecuencia, los hallazgos con severidad Sonar CRITICAL son deuda de mantenibilidad; no deben presentarse como vulnerabilidades ni como bugs confirmados. La deuda estimada que Sonar asigna sumando el esfuerzo individual es aproximadamente **3 h 12 min**; es una estimación automática, no una duración de trabajo grupal confiable.

Métricas adicionales: **140 líneas de código**, duplicación **0.0%**, cobertura reportada **0.0%**. Cobertura 0% puede significar que no se importó un informe de cobertura; confirmar la configuración antes de concluir que no existen pruebas.

## Distribución por tabla y criterio de asignación

Las tablas del esquema son `usuarios`, `eventos_deportivos`, `apuestas` y `detalle_apuestas`. La asignación se basa en el SQL y el flujo que contiene la línea señalada. El CRUD genérico afecta las cuatro tablas, así que cada incidencia de ese archivo debe corregirse una sola vez y su corrección beneficia a todos los responsables. Las incidencias del middleware y del arranque son transversales y no deben cargarse artificialmente a una tabla.

| Responsable sugerido | Alcance principal | Hallazgos relacionados y coordinación |
|---|---|---|
| 1 — `usuarios` | Consultas, perfil, saldo y usuarios | CRUD genérico compartido (3 ubicaciones); coordinar con responsable 3 por `confirm` y con responsable 2/3/4 en liquidación `settleEvent` (saldo/pago). |
| 2 — `eventos_deportivos` | Eventos, cuotas, resultado y disponibilidad | CRUD genérico compartido (3); `createDraft` valida eventos; `updateDraft` y `mutateDetail` consultan eventos; `settleEvent` calcula el resultado y liquida apuestas. |
| 3 — `apuestas` | Borradores, confirmación, edición, eliminación, liquidación | CRUD genérico compartido (3); `confirm`, `updateDraft`, `deleteDraft`, `mutateDetail` y cálculo final en `settleEvent`. |
| 4 — `detalle_apuestas` | Selecciones vinculadas a apuestas y estados | CRUD genérico compartido (3); `updateDraft`, `mutateDetail` y actualización de estados en `settleEvent`. |

### Hallazgos transversales

- `backend/src/repositories/crudRepository.js`: 3 incidencias de plantillas literales anidadas. Asignar un único propietario (idealmente rotativo o quien mantenga la capa de datos) y validar el mismo cambio para las cuatro entidades.
- `backend/src/middlewares/errors.js`: 1 incidencia de ternario anidado; no corresponde a una tabla.
- `backend/src/server.js`: 1 incidencia de llaves/flujo condicional en el arranque; no corresponde a una tabla.
- `backend/src/services/bettingService.js`: concentra las demás incidencias y las funciones cruzan varias tablas. Acordar un responsable primario por función y pedir revisión a responsables de las tablas involucradas; no duplicar el mismo issue en cuatro subtareas.

## Lista completa de hallazgos

`Clave` permite localizar cada incidencia en SonarQube; `línea` es la ubicación reportada. Los mensajes son los textos que devuelve SonarQube.

| Clave Sonar | Archivo y línea | Función/área | Tabla(s) relacionada(s) | Severidad | Regla | Hallazgo | Esfuerzo Sonar |
|---|---|---|---|---|---|---|---|
| `a608137f-3108-4549-898d-e4ce6ca8ef5b` | `backend/src/middlewares/errors.js:5` | middleware de errores | Transversal; sin tabla directa | MAJOR | `javascript:S3358` | Extract this nested ternary operation into an independent statement. | 5min |
| `4c05122f-f1e2-46a2-924f-a46877dd1bdc` | `backend/src/repositories/crudRepository.js:8` | CRUD genérico | Las cuatro tablas (repositorio CRUD genérico) | MAJOR | `javascript:S4624` | Refactor this code to not use nested template literals. | 10min |
| `6716c113-c867-48ea-9808-cb29a3e292d2` | `backend/src/repositories/crudRepository.js:8` | CRUD genérico | Las cuatro tablas (repositorio CRUD genérico) | MAJOR | `javascript:S4624` | Refactor this code to not use nested template literals. | 10min |
| `24fcfbd3-26b7-4e5d-bcd6-16d467a66006` | `backend/src/repositories/crudRepository.js:12` | CRUD genérico | Las cuatro tablas (repositorio CRUD genérico) | MAJOR | `javascript:S4624` | Refactor this code to not use nested template literals. | 10min |
| `1b617f55-73ca-4f22-a500-8a0b3f800fbf` | `backend/src/server.js:4` | arranque del servidor | Transversal; sin tabla directa | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `f75b723d-dac4-4b87-8b3a-f34f93496cb4` | `backend/src/services/bettingService.js:14` | createDraft | eventos_deportivos; vínculo con apuestas/detalle_apuestas | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `eb8be734-bfb3-45d2-a6c9-f626a8791cdd` | `backend/src/services/bettingService.js:29` | confirm | apuestas | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `8de16674-7e5f-4da2-be1e-0322b6b50569` | `backend/src/services/bettingService.js:35` | updateDraft | apuestas (edición de borrador) | CRITICAL | `javascript:S3776` | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. | 8min |
| `46a08a45-932e-4fac-be1f-e0d6487fa4cc` | `backend/src/services/bettingService.js:36` | updateDraft | apuestas (edición de borrador) | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `1eba7e93-ab7d-4047-9e2d-bb8694b9aa0f` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `79977df5-3452-4cea-8fe5-b8fc970047c5` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `d2015f77-a4cd-41e0-badb-4c1f4162b04d` | `backend/src/services/bettingService.js:37` | updateDraft | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `ba6d7fb4-5a5f-4931-afc8-8fbbb2ee574f` | `backend/src/services/bettingService.js:38` | updateDraft | apuestas | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `6b6aa3cc-176f-48d4-9cf6-fbcbab10cd60` | `backend/src/services/bettingService.js:40` | deleteDraft | apuestas y detalle_apuestas | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `b42e037d-7e9b-4781-86bb-6bf366980ce4` | `backend/src/services/bettingService.js:40` | deleteDraft | apuestas y detalle_apuestas | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `448833a6-53e1-4f29-adc5-316445970487` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `f362308a-c1b9-46aa-94a2-6afc133b2be0` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `28d878b1-4b08-40dd-99f4-da4135834a62` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | CRITICAL | `javascript:S3776` | Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed. | 17min |
| `36986403-39a0-4175-a152-5a310417125b` | `backend/src/services/bettingService.js:41` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MINOR | `javascript:S6582` | Prefer using an optional chain expression instead, as it's more concise and easier to read. | 5min |
| `15f21462-3ab4-4188-9f0b-e939f118d730` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `a6c15d55-59d7-4957-aa8b-849b3c8fe951` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `b2eb8494-f6df-400c-b4b0-7037a85c49b4` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `c1a4c5d4-5992-40cf-acf0-385e2813db31` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `c1bac08c-c35c-42f9-a7f0-30767c214325` | `backend/src/services/bettingService.js:42` | mutateDetail | apuestas, detalle_apuestas y eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `9eafc095-cbcc-4e46-8e31-6b16c8007246` | `backend/src/services/bettingService.js:45` | settleEvent | eventos_deportivos, detalle_apuestas, apuestas y usuarios (liquidación) | CRITICAL | `javascript:S3776` | Refactor this function to reduce its Cognitive Complexity from 32 to the 15 allowed. | 22min |
| `fd8071f8-2421-4816-a88e-6855621d82d3` | `backend/src/services/bettingService.js:50` | settleEvent | eventos_deportivos | MAJOR | `javascript:S2681` | This statement will not be executed conditionally; only the first statement will be. The rest will execute unconditionally. | 5min |
| `6cfd0155-135b-4361-84fd-ebac3276f20c` | `backend/src/services/bettingService.js:50` | settleEvent | eventos_deportivos | MAJOR | `javascript:S3358` | Extract this nested ternary operation into an independent statement. | 5min |
| `a66b345b-d3cc-4c62-b567-cbbced7ed132` | `backend/src/services/bettingService.js:52` | settleEvent | detalle_apuestas (resultado derivado de eventos_deportivos) | MAJOR | `javascript:S3358` | Extract this nested ternary operation into an independent statement. | 5min |
| `5a21264d-21a5-4423-a259-e6ad9d556a04` | `backend/src/services/bettingService.js:56` | settleEvent | detalle_apuestas y apuestas (cálculo del pago) | MAJOR | `javascript:S3358` | Extract this nested ternary operation into an independent statement. | 5min |

## Lectura y priorización

1. **Revisar primero los hallazgos `S2681`** (“solo la primera sentencia queda condicionada”): verificar las llaves/ramas del código compactado en `bettingService.js`. Aunque Sonar los categoriza como code smells, confirmar manualmente el comportamiento para descartar errores de lógica antes de refactorizar.
2. **Separar funciones grandes (`S3776`)** en `updateDraft`, `mutateDetail` y `settleEvent`; al ser flujos transaccionales, preservar `BEGIN`/`COMMIT`/`ROLLBACK`, bloqueos y atomicidad.
3. **Refactorizar ternarios (`S3358`) y template literals (`S4624`)** en cambios pequeños y sin alterar SQL ni parámetros.
4. **Atender lo transversal** (`server.js`, `errors.js`) en una tarea común, fuera del reparto por tabla.

## Alcance y límites

- Snapshot obtenido por la API de SonarQube local para el componente `WareBet`; los conteos pueden cambiar al ejecutar un nuevo análisis.
- SonarQube reporta ubicaciones, no propietarios. La asignación por tabla es una propuesta deducida del código; los issues que tocan varias tablas están etiquetados y requieren coordinación.
- El proyecto examinado usa código JavaScript en `backend/src`; el esquema se identifica en `backend/src/utils/sql.js` y las operaciones transaccionales en `backend/src/services/bettingService.js`.
- Dashboard: [WareBet en SonarQube](http://localhost:9000/dashboard?id=WareBet).
