<div align="center">

# WareBet

### API REST para la gestión y simulación de apuestas deportivas

**Node.js · Express · PostgreSQL · JWT · Jest · Supertest · Socket.IO**

Proyecto académico de backend que integra usuarios, eventos deportivos, apuestas y liquidaciones mediante reglas de negocio, control de acceso y persistencia relacional.

</div>

> [!IMPORTANT]
> **WareBet utiliza créditos virtuales.** No procesa pagos, depósitos ni retiros de dinero real. La documentación recoge las funcionalidades y los resultados registrados en el proyecto; las métricas históricas no representan necesariamente una ejecución actual de todas las pruebas.

## Contenido

- [Descripción del proyecto](#descripción-del-proyecto)
- [Características principales](#características-principales)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Roles y permisos](#roles-y-permisos)
- [Reglas de negocio](#reglas-de-negocio)
- [API REST](#api-rest)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Pruebas y verificación](#pruebas-y-verificación)
- [Correcciones y calidad del código](#correcciones-y-calidad-del-código)
- [Evidencias](#evidencias)
- [Limitaciones y mejoras futuras](#limitaciones-y-mejoras-futuras)
- [Preguntas técnicas](#preguntas-técnicas)
- [Documentación del repositorio](#documentación-del-repositorio)

---

## Descripción del proyecto

**WareBet** es una API REST desarrollada para simular el funcionamiento de una plataforma de apuestas deportivas. Permite registrar usuarios, consultar eventos, elaborar pronósticos, confirmar apuestas con saldo virtual y liquidarlas según los resultados deportivos.

El reto principal es mantener la coherencia entre datos relacionados: el propietario de la apuesta, las selecciones realizadas, sus cuotas, el estado de cada evento y el saldo disponible. Por ejemplo, el sistema debe evitar que se confirme dos veces una misma apuesta o que se seleccione un evento cerrado.

Para ello, el backend concentra las validaciones en los servicios de dominio y emplea **transacciones de PostgreSQL** para que los cambios relacionados se confirmen juntos o se reviertan ante un error.

### Objetivos

- Administrar usuarios y sesiones autenticadas mediante JWT.
- Definir permisos para los perfiles `ADMIN`, `GESTOR` y `APOSTADOR`.
- Gestionar eventos, cuotas, marcadores, estados y resultados.
- Crear apuestas simples y combinadas, calcular el premio potencial y descontar saldo al confirmar.
- Liquidar pronósticos y aplicar devoluciones cuando corresponda por cancelación.
- Verificar el comportamiento mediante pruebas automatizadas y análisis estático.

### Alcance

| Incluido | No incluido o no demostrado |
| --- | --- |
| Backend REST con Express | Interfaz web completa |
| Persistencia relacional en PostgreSQL, con conexión prevista a Neon | Pasarela de pagos y dinero real |
| CRUD de usuarios, eventos, apuestas y detalles | Migraciones automáticas del esquema |
| Autenticación, autorización y filtrado por propietario | Pruebas de integración automatizadas sobre PostgreSQL real aislado |
| Reportes, estado de salud e inspección de esquema | Pruebas concluyentes de concurrencia o carga |
| Notificaciones de cuotas con Socket.IO | Despliegue de un producto comercial |

## Características principales

- **Autenticación y seguridad:** registro, inicio de sesión, contraseñas protegidas con hash y validación de tokens JWT.
- **Control de acceso:** permisos por perfil y restricciones sobre recursos pertenecientes a otros usuarios.
- **Eventos deportivos:** creación, consulta, actualización, marcadores, resultados, estados y cuotas.
- **Apuestas:** creación de borradores, selección de eventos, apuestas simples o combinadas y confirmación.
- **Liquidación:** cálculo de selecciones acertadas o fallidas, actualización de estados y acreditación o devolución de saldo según las reglas.
- **Integridad:** transacciones con `COMMIT` y `ROLLBACK` para operaciones críticas.
- **Actualizaciones en vivo:** emisión de `odds:updated` cuando se modifican cuotas válidas.
- **Verificación:** pruebas HTTP y de servicios con Jest/Supertest, más revisiones con ESLint y SonarQube.

## Tecnologías utilizadas

| Componente | Herramientas | Función |
| --- | --- | --- |
| Entorno de ejecución | Node.js 20+, JavaScript (CommonJS) | Ejecución del servidor |
| Framework HTTP | Express 4 | API REST y middleware |
| Base de datos | PostgreSQL, `pg`, Neon | Datos relacionales, consultas y transacciones |
| Autenticación | `jsonwebtoken`, `bcryptjs` | JWT y hash de contraseñas |
| Protección de API | `helmet`, CORS, `express-rate-limit` | Encabezados, orígenes y límites de solicitudes |
| Validación | `express-validator` y validaciones de dominio | Control de datos de entrada |
| Tiempo real | Socket.IO | Notificación de cambios de cuotas |
| Pruebas | Jest, Supertest, `node:test` | Pruebas de servicios, rutas y utilidades |
| Calidad | ESLint, SonarQube | Análisis estático y mantenibilidad |
| Exploración de API | Postman | Ejecución manual de solicitudes |

## Arquitectura

El backend se organiza en capas para separar las solicitudes HTTP, los permisos, las reglas del negocio y el acceso a los datos.

```mermaid
flowchart TD
    Client[Cliente HTTP / Postman] --> Routes[Rutas y controladores Express]
    Routes --> Auth[Middleware JWT y permisos]
    Auth --> Services[Servicios de dominio]
    Services --> Repo[Repositorio y consultas SQL parametrizadas]
    Repo --> DB[(PostgreSQL / Neon)]
    Services -. Cambio de cuotas .-> Socket[Socket.IO: odds:updated]
    Routes -. Errores .-> Errors[Middleware de errores HTTP]
```

### Componentes relevantes

| Archivo | Responsabilidad |
| --- | --- |
| `backend/src/app.js` | Configuración de Express, rutas, validaciones y middleware |
| `backend/src/server.js` | Inicio del servidor, verificación de conexión y cierre ordenado |
| `backend/src/controllers/authController.js` | Registro, login, perfil, contraseña y menú |
| `backend/src/services/bettingService.js` | Borradores, confirmación, detalles y liquidación de apuestas |
| `backend/src/repositories/crudRepository.js` | Operaciones CRUD reutilizables |
| `backend/src/utils/sql.js` | Catálogo de tablas/campos permitidos y filtrado de propiedades |
| `backend/src/middlewares/auth.js` | Comprobación de JWT y autorización por perfil |
| `backend/src/middlewares/errors.js` | Conversión de errores a respuestas HTTP |
| `backend/src/config/db.js` | Conexión, pool, consultas e inspección del esquema PostgreSQL |

## Modelo de datos

El sistema trabaja con **cuatro entidades principales**:

| Tabla | Clave principal | Información administrada |
| --- | --- | --- |
| `usuarios` | `id_usuario` | Identidad, correo, hash de contraseña, perfil, saldo virtual y menú |
| `eventos_deportivos` | `id_evento` | Deporte, competición, equipos, fecha, cuotas, marcadores, resultado y estado |
| `apuestas` | `id_apuesta` | Propietario, tipo, monto, cuota total, premio potencial, estado y fechas |
| `detalle_apuestas` | `id_detalle` | Evento seleccionado, pronóstico, cuota fijada y estado del detalle |

```mermaid
erDiagram
    USUARIOS ||--o{ APUESTAS : realiza
    APUESTAS ||--|{ DETALLE_APUESTAS : contiene
    EVENTOS_DEPORTIVOS ||--o{ DETALLE_APUESTAS : aparece_en
```

**Cuotas fijadas.** Cada detalle conserva una `cuota_fijada` al crear o modificar su selección. Los cambios posteriores en las cuotas del evento no modifican retroactivamente ese valor guardado.

> [!NOTE]
> El backend **espera que las cuatro tablas ya existan**: inspecciona el esquema al iniciar, pero no crea ni modifica automáticamente su estructura.

## Roles y permisos

| Rol | Acciones permitidas | Restricciones principales |
| --- | --- | --- |
| `ADMIN` | Administrar usuarios, consultar y gestionar eventos y apuestas, acceder a reportes e inspeccionar el esquema | Las reglas de estado y propiedad del servicio siguen siendo aplicables |
| `GESTOR` | Consultar eventos y apuestas, crear y modificar eventos, consultar reportes | No administra usuarios ni escribe apuestas |
| `APOSTADOR` | Consultar eventos, administrar sus borradores, confirmar apuestas, consultar sus detalles y modificar su perfil | No administra eventos, no ve apuestas ajenas ni accede a reportes |

La autenticación comprueba **quién realiza una solicitud**; la autorización determina **qué operaciones puede realizar**. Además, las consultas de apostadores se filtran por `id_usuario` para evitar exponer recursos de otros usuarios.

## Reglas de negocio

### Gestión de eventos deportivos

Los eventos pueden encontrarse en los estados `PROGRAMADO`, `EN_VIVO`, `FINALIZADO` o `CANCELADO`.

- Solo los eventos `PROGRAMADO` o `EN_VIVO` se pueden seleccionar en una apuesta.
- Al finalizar, el resultado debe ser válido o poder calcularse a partir de marcadores enteros no negativos: `LOCAL`, `VISITANTE` o `EMPATE`.
- Un evento cancelado no necesita marcadores; sus selecciones pendientes se anulan conforme a las reglas de liquidación.
- Las cuotas local, empate y visitante deben ser números finitos **mayores que 1** al crearlas o modificarlas.
- Cambiar a un estado finalizado o cancelado inicia la liquidación de los detalles pendientes relacionados.
- Una actualización válida de cuotas emite el evento de Socket.IO `odds:updated`.

### Gestión de apuestas

Se admiten dos tipos:

| Tipo | Número de selecciones |
| --- | --- |
| `SIMPLE` | Exactamente 1 |
| `COMBINADA` | 2 o más |

**Validaciones principales:** el monto debe ser numérico y mayor que cero; cada selección debe ser `LOCAL`, `EMPATE` o `VISITANTE`; el evento debe estar disponible; y un mismo evento no puede repetirse cuando se crea o reemplaza el conjunto de selecciones.

Los importes se calculan así:

```text
cuota_total      = cuota_fijada_1 × cuota_fijada_2 × ... × cuota_fijada_n
premio_potencial = monto × cuota_total
```

La creación de un `BORRADOR` **no descuenta saldo**. La confirmación vuelve a validar las condiciones, comprueba el saldo disponible, efectúa el débito y cambia el estado a `PENDIENTE`. Solo los borradores pueden editarse o eliminarse.

```mermaid
stateDiagram-v2
    [*] --> BORRADOR: Crear apuesta
    BORRADOR --> BORRADOR: Cambiar monto / selecciones
    BORRADOR --> PENDIENTE: Confirmar y debitar saldo
    BORRADOR --> [*]: Eliminar borrador
    PENDIENTE --> PENDIENTE: Faltan eventos por resolver
    PENDIENTE --> GANADA: Pronósticos ganadores
    PENDIENTE --> PERDIDA: Existe selección perdedora
```

**Liquidación de combinadas:** el sistema espera a que todos los detalles de la apuesta dejen de estar pendientes antes de determinar su resultado global. Las pérdidas no generan premios; las ganancias acreditan el pago calculado y las cancelaciones pueden originar devoluciones según el caso. La anulación de selecciones no implica necesariamente un estado global `ANULADA` para la apuesta.

### Transacciones e integridad

Las operaciones críticas se realizan dentro de una transacción: se obtiene una conexión, se bloquean las filas relevantes, se validan las reglas, se actualizan los registros y se ejecuta `COMMIT` o `ROLLBACK`.

**Confirmación de apuesta**

1. Buscar y bloquear la apuesta; validar que exista y esté en `BORRADOR`.
2. Bloquear el registro del usuario y comprobar el saldo.
3. Descontar el importe y cambiar la apuesta a `PENDIENTE`.
4. Confirmar ambos cambios juntos, o revertirlos si algo falla.

**Liquidación de evento**

1. Bloquear el evento y validar su estado final.
2. Registrar el resultado o la cancelación y actualizar detalles pendientes.
3. Comprobar si cada apuesta relacionada ya tiene todos sus detalles resueltos.
4. Asignar resultado y acreditar premios o devoluciones cuando corresponda.
5. Confirmar o revertir todos los cambios de forma conjunta.

Las pruebas con mocks comprueban rutas de `COMMIT` y `ROLLBACK`, pero **no equivalen a una prueba de concurrencia real** contra PostgreSQL.

## API REST

La API se encuentra bajo el prefijo `/api`.

| Área | Endpoints | Uso |
| --- | --- | --- |
| Salud y esquema | `GET /api/health` · `GET /api/schema` | Comprobar API/base y consultar esquema (`ADMIN`) |
| Autenticación | `POST /api/auth/register` · `POST /api/auth/login` | Registrar cuenta e iniciar sesión |
| Perfil | `GET /api/auth/me` · `PATCH /api/auth/me` · `PATCH /api/auth/password` · `GET /api/menu` | Consultar/editar perfil, contraseña y menú |
| Usuarios | `GET /api/usuarios` · `POST /api/usuarios` · `GET/PATCH/DELETE /api/usuarios/:id` | Administración de usuarios |
| Eventos | `GET /api/eventos` · `POST /api/eventos` · `GET/PATCH/DELETE /api/eventos/:id` | Gestión de eventos deportivos |
| Apuestas | `GET /api/apuestas` · `POST /api/apuestas` · `GET/PATCH/DELETE /api/apuestas/:id` | Borradores, confirmación y consultas |
| Detalles | `GET /api/detalles` · `POST /api/detalles` · `GET/PATCH/DELETE /api/detalles/:id` · `GET /api/apuestas/:id/detalles` | Selecciones y consultas por apuesta |
| Reportes | `GET /api/reportes` | Indicadores generales para `ADMIN`/`GESTOR` |

A excepción de registro, login y salud, las rutas requieren autenticación. Las listas de los cuatro recursos CRUD documentados aceptan `limit` y `offset`, con un límite habitual máximo de 200 registros.

### Autenticación

1. Iniciar sesión con `POST /api/auth/login`.
2. Recibir el JWT cuando las credenciales sean correctas.
3. Incluir el token en las solicitudes protegidas:

```http
Authorization: Bearer <JWT>
```

El middleware verifica el token, establece la identidad y el perfil, y comprueba los permisos exigidos por la ruta. Los hashes de contraseñas no deben exponerse en las respuestas de perfil/autenticación.

### Ejemplo: crear y confirmar una apuesta

**1. Crear un borrador simple**

```http
POST /api/apuestas
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "tipo": "SIMPLE",
  "monto": 25,
  "selecciones": [
    {
      "id_evento": 1,
      "seleccion": "LOCAL"
    }
  ]
}
```

Si la solicitud es válida, el servicio responde con `201 Created` y los valores calculados de cuota y premio potencial.

**2. Confirmar el borrador existente**

```http
PATCH /api/apuestas/123
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "confirmar": true
}
```

> Los identificadores `1` y `123` son ilustrativos. Para confirmar una apuesta real de prueba, utiliza el `id_apuesta` obtenido al crear el borrador y un evento existente.

**3. Liquidación**

Cuando un evento alcanza un estado final, su actualización desencadena la liquidación de los detalles pendientes. En las apuestas combinadas, el resultado global se determina al resolverse todas sus selecciones.

### Respuestas HTTP habituales

| Código | Significado |
| --- | --- |
| `200` | Consulta o modificación satisfactoria |
| `201` | Recurso creado |
| `400` | Datos o regla de negocio inválidos |
| `401` | Credenciales o token ausentes/no válidos |
| `403` | Perfil sin permiso |
| `404` | Ruta o recurso inexistente; también puede ocultar una apuesta ajena |
| `409` | Conflicto de datos, saldo o estado, según el flujo |
| `500` | Error interno |
| `503` | Fallo de conexión/consulta en la comprobación de salud |

Los códigos concretos dependen de la ruta y la regla evaluada.

## Instalación y ejecución

### Requisitos previos

- **Node.js 20 o superior** y npm.
- Acceso a una base de datos **PostgreSQL** con las tablas que espera el backend.
- Una URL de conexión a PostgreSQL (`DATABASE_URL`) y un secreto JWT (`JWT_SECRET`).
- Para crear el primer administrador, credenciales de aprovisionamiento.

### 1. Instalar dependencias

Desde la carpeta raíz del repositorio:

```bash
cd backend
npm install
```

### 2. Configurar el entorno

Crea el archivo `backend/.env` y configura los valores de tu entorno:

```dotenv
DATABASE_URL=postgresql://USUARIO:CLAVE@SERVIDOR:5432/BASE_DE_DATOS
JWT_SECRET=REEMPLAZAR_POR_UN_SECRETO_LARGO_Y_ALEATORIO

# Solo para aprovisionar el administrador inicial
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_SEGURA
```

**No subas `.env`, credenciales ni claves reales a GitHub.** Los valores anteriores son ejemplos, no datos de acceso funcionales. La integración con Neon requiere una `DATABASE_URL` válida y un esquema existente compatible.

### 3. Iniciar el servidor

```bash
npm run dev
```

Por defecto, el servicio se publica en `http://localhost:3000` (configurable mediante `PORT`). Para iniciar en modo normal:

```bash
npm start
```

### 4. Crear el administrador inicial

Con las variables `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` configuradas:

```bash
npm run create-admin
```

### 5. Comprobar el servicio

```http
GET http://localhost:3000/api/health
```

La ruta de salud permite comprobar si la API puede consultar la base de datos.

## Pruebas y verificación

El proyecto incluye pruebas de reglas de negocio y solicitudes HTTP. Las suites de Jest utilizan **mocks de PostgreSQL**, de manera que no necesitan escribir sobre la base Neon existente. Algunas pruebas también simulan tokens o perfiles para evaluar permisos.

### Suites disponibles

| Archivo | Cobertura funcional descrita |
| --- | --- |
| `backend/tests/usuarios_validacion.test.js` | Registro, autenticación, correo, contraseña, privacidad, perfiles, menú y administración |
| `backend/tests/eventos_deportivos.responsable2.test.js` | Marcadores, resultados, cuotas, estados, CRUD y permisos |
| `backend/tests/apuestas.responsable3.test.js` | Borradores, confirmación, liquidación, repositorio, middleware y rutas |
| `backend/tests/detalle_apuestas.validacion.test.js` | Propiedad, validación de eventos y selecciones, borrador y cardinalidad |
| `backend/tests/unit.test.js` | Menú base y filtrado de campos permitidos; ejecutada con `node:test` |

### Comandos de verificación

Ejecuta los siguientes comandos desde `backend/`:

```bash
# Suite Jest y reporte de cobertura, según configuración del proyecto
npm test

# Pruebas unitarias independientes con node:test
npm run test:unit

# Suites específicas
npm run test:eventos
npm run test:apuestas

# Análisis estático por alcance
npm run lint:eventos
npm run lint:apuestas
```

> [!NOTE]
> Los resultados que aparecen a continuación proceden de **informes y capturas del repositorio**. No se han ejecutado de nuevo para elaborar este README ni deben sumarse como si correspondieran a una sola corrida de toda la aplicación.

### Resultados documentados

| Verificación | Resultado registrado | Interpretación |
| --- | --- | --- |
| Apuestas, suite del responsable 3 | **32 aprobadas · 0 fallidas** | Resultado de la suite específica de apuestas |
| Cobertura de apuestas | **90,02 %** sentencias · **84,24 %** ramas · **90,47 %** funciones · **99,31 %** líneas | Solo sobre los archivos y la ejecución incluidos en ese reporte |
| Eventos, suite del responsable 2 | **30 aprobadas · 0 fallidas** | Después de corregir una base previa de 25 aprobadas y 5 fallidas |
| Pruebas originales de eventos | **2 aprobadas** | Ejecución documentada aparte |
| Validaciones de usuarios y detalles | Archivos de prueba disponibles | No se atribuye un total final consolidado no documentado |
| ESLint, eventos | **47 errores iniciales**; ejecución final sin incidencias reportadas | Alcance y configuración del responsable 2 |
| ESLint, apuestas | **3 errores iniciales**; después **0 errores y 0 advertencias** | Revisión específica de apuestas |
| SonarQube, revisión histórica general | **29 issues abiertos → 0**, sin bugs, vulnerabilidades ni duplicación reportados | En esa revisión, la **Quality Gate no aprobó** por cobertura nueva del 0,0 % |
| SonarQube, revisión posterior de usuarios | **6 issues de usuarios cerrados**; **22 del backend aún abiertos** | Corte posterior y alcance diferente al histórico general |

**Cómo interpretar estos datos:** una prueba aprobada respalda el escenario evaluado bajo sus condiciones y mocks; el porcentaje de cobertura solo describe los archivos de su reporte; y un análisis de SonarQube sin issues no implica que su Quality Gate esté aprobada.

### Escenarios comprobados en las suites

<details>
<summary><strong>Usuarios y autenticación</strong></summary>

- Registro incompleto, contraseñas cortas y correo duplicado.
- Normalización del correo y valores seguros de registro.
- Inicio de sesión sin exponer `clave_hash`.
- Restricciones por token y perfil, y protección de datos propios y ajenos.
- Cambio de contraseña en una transacción, con reversión ante clave actual incorrecta.

</details>

<details>
<summary><strong>Eventos deportivos</strong></summary>

- Resultado `LOCAL`, `VISITANTE` o `EMPATE` a partir de marcadores.
- Rechazo de marcadores nulos, ausentes, negativos, decimales, textuales o no finitos.
- Restricciones de liquidación para eventos aún programados o en vivo.
- Cancelación sin marcadores y conservación del resultado almacenado cuando corresponde.
- Disponibilidad de eventos, operaciones CRUD, cuotas y permisos.

</details>

<details>
<summary><strong>Apuestas y detalles</strong></summary>

- Creación `SIMPLE` y `COMBINADA`, producto de cuotas y cálculo de premio.
- Validaciones de monto, tipo, número de selecciones, duplicados y eventos cerrados.
- Confirmación y descuento de saldo; rechazo por estado o saldo insuficiente.
- Edición/eliminación solo en borrador y `ROLLBACK` ante errores.
- Liquidación de ganadas, perdidas y selecciones anuladas, con pagos/devoluciones aplicables.
- Restricciones sobre apuestas ajenas y consistencia de detalles.

</details>

## Correcciones y calidad del código

Durante la verificación se registraron defectos funcionales y hallazgos de mantenibilidad. Ambos son importantes, pero **un *code smell* no equivale necesariamente a un fallo funcional**.

### Principales problemas corregidos

| Módulo | Hallazgo | Mejora registrada |
| --- | --- | --- |
| Eventos | Marcadores negativos, decimales, texto o valores no finitos podían llegar al cálculo | Validación de enteros no negativos y reversión ante errores |
| Eventos | La creación admitía cuotas menores o iguales a 1, a diferencia de la edición | Validación previa al `INSERT` y respuesta `400` |
| Pruebas de eventos | Comparaciones exactas de SQL fallaban por espacios sin relevancia funcional | Expresiones regulares que conservan la comprobación de parámetros |
| Apuestas | `selecciones: null` o un valor no arreglo podía provocar acceso inválido a `length` | Validación con `Array.isArray` |
| Apuestas/liquidación | Condicionales densos, ternarios anidados y funciones complejas | Funciones auxiliares para validaciones, resultados, estados y pagos |
| SQL compartido | Construcción poco legible de sentencias SQL dinámicas | Separación de columnas, parámetros y asignaciones; consultas parametrizadas |
| Usuarios | Protección de hash, correo, perfil y saldo | Normalización, filtrado de campos y reglas de edición seguras |
| Estilo | Variables no utilizadas, `prefer-const`, comillas y formato | Correcciones de lint según el alcance de cada responsable |

La línea base de eventos registró **cinco fallos relevantes**: cuatro validaciones de marcadores y una creación con cuota inválida. Tras corregirlos, se documentaron **30 casos aprobados**.

### Hallazgos de SonarQube

En el análisis general histórico se reportaron **29 *code smells***, agrupados así:

| Regla | Hallazgos | Tema |
| --- | ---: | --- |
| `javascript:S2681` | 18 | Estructuras de control y bloques explícitos |
| `S3358` | 4 | Operadores ternarios anidados |
| `S3776` | 3 | Complejidad cognitiva de funciones |
| `S4624` | 3 | Plantillas de cadenas anidadas |
| `S6582` | 1 | Uso recomendado de optional chaining |
| **Total** | **29** | |

En una revisión general posterior documentada, ese conjunto histórico pasó de **29 a 0 issues abiertos**. Sin embargo, el informe registró una **Quality Gate en `ERROR`** porque `new_coverage` era **0,0 %**, por debajo del umbral configurado de **80 %**.

En una revisión distinta, enfocada en usuarios, se documentó el cierre de seis issues de esa área y la permanencia de 22 issues del backend. **No son mediciones intercambiables:** corresponden a distintos alcances y momentos.

## Evidencias

Los siguientes archivos y capturas respaldan resultados concretos de las revisiones realizadas. Las rutas se mantienen relativas a la raíz del repositorio.

### Pruebas de eventos: 30 casos aprobados

![Resultado de Jest y Supertest: 30 casos aprobados](evidencias_responsable2_eventos_deportivos/06_jest_supertest_30_pruebas_aprobadas.png)

### Análisis final de eventos en SonarQube

![Análisis SonarQube de la revisión de eventos](evidencias_responsable2_eventos_deportivos/09_sonarqube_resultado_final.png)

### Hallazgos de calidad registrados

![Incidencias encontradas en SonarQube](sonarqube%20errores%20encontrados/Errores_Obtenidos.png)

> Si las imágenes no aparecen en GitHub, verifica que los archivos estén subidos y que las rutas y mayúsculas coincidan exactamente con las carpetas del repositorio.

## Limitaciones y mejoras futuras

### Limitaciones actuales

- Las pruebas registradas utilizan mocks de base de datos; no garantizan el comportamiento con una instancia real aislada de PostgreSQL o Neon.
- El esquema relacional debe existir previamente: no se administran migraciones desde el servidor.
- No hay evidencia consolidada de cobertura de todos los módulos y sus rutas en una única ejecución.
- Los resultados de SonarQube representan revisiones y alcances diferentes.
- No se ha demostrado el comportamiento bajo concurrencia real o carga elevada.
- La API simula operaciones con créditos virtuales, sin pagos reales ni interfaz web completa demostrada.

### Mejoras propuestas

1. **Pruebas de integración:** usar una base PostgreSQL desechable y migraciones versionadas.
2. **Validación unificada:** ejecutar todas las suites y verificaciones estáticas desde un único flujo reproducible.
3. **Cobertura en SonarQube:** importar un reporte LCOV válido y evaluar correctamente la Quality Gate.
4. **Concurrencia e idempotencia:** probar confirmaciones y liquidaciones repetidas o simultáneas.
5. **Documentación técnica:** completar el contrato OpenAPI, el esquema y las instrucciones de despliegue.
6. **Validación consistente:** unificar controles de entrada y restricciones de integridad en la base de datos.

## Preguntas técnicas

<details>
<summary><strong>¿Por qué primero se crea una apuesta en BORRADOR?</strong></summary>

Porque permite configurar el monto y las selecciones sin descontar todavía el saldo. El débito ocurre cuando el usuario confirma y el servicio vuelve a validar las reglas.

</details>

<details>
<summary><strong>¿Qué garantiza la transacción al confirmar?</strong></summary>

Que el descuento de saldo y el cambio de estado de la apuesta se confirmen juntos o se reviertan juntos si aparece un error.

</details>

<details>
<summary><strong>¿Por qué se guarda una cuota_fijada en cada detalle?</strong></summary>

Para conservar la cuota asociada a la selección, aunque la cuota publicada del evento cambie posteriormente.

</details>

<details>
<summary><strong>¿Cuándo se liquida una apuesta combinada?</strong></summary>

Cuando todos sus detalles dejan de estar pendientes y es posible determinar el resultado global conforme a las reglas del servicio.

</details>

<details>
<summary><strong>¿En qué se diferencian 401 y 403?</strong></summary>

`401 Unauthorized` indica ausencia o invalidez de autenticación. `403 Forbidden` indica que la identidad autenticada no tiene permiso para esa operación.

</details>

<details>
<summary><strong>¿Qué limitación tiene una prueba con PostgreSQL simulado?</strong></summary>

Permite comprobar decisiones y llamadas a consultas, pero no demuestra compatibilidad total con el esquema real ni comportamiento de bloqueos y concurrencia del motor.

</details>

<details>
<summary><strong>¿Por qué cero issues no significa Quality Gate aprobada?</strong></summary>

Porque la puerta de calidad evalúa también condiciones como cobertura. En la revisión histórica registrada, el reporte mostró cero issues, pero la cobertura nueva fue 0,0 % y la puerta quedó en `ERROR`.

</details>

<details>
<summary><strong>¿Qué faltaría para validar integralmente PostgreSQL real?</strong></summary>

Ejecutar pruebas de integración en una base aislada, cubrir las rutas y transiciones principales y añadir escenarios de concurrencia, con resultados y cobertura reproducibles.

</details>

## Documentación del repositorio

| Recurso | Contenido |
| --- | --- |
| [`backend/README.md`](backend/README.md) | Configuración, API, operación y consideraciones del backend |
| [`documentacion/README.md`](documentacion/README.md) | Descripción técnica general |
| [`documentacion/Informe_SonarQube.md`](documentacion/Informe_SonarQube.md) | Análisis general histórico y Quality Gate |
| [`documentacion/APIS_POR_TABLA_Y_RESPONSABLE.md`](documentacion/APIS_POR_TABLA_Y_RESPONSABLE.md) | Rutas y responsabilidades por recurso |
| [`informe sobre errores/INFORME_SONARQUBE_WAREBET.md`](informe%20sobre%20errores/INFORME_SONARQUBE_WAREBET.md) | Hallazgos generales de SonarQube |
| [`correccion de errores/`](correccion%20de%20errores/) | Informes de correcciones por módulo |
| [`backend/Informe sobre validacion y verficiacion/INFORME_VALIDACION_Y_VERIFICACION_APUESTAS.md`](backend/Informe%20sobre%20validacion%20y%20verficiacion/INFORME_VALIDACION_Y_VERIFICACION_APUESTAS.md) | Pruebas y cobertura de apuestas |
| [`evidencias_responsable2_eventos_deportivos/`](evidencias_responsable2_eventos_deportivos/) | Capturas de las pruebas de eventos |
| [`sonarqube errores encontrados/`](sonarqube%20errores%20encontrados/) | Capturas de análisis estático |
| [`backend/postman_collection.json`](backend/postman_collection.json) | Colección de solicitudes Postman |
| [`backend/src/`](backend/src/) | Código fuente |
| [`backend/tests/`](backend/tests/) | Pruebas automatizadas |
| [`backend/package.json`](backend/package.json) | Dependencias y scripts de ejecución |

---

<div align="center">

**WareBet · Proyecto académico de Ingeniería de Software**

Backend enfocado en reglas de negocio, integridad de datos, control de acceso y verificación del software.

</div>
