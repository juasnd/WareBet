# Backend del sistema de apuestas deportivas

Este backend es una API para un proyecto académico de apuestas deportivas simuladas. Gestiona usuarios, eventos deportivos y apuestas con créditos virtuales, y se conecta a PostgreSQL en Neon para consultar y guardar la información.

## Tecnologías

- Node.js y JavaScript (CommonJS)
- Express.js para la API REST
- PostgreSQL y `pg` para la base de datos
- Neon como servicio de PostgreSQL
- JWT y bcryptjs para autenticación y contraseñas
- Socket.IO para comunicar cambios de cuotas
- dotenv, CORS, Helmet y express-rate-limit para configuración y middleware
