# Corrección de hallazgos relacionados con `usuarios`

## Alcance y resultado

- **Proyecto:** `WareBet`, SonarQube 26.9.0.129388.
- **Revisión:** 28 de octubre de 2026, sobre `main` en el commit base `ac21c85`.
- **Alcance del análisis:** `backend/src`.
- **Línea base:** 29 hallazgos abiertos; todos eran `CODE_SMELL`.
- **Después de las correcciones:** 22 hallazgos abiertos en el backend. Los seis hallazgos dentro del alcance de usuarios quedaron cerrados como `FIXED` en SonarQube. Bugs y vulnerabilidades siguen en cero.

No se buscó llevar todo el backend a cero. Se corrigieron los problemas del CRUD compartido que también sirve a `usuarios`, la validación antes de modificar su saldo y la liquidación que acredita pagos al usuario.

## Hallazgos corregidos

| Clave Sonar | Regla y severidad | Ubicación reportada inicialmente | Código corregido | Tablas relacionadas |
|---|---|---|---|---|
| `021e69e9-c006-4394-96cf-3702b268b2da` | `S4624` — MAJOR | `crudRepository.js:8`, alta | `crudRepository.js:8–10` | CRUD común: usuarios, eventos, apuestas y detalles |
| `512444a5-6439-4025-b172-2b99c2592506` | `S4624` — MAJOR | `crudRepository.js:8`, alta | `crudRepository.js:8–10` | CRUD común: usuarios, eventos, apuestas y detalles |
| `74f9dfb3-4f52-4bf3-8e14-c9200a47c0c3` | `S4624` — MAJOR | `crudRepository.js:12`, actualización | `crudRepository.js:13–15` | CRUD común: usuarios, eventos, apuestas y detalles |
| `bda3f9da-a65c-4fff-a8e2-35973a36ee05` | `S2681` — MAJOR | `bettingService.js:29`, `confirm` | `bettingService.js:29–34` | Apuestas y usuarios/saldo |
| `ed7d36a0-f6b8-4e08-8a8b-7686f6f157c8` | `S3776` — CRITICAL | `bettingService.js:45`, `settleEvent` | `bettingService.js:50–107`, dividido en helpers | Eventos, detalles, apuestas y usuarios/saldo |
| `6f00da33-8bbd-4c56-b7ff-f51d0c53e146` | `S3358` — MAJOR | `bettingService.js:56`, cálculo del pago | `bettingService.js:70–85` | Detalles, apuestas y usuarios/saldo |

### 1. SQL con plantillas literales anidadas — `S4624`

En el `INSERT` de `crudRepository.js`, el SQL exterior contenía otros template literals dentro de `map()` para formar nombres de columnas y parámetros. En el `UPDATE`, las asignaciones SQL también se formaban con un template literal anidado. Sonar marcó dos expresiones en la línea del `INSERT` y una en la del `UPDATE`.

Se preparan ahora `columns`, `placeholders` y `assignments` antes de interpolarlos en la plantilla SQL exterior. Los valores de las filas continúan enviándose como parámetros de PostgreSQL (`$1`, `$2`, etc.); no se interpolan datos recibidos en el SQL. Como este repositorio es genérico, la corrección también beneficia a las otras tres tablas.

### 2. Guardas de confirmación — `S2681`

En `confirm`, dos comprobaciones estaban escritas en una sola línea: comprobar que la apuesta existe y comprobar que esté en estado `BORRADOR`. Sonar señaló la falta de llaves y la ambigüedad visual sobre qué sentencia controla cada `if`.

Se separaron las condiciones y se añadieron llaves. La función sigue rechazando primero una apuesta inexistente y luego una apuesta que no está en borrador; solo después consulta y descuenta el saldo de `usuarios`. No se cambió el orden ni la lógica del débito.

### 3. Complejidad de liquidación — `S3776`

`settleEvent` tenía complejidad cognitiva 32, superior al máximo 15. La función mezclaba el bloqueo y validación del evento, la actualización de detalles, la evaluación de cada apuesta y el abono del saldo del usuario.

Se separó ese trabajo en `setFinalEventResult`, `settlePendingDetails` y `settleBetAndCreditUser`. `settleEvent` conserva la coordinación de la transacción. El abono a `usuarios` permanece dentro de la misma transacción que actualiza los detalles y las apuestas; también se mantienen el bloqueo de filas, el `ROLLBACK` ante error y la condición idempotente que evita acreditar dos veces una apuesta ya liquidada.

Es un hallazgo compartido: para corregir la complejidad del flujo que acredita el saldo fue necesario separar operaciones de eventos, detalles y apuestas. No se alteró la finalidad de esos cambios.

### 4. Ternario anidado al calcular el pago — `S3358`

La expresión de la línea 56 calculaba el pago con dos ternarios anidados. La decisión afecta directamente cuánto se abona al saldo del usuario y era difícil leer su prioridad.

Se reemplazó por `if/else` en `settleBetAndCreditUser`: si todos los detalles fueron anulados, devuelve el monto apostado; si existe una selección fallida, paga cero; en otro caso, abona el premio potencial. Sonar cerró el hallazgo.

## Hallazgos que se dejaron fuera

El nuevo análisis conserva **22 issues abiertos** de otras áreas. Por ejemplo, siguen los hallazgos de `updateDraft`, `mutateDetail`, la selección del resultado del evento y el estado de los detalles. No se corrigieron porque corresponden a apuestas, eventos o detalles y no eran necesarios para resolver los hallazgos de `usuarios` solicitados.

La función `mutateDetail` compara el `id_usuario` guardado en una apuesta para autorizar cambios a detalles; sus issues de complejidad y optional chaining pertenecen a ese flujo de apuestas/detalles, no a consultas o actualizaciones de la tabla `usuarios`. Se dejaron pendientes para no ampliar el alcance.

Al extraer el flujo de liquidación, Sonar cerró también un aviso de formato `S2681` en la validación de marcadores. Las expresiones ternarias de resultado del evento y estado del detalle siguen señaladas en sus nuevas ubicaciones; no se cuentan como corregidas.

## Verificación

Se ejecutó un análisis nuevo de `backend/src` con `projectKey=WareBet`; SonarQube terminó con `ANALYSIS SUCCESSFUL` y confirmó cerrados los seis hallazgos indicados arriba. Los archivos JavaScript modificados pasaron `node --check` y `git diff --check` no reportó errores de formato en el código. No se ejecutaron pruebas unitarias.

Dashboard: [WareBet en SonarQube](http://localhost:9000/dashboard?id=WareBet).
