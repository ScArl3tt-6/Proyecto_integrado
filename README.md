# SST Kotoduo: núcleo funcional

Sistema de Seguimiento y Trazabilidad de Trabajos Productivos de Kotoduo. API REST en Node.js con PostgreSQL (base estructurada) y MongoDB (base documental). Anexo A del Informe N.º 2, Proyecto Integrado.

## Requisitos

- Node.js 24
- PostgreSQL 16 real, instalado y corriendo en `127.0.0.1:5432`
- MongoDB 8 real, instalado (el proyecto lo arranca con autenticación en `127.0.0.1:27027`)

## Preparar el entorno (una sola vez)

```
npm install
npm run db:crear          # pide la contraseña del superusuario postgres (no se guarda ni se repite)
npm run mongo:iniciar     # arranca MongoDB con autenticación y crea sus usuarios
```

`npm run db:crear` crea la base `sst_kotoduo` y tres roles de PostgreSQL con privilegios mínimos
(`sst_app`, `sst_propietario`, `sst_pruebas`) y guarda sus credenciales en `.env`. `npm run
mongo:iniciar` hace lo mismo para MongoDB (`sst_admin`, `sst_app`, `sst_pruebas`). Después de este
paso, la contraseña del superusuario `postgres` no se vuelve a pedir. Detalle completo en
`docs/VER_LAS_BASES_DE_DATOS.md` (incluye cómo conectarse con pgAdmin 4 y MongoDB Compass).

Para iniciar la API sin datos de ejemplo: completa `SST_JWT_SECRETO` en `.env` (32 caracteres o
más) y ejecuta `npm run inicio`.

## Comandos

```
npm run pruebas        # CP-01 a CP-46 con cobertura, contra PostgreSQL y MongoDB reales
npm run verificar      # entorno, conexión, mínimo privilegio y un ciclo escritura/lectura/limpieza
npm run rendimiento    # CP-33 (autocannon)
npm run lint           # ESLint con reglas de seguridad
node rendimiento/evidenciaBases.js   # evidencia de las secciones 6.3 a 6.5
node rendimiento/indices.js          # evidencia de optimización con y sin índices (3.1.2.4)
```

## Probar el prototipo con datos de demostración

```
npm run demo:sembrar  # crea las 6 cuentas y 6 trabajos de ejemplo
npm run demo          # completa SST_JWT_SECRETO si falta y abre la API
```

Abre `http://localhost:3000`. Las contraseñas de las cuentas de demostración quedan solo en
`.demo-credenciales.txt` (se genera de nuevo en cada siembra y nunca se sube al repositorio).

## Estructura

- `src/db`: esquema, datos base y conexión a ambas bases
- `src/dominio`: reglas del flujo, permisos, contraseñas y archivos
- `src/middleware`: autenticación, autorización, CSRF, validación y errores
- `src/modulos`: auth, trabajos, disenos, catalogos, panel, usuarios y auditoria
- `web`: front-end (HTML, CSS y JavaScript sin build), servido por la misma API
- `scripts`: siembra y arranque de datos de demostración
- `scripts/db`: preparación de PostgreSQL y MongoDB reales (roles, privilegios mínimos)
- `tests`: unitarias, integración y seguridad
- `rendimiento`: prueba de carga y generación de evidencias
- `evidencias`: salidas de las ejecuciones
- `docs`: documentación técnica (bases de datos, cambios respecto al diseño)
