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

## DEF-06 — El mínimo privilegio de MongoDB no se verifica en CI, solo en local

- **Encontrado en:** al revisar, a pedido del equipo, cuáles de las 47 pruebas de
  `npm run pruebas` comprueban que `sst_app` no pueda hacer operaciones administrativas en
  MongoDB (p. ej. `dropDatabase`).
- **Caso de prueba:** se revisó el código completo de `tests/` (no se supuso nada). Ninguna de
  las 47 pruebas de Jest verifica privilegios de MongoDB; la única que existe es
  `scripts/verificar-entorno.js` (`npm run verificar`), que no es parte de la suite de Jest ni del
  flujo de GitHub Actions.
- **Severidad:** Media. No hay pérdida de datos ni una vulnerabilidad explotable hoy, pero sí un
  hueco real en la automatización: si alguien ampliara por error los permisos de `sst_app`, nada
  en CI lo detectaría; solo lo notaría quien ejecutara `npm run verificar` a mano en su propio
  equipo.
- **Causa confirmada:** dos razones, verificadas directamente:
  1. `npm run verificar` nunca se agregó como paso del flujo `.github/workflows/integracion-continua.yml`.
  2. Aunque se agregara tal cual está, fallaría igual en CI: el servicio `mongo:8` del flujo corre
     sin `--auth` (no se le pasa `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`), así que ninguna
     restricción de rol se aplica de verdad ahí — cualquier conexión tiene privilegios completos,
     diera o no el nombre de usuario "sst_app". El rechazo de `dropDatabase` que prueba
     `verificar-entorno.js` solo es real cuando Mongo corre con autenticación habilitada, como en
     el entorno de desarrollo (`npm run mongo:iniciar`, que sí arranca `mongod --auth`).
- **Propuesta de corrección (la forma más simple identificada, sin implementar todavía):**
  GitHub Actions no permite agregar argumentos de arranque (como `--auth`) a un servicio definido
  en `services:`, así que no basta con agregarle variables de entorno al `mongo` actual. El camino
  más simple es: en un paso del job (antes de las pruebas), levantar Mongo con
  `docker run -d -p 27027:27017 -e MONGO_INITDB_ROOT_USERNAME=... -e MONGO_INITDB_ROOT_PASSWORD=... mongo:8 --auth`
  (credenciales efímeras de CI, igual que las de PostgreSQL), crear ahí mismo un usuario
  `sst_app_ci` con solo `readWrite` sobre una base de prueba (reusando la lógica de
  `scripts/db/mongo-crear-usuarios.js`), y agregar una prueba nueva (p. ej.
  `tests/seguridad/privilegioMongo.test.js`) que se conecte con esa URI restringida y confirme que
  `dropDatabase()` y los comandos de administración son rechazados — el mismo chequeo que ya hace
  `verificar-entorno.js`, pero como prueba automática de Jest, para que corra en cada PR.
- **Estado:** Pendiente de corregir. Documentado para que el equipo lo priorice en la Fase 1 o en
  las Fases 3-4 (pruebas y documentación), no se tocó código de pruebas ni del flujo de CI para
  esto todavía.

## DEF-07 — El paso de gitleaks seguía fallando en el PR #1 por el historial superficial del checkout, no por un secreto

- **Encontrado en:** PR #1 (`feature/bases-reales`), después de corregir DEF-05 (que agregó
  `GITHUB_TOKEN` al paso de `gitleaks-action@v2`): el chequeo `calidad-y-pruebas` seguía en rojo
  en el paso de gitleaks.
- **Caso de prueba:** ejecución del flujo sobre el PR, reportada por el equipo desde la pestaña
  "Actions" de GitHub (esta sesión no tiene acceso directo a esos registros ni a Docker/GitHub
  Actions, así que el diagnóstico de abajo se confirma contra el comportamiento documentado de
  `actions/checkout@v4` y de `gitleaks-action@v2`, no viendo el log en vivo).
- **Severidad:** Alta. Bloqueaba el chequeo obligatorio del PR, pero **no por una razón de
  seguridad real**: no se encontró ningún secreto, el escaneo ni siquiera llegó a ejecutarse.
- **Causa confirmada:** `actions/checkout@v4` trae, por defecto, `fetch-depth: 1` (una clonación
  superficial con un solo commit, el de la punta de la rama). `gitleaks-action@v2` necesita
  comparar contra el commit base del PR (en este caso `643ee5a`) para saber qué rango de
  historial escanear; como ese commit nunca se descargó, git no lo encuentra y el paso falla con
  un error de historial (commit no encontrado), antes de llegar a revisar ningún archivo. No es
  un secreto filtrado: es que el escaneo no se pudo ejecutar.
- **Corrección:** se agregó `with: fetch-depth: 0` al paso `actions/checkout@v4` de
  `.github/workflows/integracion-continua.yml`, para que el runner traiga el historial completo
  de la rama y gitleaks pueda encontrar el commit base.
- **Nueva ejecución:** no ejecutado desde esta sesión (sin acceso a GitHub Actions ni a Docker
  localmente). Queda pendiente que el equipo confirme, en la pestaña "Actions" del PR tras subir
  este commit, que el paso de gitleaks ya no falla por el historial y, si encontrara algo, que sea
  un hallazgo real y no este error de configuración.
- **Estado:** Corregido en el código del flujo; verificación en GitHub Actions pendiente de
  confirmar por el equipo.

## DEF-08 — El servidor real nunca pudo arrancar desde la Fase 0: `src/servidor.js` seguía usando el nombre de campo de PGlite

- **Encontrado en:** Fase 1 (funcionalidad de materiales), al levantar `npm run demo` para probar
  en el navegador la pantalla nueva de materiales.
- **Caso de prueba:** `npm run demo:sembrar` seguido de `npm run demo`, con `SST_PG_URL` y
  `SST_MONGO_URI` ya presentes en `.env`.
- **Severidad:** Alta. El servidor real (`npm run inicio` y `npm run demo`, es decir la aplicación
  de verdad, no las pruebas) no podía arrancar **desde que se migró a PostgreSQL real en la Fase
  0**, y nadie lo había notado: las 50 pruebas de Jest pasan igual porque usan su propio contexto
  (`tests/contexto.js`), que llama a `crearBaseRelacional` directamente con su URL, sin pasar por
  `src/servidor.js`. Ese archivo además está explícitamente excluido de la medición de cobertura
  (`"!src/servidor.js"` en `package.json`), así que tampoco había ninguna señal ahí.
- **Causa confirmada:** `src/config/entorno.js` se actualizó en la Fase 0 para exponer
  `entorno.pgUrl` en vez de `entorno.pgDirectorio` (el nombre que tenía con PGlite), pero
  `src/servidor.js` se quedó llamando a `crearBaseRelacional(entorno.pgDirectorio)`. Como ese
  campo ya no existe, `crearBaseRelacional` recibía `undefined` y rechazaba con su propio mensaje
  de guarda. Error real, literal:
  ```
  No fue posible iniciar el servicio: crearBaseRelacional necesita una URL de conexión (SST_PG_URL)
  ```
- **Corrección:** se cambió esa línea a `crearBaseRelacional(entorno.pgUrl)` (`src/servidor.js`).
- **Nueva ejecución:** `npm run demo:sembrar` y luego `npm run demo` (con el fix aplicado):
  ```
  Abre http://localhost:3000 en el navegador.
  SST Kotoduo API escuchando en el puerto 3000
  ```
  Confirmado además con una solicitud real: `curl http://localhost:3000/` responde `200`.
- **Estado:** Corregido.
- **Lección para el protocolo de pruebas:** este defecto demuestra que "las pruebas automáticas
  pasan" no es lo mismo que "la aplicación arranca de verdad" cuando el punto de entrada de
  producción no está cubierto por ninguna prueba ni por la cobertura. Antes de dar por terminada
  cualquier fase, conviene además levantar `npm run demo` una vez y abrir la aplicación en un
  navegador real, no solo correr `npm run pruebas`.

## DEF-09 — `sst_app` no tenía permiso de escritura sobre `trabajo_material`, y las pruebas de Jest no podían detectarlo

- **Encontrado en:** Fase 1 (funcionalidad de materiales), en la misma verificación manual en
  navegador que encontró DEF-08, al intentar registrar un material como Producción.
- **Caso de prueba:** `POST /api/trabajos/KT-2026-0005/materiales` como `marcela` (Producción),
  contra la base real (`npm run demo`, rol `sst_app`).
- **Severidad:** Alta. La funcionalidad nueva de materiales no funcionaba en absoluto contra la
  base real, aunque las 50 pruebas automáticas (incluidas las 3 nuevas de esta función, CP-49 a
  CP-51) pasaban en verde.
- **Causa confirmada:** en la Fase 0, `scripts/db/crear-base-postgres.js` clasificó
  `trabajo_material` como de **solo lectura** para `sst_app` (`SOLO_LECTURA`), porque en ese
  momento ningún endpoint escribía ahí. Al agregar el registro de materiales en la Fase 1, nadie
  actualizó esa clasificación. Error real del servidor:
  ```
  { idIncidente: '...', ruta: '/api/trabajos/KT-2026-0005/materiales', mensaje: 'permiso denegado a la tabla trabajo_material' }
  ```
  Las pruebas de Jest no lo detectaron por una razón estructural: `tests/contexto.js` aplica el
  esquema y ejecuta la aplicación usando la conexión de `sst_pruebas` (el rol que crea la base de
  prueba y por lo tanto es su propio dueño), **no** la de `sst_app`. Es decir, hoy ninguna prueba
  de Jest ejercita de verdad los privilegios mínimos de `sst_app` sobre una tabla nueva; solo lo
  hace `scripts/verificar-entorno.js`, y solo sobre las dos tablas que ya comprobaba antes
  (`usuario` y la colección de Mongo), no sobre `trabajo_material`.
- **Corrección:** se movió `trabajo_material` de `SOLO_LECTURA` a `LECTURA_ESCRITURA` en
  `scripts/db/crear-base-postgres.js`, y se aplicó el `GRANT SELECT, INSERT, UPDATE ON
  trabajo_material TO sst_app` directamente con el rol `sst_propietario` sobre la base real ya
  existente (sin usar ni pedir la contraseña del superusuario, que no hacía falta para este
  `GRANT`).
- **Nueva ejecución:** con el permiso corregido, la misma prueba manual en navegador registró el
  material sin error (ver `evidencias/fase1_materiales.txt`).
- **Estado:** Corregido.
- **Riesgo que queda abierto:** el mismo patrón puede repetirse con cualquier tabla nueva o
  columna nueva que una futura fase necesite escribir, porque las pruebas de Jest nunca ejercitan
  el rol real `sst_app`. Quedó anotado en `docs/PLAN_FASES.md` como algo a revisar en las Fases
  3-4 (por ejemplo, haciendo que `tests/contexto.js` use `sst_app` para las operaciones de la
  aplicación y un rol aparte solo para preparar el esquema), no se implementó ese cambio mayor en
  esta sesión para no desviarse del orden de la Fase 1 acordado con el equipo.

## DEF-10 — `GET /api/disenos/:idDiseno` no devolvía `idDiseno`, y el enlace nuevo para ver el archivo quedaba roto

- **Encontrado en:** Fase 1 (archivos reales de diseño con GridFS), en la verificación manual con
  Playwright contra un navegador real, al revisar el enlace "Ver archivo" que se agregó en la
  pantalla de Producción (`web/js/pantallas/produccion.js`).
- **Caso de prueba:** como `marcela` (Producción), abrir "Aprobaciones" → "Ver y decidir" sobre una
  propuesta real con un archivo subido de verdad, y pedir el enlace "Ver archivo".
- **Severidad:** Alta para la funcionalidad nueva (el archivo real quedaba inaccesible desde la
  pantalla, que es justo el problema que esta fase debía resolver), pero no afectaba nada de lo ya
  existente: nada usaba `idDiseno` desde esta respuesta antes de esta fase.
- **Causa confirmada:** la consulta de `detalle(idDiseno)` en `src/modulos/disenos/servicioDisenos.js`
  seleccionaba `d.id_diseno` sin alias, así que la respuesta JSON traía `id_diseno` (snake_case),
  no `idDiseno`. La función `pendientes()`, en el mismo archivo, sí usa
  `d.id_diseno AS "idDiseno"`, pero nadie había igualado `detalle()` porque hasta esta fase ningún
  código leía ese campo desde la respuesta de `detalle()`. El enlace nuevo fue el primero en
  usarlo, y por eso salió roto. Literal, visto en el navegador:
  ```
  Enlace "Ver archivo" encontrado: /api/disenos/undefined/archivos/6afcf4f77dbff5bb75711f26
  Status descarga: 400
  ```
- **Corrección:** se agregó el alias `AS "idDiseno"` a esa columna en `detalle()`.
- **Nueva ejecución:** con el fix, el mismo flujo en Playwright mostró
  `/api/disenos/8/archivos/6afcf585d3b3d88c67ec02d6`, con `Status descarga: 200`,
  `Content-Type: application/pdf` y el contenido descargado idéntico byte a byte al archivo
  subido (10 409 bytes en ambos). Se agregó además una aserción a CP-15
  (`tests/integracion/flujoTrabajo.test.js`) que exige `idDiseno` en la respuesta, para que este
  campo no vuelva a quedar sin probar.
- **Estado:** Corregido.
