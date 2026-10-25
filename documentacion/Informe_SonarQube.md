# Informe de análisis SonarQube — WareBet

**Fecha:** 25 de octubre de 2026  
**Proyecto analizado:** `WareBet`  
**Resultado del reanálisis:** 0 issues abiertos

## Resumen

La consulta inicial a SonarQube encontró 29 code smells. No reportó bugs ni vulnerabilidades. Se corrigieron los hallazgos y se volvió a analizar el proyecto; la tarea de análisis terminó en `SUCCESS` y la API de SonarQube devolvió 0 issues abiertos.

| Resultado | Antes | Después |
|---|---:|---:|
| Issues abiertos | 29 | 0 |
| Bugs | 0 | 0 |
| Vulnerabilidades | 0 | 0 |
| Code smells | 29 | 0 |
| Duplicación | 0.0% | 0.0% |

Los 29 hallazgos iniciales se distribuían así: 18 de flujo y formato de bloques (`javascript:S2681`), 4 ternarios anidados (`S3358`), 3 funciones con complejidad cognitiva alta (`S3776`), 3 plantillas de cadena anidadas (`S4624`) y 1 recomendación de optional chaining (`S6582`). La severidad que devolvió la API fue 3 `CRITICAL`, 25 `MAJOR` y 1 `MINOR`; todos eran code smells, no errores funcionales detectados por Sonar.

## Cambios por archivo

### `backend/src/middlewares/errors.js`

**Hallazgo:** un ternario anidado hacía difícil seguir la selección del código HTTP (`S3358`).

**Antes:**

```js
const status = err.status || (err.code === '23505' ? 409 : err.code === '23503' ? 409 : 500);
```

**Después:**

```js
function resolveStatus(err) {
  if (err.status) {
    return err.status;
  }
  if (err.code === '23505' || err.code === '23503') {
    return 409;
  }
  return 500;
}
```

La función de middleware utiliza `resolveStatus(err)` y arma la respuesta en pasos separados, en lugar de otra expresión ternaria anidada.

### `backend/src/repositories/crudRepository.js`

**Hallazgos:** tres plantillas de cadena anidadas (`S4624`) en las consultas de inserción y actualización.

**Antes:** las columnas y los placeholders se construían dentro de la plantilla SQL con expresiones anidadas, por ejemplo:

```js
`INSERT INTO ${tables[resource]} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (...) RETURNING *`
```

**Después:** las partes SQL se preparan antes y los valores continúan parametrizados:

```js
const columns = keys.map((key) => `"${key}"`).join(', ');
const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
const result = await client(sql, keys.map((key) => data[key]));
```

Se añadieron `getTable` y `getIdColumn` para validar los identificadores contra las listas internas antes de construir consultas.

### `backend/src/server.js`

**Hallazgo:** una línea compacta con condicionales sin bloques claros (`S2681`).

**Antes:** el arranque, verificación de base de datos, manejo de error y registro del servidor estaban concentrados en una línea.

**Después:** la verificación está en `verifyDatabase()` y la condición de tablas faltantes tiene un bloque explícito:

```js
if (schema.missing.length > 0) {
  console.error(`Faltan tablas requeridas: ${schema.missing.join(', ')}`);
}
```

El arranque conserva el mismo comportamiento: conecta, ejecuta `SELECT NOW()` e informa cuántas tablas requeridas encontró.

### `backend/src/services/bettingService.js`

**Hallazgos:**

- 18 condicionales y ciclos sin bloques legibles (`S2681`).
- 4 ternarios anidados (`S3358`).
- 3 funciones con complejidad cognitiva sobre el límite (`S3776`).
- 1 condición que podía expresarse con optional chaining (`S6582`).

**Antes:** la creación y liquidación mezclaban validación, consultas, cálculo de cuotas y cambios de estado en funciones largas y compactas. Por ejemplo:

```js
const payout = allVoided ? Number(a.monto) : lost ? 0 : Number(a.premio_potencial);
```

**Después:** los cálculos se separaron en funciones con una responsabilidad clara. La liquidación ahora determina el pago de forma explícita:

```js
let payout = Number(bet.premio_potencial);
if (isLost) {
  payout = 0;
} else if (allVoided) {
  payout = Number(bet.monto);
}
```

La lógica de eventos y detalles se distribuyó en `getResultFromScore`, `lockFinalEvent`, `getDetailState`, `settlePendingDetails` y `settleBet`. La edición de borradores y detalles se apoyó en `findOwnedDraft`, `replaceDraftSelections`, `findEditableDetail`, `updateDetail`, `deleteDetail` y `refreshBetOdds`.

La condición marcada por `S6582` se cambió así:

```js
// Antes
if (!bet || bet.estado !== 'BORRADOR' || isDifferentOwner) {

// Después
if (bet?.estado !== 'BORRADOR' || isDifferentOwner) {
```

## Verificaciones realizadas

- `npm test`: 2 pruebas pasaron, 0 fallaron.
- `node --check`: sintaxis comprobada para los archivos JavaScript de `src`, `scripts` y `tests`.
- SonarScanner CLI analizó el proyecto `WareBet`; la tarea final quedó en `SUCCESS`.
- Consulta final de issues de SonarQube: 0 abiertos.

## Estado de Quality Gate

La Quality Gate aparece como `ERROR` por una condición independiente de los issues: `new_coverage` es `0.0%` y el umbral configurado es `80%`. La condición de nuevas violaciones está `OK` con 0, y la duplicación nueva está `OK` con 0.0%. No se generó un informe de cobertura para este análisis, así que no presento la Quality Gate como aprobada.

## Alcance

Este informe refleja los hallazgos de SonarQube del proyecto `WareBet` y las correcciones hechas para llevar los issues abiertos a cero. Las pruebas ejecutadas no cubren las operaciones CRUD ni la liquidación contra datos de Neon; no se escribieron datos de prueba en la base existente.
