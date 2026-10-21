# SST Kotoduo: núcleo funcional

Sistema de Seguimiento y Trazabilidad de Trabajos Productivos de Kotoduo. API REST en Node.js con PostgreSQL (base estructurada) y MongoDB (base documental). Anexo A del Informe N.º 2, Proyecto Integrado.

## Requisitos

- Node.js 24
- MongoDB 8 escuchando en `mongodb://127.0.0.1:27027` (o la URI indicada en `SST_MONGO_URI`)

PostgreSQL se ejecuta embebido con PGlite durante el desarrollo y las pruebas. En producción se usa el mismo `src/db/esquema.sql` en Cloud SQL.

## Comandos

```
npm install
npm run pruebas        # CP-01 a CP-46 con cobertura
npm run rendimiento    # CP-33 (autocannon)
npm run lint           # ESLint con reglas de seguridad
node rendimiento/evidenciaBases.js   # evidencia de las secciones 6.3 a 6.5
```

Para iniciar la API se copia `.env.example` como `.env`, se completa `SST_JWT_SECRETO` (32 caracteres o más) y se ejecuta `npm run inicio`.

## Probar el prototipo con datos de demostración

```
npm run demo:sembrar  # crea las 6 cuentas y 6 trabajos de ejemplo (con el servidor APAGADO)
npm run demo          # genera .env si falta, levanta MongoDB local si hace falta y abre la API
```

PGlite es de un solo proceso: siembra siempre antes de levantar el servidor (no en paralelo), o
el servidor no verá los datos nuevos. Abre `http://localhost:3000`. Las contraseñas de las cuentas
de demostración quedan solo en `.demo-credenciales.txt` (se genera de nuevo en cada siembra y nunca
se sube al repositorio).

## Estructura

- `src/db`: esquema, datos base y conexión a ambas bases
- `src/dominio`: reglas del flujo, permisos, contraseñas y archivos
- `src/middleware`: autenticación, autorización, CSRF, validación y errores
- `src/modulos`: auth, trabajos, disenos, catalogos, panel, usuarios y auditoria
- `web`: front-end (HTML, CSS y JavaScript sin build), servido por la misma API
- `scripts`: siembra y arranque de datos de demostración
- `tests`: unitarias, integración y seguridad
- `rendimiento`: prueba de carga y generación de evidencias
- `evidencias`: salidas de las ejecuciones
