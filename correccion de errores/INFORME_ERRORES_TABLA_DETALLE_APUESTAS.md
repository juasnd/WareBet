# Informe de remediación SonarQube — WareBet

## Objetivo

Documentar los errores relacionados con la tabla **`detalle_apuestas`** detectados en el análisis de SonarQube y las soluciones aplicadas. El objetivo es dejar corregidos exclusivamente los *code smells* que afectan a la gestión de detalles de apuestas, manteniendo el comportamiento funcional original.

## Snapshot consultado

- Fecha: 27 de octubre de 2026
- Servidor: SonarQube 26.9.0.129388 en `http://localhost:9000`
- Proyecto: `SIGECMED`
- Tipo de incidencias relacionadas con `detalle_apuestas`: **CODE_SMELL**
- Archivo afectado: `backend/src/services/bettingService.js`

## Responsables

| Responsable | Tabla | Qué debe atender |
|---|---|---|
| 4 | `detalle_apuestas` | Altas, cambios, bajas de selecciones; actualización de estado por evento; recálculo de cuota_total/premio_potencial. |

## Errores concretos encontrados y corrección aplicada

La siguiente tabla detalla los hallazgos exclusivamente asociados a `detalle_apuestas`:

| Clave Sonar / Regla | Archivo:línea | Área | Tablas comprometidas | Severidad / regla | Qué estaba mal y qué se corrigió |
|---|---|---|---|---|---|
| `S3776` | `backend/src/services/bettingService.js:40` | `updateDraft` | `apuestas`, `eventos_deportivos`, `detalle_apuestas` | CRITICAL / Cognitive Complexity | **Complejidad cognitiva 18 > 15.** Mezclaba validación de apuesta, borrado masivo de `detalle_apuestas`, validación de eventos, inserción y recálculo. **Solución:** Se creó `replaceDetallesForApuesta()` para delegar el reemplazo de detalles, manteniendo la transacción. |
| `S2681` | `backend/src/services/bettingService.js:41` | `updateDraft` | `apuestas`, `detalle_apuestas` | MAJOR / Missing braces | **Bloques condicionales sin llaves.** Guards de apuesta inexistente y estado `BORRADOR` sin llaves. **Solución:** Se agregaron llaves `{}` preservando el orden de validación. |
| `S2681` | `backend/src/services/bettingService.js:42` | `updateDraft` | `apuestas`, `eventos_deportivos`, `detalle_apuestas` | MAJOR / Missing braces | **Bloques sin llaves al reemplazar detalles.** Validaciones de selección, repetición de evento, disponibilidad de evento. **Solución:** Todas las validaciones se encapsulan con llaves dentro de `replaceDetallesForApuesta()`. |
| `S2681` | `backend/src/services/bettingService.js:43` | `updateDraft` | `apuestas` | MAJOR / Missing braces | **Validación de monto sin llaves.** **Solución:** Se agregó llave al guard y se actualiza la apuesta solo tras validar monto. |
| `S2681` | `backend/src/services/bettingService.js:45` | `deleteDraft` | `apuestas`, `detalle_apuestas` | MAJOR / Missing braces | **Guards sin llaves.** Se elimina `detalle_apuestas` primero. **Solución:** Se agregaron llaves a los guards manteniendo la secuencia `DELETE detalle_apuestas` → `DELETE apuestas`. |
| `S3776` | `backend/src/services/bettingService.js:46` | `mutateDetail` | `apuestas`, `eventos_deportivos`, `detalle_apuestas` | CRITICAL / Cognitive Complexity | **Complejidad cognitiva 27 > 15.** Manejaba `create`, `update`, `delete` en una sola función con muchas validaciones. **Solución:** Se dividió con helpers `insertDetalleApuesta()` y `syncBetTotalsFromDetalles()`. Se estructuraron las ramas con llaves y lógica más clara. |
| `S2681` | `backend/src/services/bettingService.js:46` | `mutateDetail` | `apuestas`, `eventos_deportivos`, `detalle_apuestas` | MAJOR / Missing braces | **Validaciones sin llaves en rama `create`.** **Solución:** Se agregaron llaves en validación de apuesta borrador, dueño/perfil, evento y selección. |
| `S6582` | `backend/src/services/bettingService.js:46` | `mutateDetail` | `apuestas`, `detalle_apuestas` | MINOR / Prefer optional chaining | **Recomendación de legibilidad.** **Solución:** Se hace la validación más explícita con llaves, preservando el rechazo correcto cuando la apuesta no existe. |
| `S2681` | `backend/src/services/bettingService.js:47` | `mutateDetail` | `apuestas`, `eventos_deportivos`, `detalle_apuestas` | MAJOR / Missing braces | **Múltiples guards sin llaves en ramas `update/delete`.** **Solución:** Se estructuró con `if/else` con llaves en cada rama, validando dueño, estado BORRADOR, conteo mínimo de detalles, evento y selección. |
| `S3358` | `backend/src/services/bettingService.js:56` | `setFinalEventResult` | `eventos_deportivos`, `detalle_apuestas` | MAJOR / Nested ternary | **Ternario anidado para calcular resultado del evento.** **Solución:** Se creó `computeEventResult()` con `if/else` claro (`LOCAL`, `VISITANTE`, `EMPATE`). |
| `S3358` | `backend/src/services/bettingService.js:64` | `settlePendingDetails` | `detalle_apuestas`, `apuestas` | MAJOR / Nested ternary | **Ternario anidado para determinar estado de detalle (`ACERTADA/FALLADA/ANULADA`).** **Solución:** Se creó `getDetailSettlementState()` con lógica explícita: `CANCELADO → ANULADA`, si acierta → `ACERTADA`, else → `FALLADA`. |

## Solución técnica aplicada

### Funciones auxiliares creadas

- **`computeEventResult(event)`** – Reemplaza ternario anidado por `if/else` para obtener el resultado del evento.
- **`getDetailSettlementState(event, detail)`** – Centraliza la lógica de liquidación del detalle.
- **`insertDetalleApuesta(client, {...})`** – Estandariza el `INSERT` en `detalle_apuestas` con estado `PENDIENTE`.
- **`replaceDetallesForApuesta(client, apuestaId, selecciones, apuestaTipo)`** – Elimina todos los detalles, valida selecciones/eventos, reinserta y retorna el nuevo `cuota_total`. Reduce drásticamente la complejidad de `updateDraft`.
- **`syncBetTotalsFromDetalles(client, betId)`** – Recalcula `cuota_total` y `premio_potencial` desde `detalle_apuestas` usando la misma fórmula que la lógica original. Se reutiliza en `mutateDetail`.

### Refactorización por función

- **`createDraft`** – Llaves agregadas en todos los condicionales. Inserción de detalles unificada con `insertDetalleApuesta()`.
- **`updateDraft`** – Delegación a `replaceDetallesForApuesta()`, validación de monto con llaves, actualización de apuesta solo tras validaciones.
- **`deleteDraft`** – Preserva secuencia de borrado: primero `detalle_apuestas`, luego `apuestas`. Guards con llaves.
- **`mutateDetail`** – Refactorizado por ramas `create/update/delete`. Validaciones estructuradas, uso de helpers para inserción y recálculo. Se mantiene control por dueño/perfil, estado `BORRADOR` y mínimo de selecciones (`SIMPLE: 1`, `COMBINADA: >= 2`).
- **`settlePendingDetails` / `setFinalEventResult`** – Uso de funciones auxiliares para eliminar ternarios anidados.

## Verificación

- **Alcance estricto:** Únicamente `backend/src/services/bettingService.js`. No se modificaron `app.js`, `crudRepository.js`, `errors.js`, `server.js` ni otros archivos.
- **Comportamiento preservado:** Transacciones `BEGIN/COMMIT/ROLLBACK`, bloqueos `FOR UPDATE`/`FOR SHARE`, validaciones por rol/tipo/estado, reglas de mínimo de selecciones, recálculo de cuotas/premios y lógica de liquidación.
- **Pruebas:** Se mantuvieron consistentes con la lógica existente. Las pruebas exclusivas para `detalle_apuestas` se encuentran en `backend/tests/detalle_apuestas.validacion.test.js`.

## Conclusión

Se corrigieron todos los *code smells* de SonarQube relacionados con la tabla `detalle_apuestas`:

- **S3776 (CRITICAL):** Reducida la complejidad cognitiva de `updateDraft` y `mutateDetail` mediante extracción de helpers.
- **S2681 (MAJOR):** Agregadas llaves en todos los condicionales afectando operaciones sobre `detalle_apuestas`.
- **S3358 (MAJOR):** Eliminados ternarios anidados en cálculo de resultado y liquidación de detalles.
- **S6582 (MINOR):** Mejorada la legibilidad sin alterar el comportamiento.

El código queda más modular, legible, mantenible y acorde al estándar de SonarQube para las operaciones sobre `detalle_apuestas`.
