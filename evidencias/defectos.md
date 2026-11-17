# Registro de defectos — SST Kotoduo

Plantilla por defecto: **DEF-nn** con descripción, caso de prueba, severidad, causa, corrección,
nueva ejecución y estado. No se borra ningún defecto después de corregirlo: queda la historia
completa para el informe (sección de validación de resultados).

> Los incidentes INC-01 a INC-05 del Informe 2 todavía no están transcritos aquí: ese informe no
> está cargado en esta sesión de Claude Code. Alguna integrante debe copiarlos desde el Informe 2
> a esta misma tabla antes de la entrega final, para que quede un solo registro de defectos.

---

## DEF-01 — Falso positivo al detectar si MongoDB ya tenía usuarios configurados

- **Encontrado en:** Fase 0 (bases de datos reales), al ejecutar `npm run mongo:iniciar` por
  primera vez contra una base de datos recién creada.
- **Caso de prueba:** ejecución manual de `npm run mongo:iniciar` con `.env` apuntando a
  `mongodb://127.0.0.1:27027` sin usuario ni contraseña (valor heredado de una configuración
  anterior, sin autenticación).
- **Severidad:** Media. No se perdió ningún dato, pero el script habría terminado "con éxito" sin
  haber creado ningún usuario real, dejando la base sin autenticación efectiva.
- **Causa confirmada:** la función que decide si "ya está todo configurado" solo probaba si un
  `ping` con la URI de `.env` tenía éxito. Mientras MongoDB no tiene ningún usuario creado, su
  "excepción de localhost" permite conectarse y ejecutar comandos sin ninguna credencial, así que
  el `ping` funcionaba igual aunque la URI no tuviera usuario ni contraseña: el script interpretaba
  ese éxito como "ya está configurado" y no creaba nada.
- **Corrección:** antes de intentar el `ping`, se comprueba que la URI guardada tenga un nombre de
  usuario. Si no lo tiene, se trata como "no configurado" sin necesidad de conectarse siquiera.
  (`scripts/db/mongo-crear-usuarios.js`, función `yaConfigurado`.)
- **Nueva ejecución:** `npm run mongo:iniciar` ejecutado dos veces seguidas: la primera crea los
  tres usuarios (`sst_admin`, `sst_app`, `sst_pruebas`); la segunda detecta correctamente que ya
  existen y no intenta crearlos de nuevo. Confirmado en consola, salida literal:
  ```
  MongoDB ya está escuchando en 127.0.0.1:27027.
  MongoDB ya tiene usuarios configurados (SST_MONGO_URI funciona); no se crea nada nuevo.
  ```
- **Estado:** Corregido.

## DEF-02 — Orden incorrecto al crear varios usuarios de MongoDB (la "excepción de localhost" solo alcanza para uno)

- **Encontrado en:** Fase 0, al escribir `scripts/db/mongo-crear-usuarios.js`.
- **Caso de prueba:** crear el usuario administrador y, en la misma conexión sin autenticar, crear
  a continuación el usuario de la aplicación.
- **Severidad:** Alta. El script se detenía a mitad de camino: quedaba creado el usuario
  administrador pero no el de la aplicación, y había que intervenir a mano para seguir.
- **Causa confirmada:** la "excepción de localhost" de MongoDB permite como máximo **una**
  operación sin autenticar; apenas existe el primer usuario en la base `admin`, cualquier otra
  operación en esa misma conexión exige autenticarse. El script intentaba crear los tres usuarios
  seguidos sin volver a autenticarse.
- **Corrección:** tras crear `sst_admin`, se cierra esa conexión y se abre una nueva, ya
  autenticada como `sst_admin`, para crear `sst_app` y `sst_pruebas`.
- **Nueva ejecución:** confirmado con `npm run mongo:iniciar` sobre una base nueva: los tres
  usuarios quedan creados en una sola ejecución, sin intervención manual.
- **Estado:** Corregido.

## DEF-03 — El rol `readWriteAnyDatabase` de MongoDB no incluye `dropDatabase`

- **Encontrado en:** Fase 0, al verificar que el rol `sst_pruebas` (pensado para que la suite
  automática de pruebas cree y borre una base temporal por cada ejecución) pudiera de verdad
  borrar esas bases.
- **Caso de prueba:** script de verificación manual que crea una base `sst_prueba_verificacion`,
  inserta y lee un documento, y después intenta `dropDatabase()`.
- **Severidad:** Alta. Sin esto, cada ejecución de la suite de pruebas habría dejado una base
  `sst_prueba_xxxx` abandonada en el servidor, acumulando basura indefinidamente.
- **Causa confirmada:** en MongoDB, `readWriteAnyDatabase` cubre las operaciones normales de
  lectura y escritura de documentos, pero la acción `dropDatabase` pertenece al grupo de roles de
  administración de bases (`dbAdmin` / `dbAdminAnyDatabase`), no al de lectura/escritura. Se
  confirmó con el mensaje de error real:
  ```
  FALLO: not authorized on sst_prueba_verificacion to execute command { dropDatabase: 1, ... }
  ```
- **Corrección:** se agregó también el rol `dbAdminAnyDatabase` a `sst_pruebas`, además de
  `readWriteAnyDatabase`.
- **Nueva ejecución:** el mismo script de verificación, repetido después de la corrección, creó,
  insertó, leyó y borró la base temporal sin errores:
  ```
  Insercion y lectura en base temporal: {"_id":"...","ok":true}
  Base temporal eliminada correctamente.
  ```
  También se confirmó, aparte, que `sst_app` (el usuario de la aplicación en marcha) no puede leer
  ni escribir en ninguna base distinta de `sst_kotoduo` — mínimo privilegio funcionando como se
  esperaba.
- **Estado:** Corregido.

## DEF-04 — `tests/contexto.js` no cargaba `.env`, así que las 45 pruebas fallaban contra PostgreSQL real

- **Encontrado en:** Fase 0, al correr `npm run pruebas` por primera vez después de migrar a
  PostgreSQL real.
- **Caso de prueba:** `npm run pruebas` completo, apenas terminado `npm run db:crear`.
- **Severidad:** Alta. Las 45 pruebas automatizadas fallaban (38 de 45, con cobertura de solo
  26 %), no por un problema del código de la aplicación sino de la propia preparación de las
  pruebas.
- **Causa confirmada:** con el motor anterior (PGlite embebido), las pruebas no necesitaban leer
  ninguna variable de entorno para la base de datos. Al pasar a PostgreSQL y MongoDB reales,
  `tests/contexto.js` pasó a necesitar `SST_PG_PRUEBAS_URL` y `SST_MONGO_PRUEBAS_URI`, pero nada
  en el arranque de Jest cargaba el archivo `.env` hacia `process.env` antes de que corrieran las
  pruebas.
- **Corrección:** se agregó `cargarEnv()` (el mismo lector de `.env` que ya usan los scripts de
  demostración) al principio de `tests/contexto.js`.
- **Nueva ejecución:** ver `evidencias/ejecucion_pruebas_postgresql_real.txt` — 45 de 45 pruebas
  aprobadas.
- **Estado:** Corregido.

## DEF-05 — El flujo de GitHub Actions quedó desactualizado tras migrar a bases de datos reales

- **Encontrado en:** PR #1 (`feature/bases-reales`), al revisar por qué el chequeo
  `calidad-y-pruebas` fallaba en GitHub Actions aunque localmente todo pasaba.
- **Caso de prueba:** ejecución del flujo `.github/workflows/integracion-continua.yml` en GitHub
  Actions sobre el PR.
- **Severidad:** Alta. El chequeo obligatorio del PR fallaba siempre, por dos causas
  independientes:
  1. El paso `gitleaks/gitleaks-action@v2` fallaba porque esa acción necesita la variable de
     entorno `GITHUB_TOKEN` para consultar la API de GitHub; no se trataba de ningún secreto
     filtrado en el código.
  2. El flujo seguía preparado para el diseño anterior (PGlite + Mongo sin autenticación): solo
     levantaba un servicio `mongo:8` y definía `SST_MONGO_URI`. Desde la migración de la Fase 0,
     `tests/contexto.js` y `tests/integracion/baseRelacional.test.js` exigen `SST_PG_PRUEBAS_URL`
     (para crear y destruir su propia base PostgreSQL temporal) y `SST_MONGO_PRUEBAS_URI` (incluso
     el nombre de la variable de Mongo había cambiado); el flujo no tenía ningún servicio
     PostgreSQL y seguía usando el nombre de variable antiguo de Mongo.
- **Causa confirmada:** el flujo de CI no se actualizó junto con el cambio de `tests/contexto.js`
  en la Fase 0. Se revisó el código de las pruebas (no se asumió nada): ninguna prueba de
  `npm run pruebas` comprueba que MongoDB exija autenticación, así que no era necesario levantar
  Mongo con `--auth` en CI; sí era indispensable un servicio PostgreSQL real, porque las pruebas
  ejecutan `CREATE DATABASE` / `DROP DATABASE ... WITH (FORCE)` contra él.
- **Corrección:**
  - Se agregó `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` al paso de `gitleaks-action@v2`.
  - Se agregó un servicio `postgres:16` al job, con un usuario y una contraseña **efímeros,
    definidos directamente en el propio archivo del flujo** (no son los de `.env` ni ningún
    secreto real: el contenedor se crea y se destruye con cada ejecución del job, y no es
    alcanzable desde fuera del runner).
  - Se corrigieron los nombres de las variables de entorno del job a los que exige
    `tests/contexto.js`: `SST_PG_PRUEBAS_URL` (apuntando al nuevo servicio PostgreSQL) y
    `SST_MONGO_PRUEBAS_URI` (mismo servicio Mongo de antes, sin autenticación, que es lo único que
    las pruebas necesitan).
- **Nueva ejecución:** no fue posible ejecutar GitHub Actions ni Docker desde esta sesión (sin
  Docker disponible localmente), así que no se pudo reproducir el flujo completo tal cual corre en
  el runner. Sí se confirmó, en local, contra PostgreSQL y MongoDB reales: `npm run lint
  --max-warnings=0` sin errores ni advertencias, y `npm run pruebas` con 47 de 47 pruebas
  aprobadas (mismo comando que ejecuta el flujo). Falta que, al abrir el PR con este commit, el
  equipo confirme en la pestaña "Actions" de GitHub que el job `calidad-y-pruebas` termina en
  verde con el servicio PostgreSQL real.
- **Estado:** Corregido en el código del flujo; verificación en GitHub Actions pendiente de
  confirmar por el equipo tras subir este commit.
