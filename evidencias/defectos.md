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

## DEF-11 — El equipo reportó "Datos de entrada inválidos" al enviar una propuesta real; causa real: dos defectos distintos, no uno

- **Encontrado en:** aviso directo del equipo (prioridad absoluta), reproducido con el servidor
  real (`npm run demo`), las bases reales y un navegador real controlado con Playwright (no con
  las pruebas de Jest, que usan su propio contexto aislado).
- **Caso de prueba:** como `valentina` (Diseño), "Enviar propuesta" con un PDF real de ~4,6 MB, con
  una imagen JPG real de 500 KB cuyo nombre tiene espacios y símbolos (`#mi archivo #1.jpg`, el
  ejemplo que el propio equipo sugirió probar), y con todos los campos de especificaciones llenos.
  También se probaron: archivo vacío, archivo de más de 15 MB, `.docx`, y un `.exe` renombrado a
  `.pdf`.
- **Qué NO reprodujo el fallo** (para que quede constancia de lo que sí se probó y funcionó bien):
  un PDF real de ~4,6 MB con todos los campos llenos (201); especificaciones con frases largas,
  más de 60 caracteres por color (201); dos archivos en la misma propuesta (201); un comentario de
  casi 500 caracteres (201); un archivo vacío (rechazado con un mensaje claro y específico, no el
  genérico); un archivo de más de 15 MB (bloqueado en el navegador antes de enviarse, con el
  mensaje correcto); `.docx` (bloqueado en el navegador con "Solo se aceptan archivos PDF, PNG o
  JPG."); un `.exe` renombrado a `.pdf` (rechazado con "El contenido no corresponde al tipo
  declarado", el mensaje correcto).
- **Lo que SÍ reprodujo un fallo real, y la causa confirmada de cada uno:**
  1. **El nombre de archivo con espacios y símbolos comunes se rechazaba** (`#mi archivo #1.jpg`,
     el ejemplo exacto que sugirió el equipo), con el mensaje `Archivo "..." rechazado: Nombre de
     archivo inválido`. Causa: `src/dominio/archivosDiseno.js` usaba una lista BLANCA de
     caracteres permitidos que no incluía `#`, `&`, comas, ni varios otros símbolos comunes en
     nombres de archivo reales (fotos descargadas de WhatsApp, de una cámara, etc.).
  2. **Un cuerpo con la forma ANTERIOR a esta sesión** (campos `tamanoBytes` y `cabeceraBase64`,
     sin `contenidoBase64`) sí produce, literal, exactamente `"Datos de entrada inválidos"` — la
     frase textual que reportó el equipo. Se confirmó enviando esa forma antigua directamente
     contra el servidor real ya actualizado:
     ```
     POST /api/disenos/trabajos/KT-2026-0001
     { archivos: [{ nombre: 'viejo.pdf', tipoMime: 'application/pdf', tamanoBytes: 250000, cabeceraBase64: '...' }] }
     -> 400 { "error": "Datos de entrada inválidos", "campos": ["archivos.0.contenidoBase64", "archivos.0"] }
     ```
     La causa más probable (no se pudo confirmar con certeza absoluta, se declara así de forma
     honesta): quien hizo la prueba ya tenía la pantalla de "Enviar propuesta" abierta en el
     navegador desde ANTES de que el servidor se actualizara con los cambios de GridFS de esta
     misma sesión (commit `d56e017`). Esta aplicación es una SPA (enrutamiento por `#`, sin
     recarga de página entre pantallas): si la pestaña ya estaba abierta, el navegador sigue
     usando el JavaScript viejo en memoria (el que mandaba `cabeceraBase64`/`tamanoBytes`) aunque
     el servidor ya espere `contenidoBase64`, y eso nunca se corrige solo con cerrar sesión: hace
     falta recargar la página entera (F5 o Ctrl+F5). El código actual de
     `web/js/pantallas/diseno.js` ya manda `contenidoBase64`; no se encontró ningún lugar del
     código vigente que siga mandando la forma antigua.
- **Corrección:**
  1. Se cambió la validación del nombre de archivo (`src/dominio/archivosDiseno.js`) de lista
     blanca a lista negra: ahora solo se rechazan los caracteres de control, las barras (`/` y
     `\`, que no tienen sentido en un nombre real, no es una ruta de archivo) y `..`. Cualquier
     otro símbolo (`#`, `&`, paréntesis, comas, tildes, etc.) se acepta.
  2. Se mejoró el mensaje genérico de `src/middleware/seguridad.js` (función `validar`): cuando
     el error de Zod incluye `unrecognized_keys` (la firma exacta de un cuerpo con campos que el
     esquema actual no conoce, como pasa con una página desactualizada), el mensaje ahora agrega
     "Si la aplicación se actualizó hace poco, recarga esta página (Ctrl+F5) e inténtalo de
     nuevo." en vez de dejar solo el texto genérico sin ninguna pista. No se tradujo cada error de
     Zod a un mensaje por campo todavía: eso es trabajo de la Etapa 2 (mensajes claros en toda la
     aplicación), no de esta corrección puntual.
  3. No se agregó ningún tipo de archivo nuevo (se mantienen solo PDF, PNG, JPG), según la
     instrucción explícita de esperar la decisión del equipo antes de ampliar esa lista.
- **Nueva ejecución:** con ambas correcciones, se repitió el flujo completo en un navegador real
  contra el servidor real: subir `#mi archivo #1.jpg` como Diseño ahora responde `201` (antes,
  `400`). Enviar la forma antigua del cuerpo ahora responde con el mensaje que sugiere recargar la
  página. Pruebas automáticas nuevas: CP-55 (nombre con símbolos) y CP-56 (forma antigua avisa
  recargar), más una ampliación de CP-07 (`tests/unit/dominio.test.js`) para nombres con símbolos
  y para rutas con barras. Las 55 pruebas de la suite completa pasan en verde
  (`npm run pruebas`).
- **Estado:** Corregido (los dos defectos reales encontrados). Pendiente: no se pudo confirmar con
  el equipo, de forma 100% certera, que la causa del segundo defecto fue en efecto una pestaña
  vieja sin recargar (es la explicación más consistente con toda la evidencia, pero es una
  inferencia, no una observación directa de la pantalla de quien lo reportó). Si vuelve a pasar
  después de un refresh confirmado, hay que avisar para seguir investigando.

## Hallazgo adicional sobre DEF-11: el service worker servía archivos estáticos viejos para siempre

- Al investigar por qué una página podía quedarse con JavaScript desactualizado (DEF-11), se
  encontró una causa adicional, más fuerte que la de "una pestaña abierta": `web/sw.js` cacheaba
  los archivos estáticos con una estrategia "cache-first" (`enCache || enRed`): si un archivo ya
  estaba en la caché del service worker, se devolvía de inmediato, SIN comparar con el servidor,
  para siempre (el nombre de la caché nunca cambiaba entre versiones). Esto podía mantener
  JavaScript viejo incluso después de cerrar y volver a abrir el navegador, no solo en una pestaña
  que seguía abierta.
- **Corrección:** se cambió la estrategia a "network-first": siempre intenta la red primero y solo
  usa la caché si de verdad no hay conexión; se subió el nombre de la caché a `sst-kotoduo-v2`
  (purga la caché vieja) y se agregó `self.skipWaiting()` para que la versión nueva tome el control
  sin esperar a que se cierren las pestañas abiertas con la vieja.
- **Estado:** Corregido (`web/sw.js`).

## DEF-12 — "la misma propuesta aparecía repetida" en las bandejas de Producción y Diseño

- **Encontrado en:** aviso directo del equipo, tras confirmar DEF-11 funcionando en su propia
  máquina.
- **Hipótesis del equipo:** una consulta SQL que une con etapas sin agrupar duplicaría filas.
- **Investigación realizada** (servidor real, base real, y también código fuente):
  1. Se revisaron, una por una, TODAS las consultas de la aplicación que devuelven listas
     (`disenos.pendientes`, `trabajos.listar`, `trabajos.actividadesDeMiArea`, `panel.resumen`,
     `usuarios.listar`): ninguna une con una tabla de forma que pueda multiplicar filas. La que el
     equipo señaló como sospechosa (`disenos.pendientes`, la bandeja de Aprobaciones) ni siquiera
     une con `etapa_trabajo`: une `diseno` con `trabajo`, `tipo_trabajo` y `usuario`, las tres
     relaciones 1 a 1 por llave foránea. Las que sí unen con `etapa_trabajo` (`trabajos.listar`,
     `panel.resumen`) lo hacen con un `LEFT JOIN ... AND et.estado = 'EN_CURSO'`, y solo puede
     haber una etapa EN_CURSO por trabajo a la vez (lo impone la lógica de `completarEtapa`), así
     que tampoco pueden multiplicar filas.
  2. Se probó en vivo, contra el servidor real y la base real: `GET /api/disenos/pendientes` (11
     filas, ninguna repetida) y `GET /api/trabajos?limite=50` (sin repetidos), y con Playwright se
     confirmó que la pantalla de Aprobaciones pinta exactamente una tarjeta por fila de la API,
     incluso navegando de ida y vuelta sin recargar la página.
  3. Se agregaron pruebas automáticas nuevas que crean varias propuestas/trabajos reales,
     incluido uno que llega hasta producción con una etapa EN_CURSO (el caso exacto que el equipo
     sospechaba), y verifican que ningún `idDiseno` ni `codigo` se repita: CP-57
     (`tests/integracion/disenosPendientes.test.js`) y CP-58
     (`tests/integracion/trabajosListadoDetalle.test.js`). Las 57 pruebas de la suite completa
     pasan en verde.
- **No se logró reproducir el defecto**, ni en el código (análisis de cada consulta) ni en vivo
  (API y navegador real) ni con pruebas automáticas dirigidas al caso sospechado.
- **Explicación más probable (declarada como inferencia, no como hecho confirmado):** la base de
  demostración es compartida entre las pruebas del equipo y las pruebas de esta sesión. Durante la
  investigación de DEF-11 se crearon muchos trabajos de prueba (descripciones como "Caso de prueba
  DEF-11", "Verificación...") reutilizando archivos de prueba parecidos entre sí. Es probable que
  lo que se vio como "la misma propuesta repetida" fueran en realidad varios trabajos DISTINTOS
  pero muy parecidos entre sí (mismo tipo de archivo de prueba, descripciones similares), no filas
  duplicadas de un mismo trabajo. Esto se conecta directamente con el punto de dejar una base de
  demostración limpia (ver `scripts/db/mongo-limpiar-demo.js` y el procedimiento de limpieza).
- **Estado:** No reproducido; sin corrección de código (no se encontró nada que corregir). Quedan
  las pruebas de regresión (CP-57, CP-58) para detectarlo de inmediato si alguna vez ocurre de
  verdad. Si el equipo lo ve de nuevo en una base recién limpiada, avisar con el código exacto y
  cuántas veces se repite para seguir investigando con datos más precisos.

## DEF-13 — los botones con forma de enlace (`<a class="boton">`) se veían subrayados

- **Encontrado en:** revisión de la Parte B (listas y bandejas), al verificar que "Ver y decidir"
  no se viera como un enlace de texto.
- **Caso de prueba:** estilo computado de "Ver y decidir" (`getComputedStyle`) en un navegador
  real, contra el entorno de verificación aislado.
- **Causa confirmada:** la clase `.boton` (`web/css/componentes.css`) nunca definía
  `text-decoration`, así que un `<button>` se veía bien (los botones nunca subrayan su texto por
  defecto), pero cualquier `<a class="boton ...">` heredaba el subrayado por defecto del
  navegador para los enlaces. Esto afectaba a TODOS los botones con forma de enlace de la
  aplicación ("Ver y decidir", "Ver archivo completo", "Nueva solicitud", "Ver detalle", etc.), no
  solo a uno. Confirmado antes de corregir: `textDecorationLine: "underline"`.
- **Corrección:** se agregó `text-decoration: none` a la clase base `.boton`, una sola vez, para
  que corrija los casos ya existentes y cualquier botón-enlace nuevo que se agregue después.
- **Nueva ejecución:** mismo estilo computado, después del cambio: `textDecorationLine: "none"`.
  Captura en `evidencias/capturas/fase1_parteB_aprobaciones.png`.
- **Estado:** Corregido.

## DEF-14 — "Mis actividades" (Operario) no tiene paginación ni contador

- **Encontrado en:** Parte C, revisión de experiencia de usuario del perfil Operario (ver
  `docs/REVISION_EXPERIENCIA_USUARIO.md`).
- **Causa:** `web/js/pantallas/operario.js` pide siempre la misma página sin límite explícito, y no
  muestra ningún control de paginación, aunque `GET /api/trabajos/mis-actividades` ya admite
  `pagina`/`limite` en el servidor (mismo patrón que ya se usa en "Mis solicitudes" y, desde la
  Parte B de esta sesión, en "Aprobaciones").
- **Severidad:** Media (no se nota con pocas actividades; un operario con muchas etapas en curso a
  la vez no vería un aviso ni una forma de pedir más).
- **Corrección:** `web/js/pantallas/operario.js` ahora pide `pagina`/`limite` y muestra el mismo
  `paginador()` (Anterior/Página N/Siguiente) ya usado en "Mis solicitudes" y "Aprobaciones".
- **Nueva ejecución:** recorrido real de Operario repetido tras el cambio: la pantalla sigue
  funcionando igual (confirmación, materiales, etc.), ahora con el paginador visible al pie.
- **Estado:** Corregido.

## DEF-15 — Ningún formulario marca los campos obligatorios ("* obligatorio"), faltaban ejemplos y los errores del servidor no decían qué campo

- **Encontrado en:** Parte C, revisión de "Mi cuenta"; es el mismo patrón en todos los formularios
  de la aplicación (Nueva solicitud, Enviar propuesta, Registrar material, Cambiar contraseña,
  Crear cuenta, Bitácora), no un error de una sola pantalla.
- **Severidad:** Media.
- **Corrección, en tres partes:**
  1. **Asterisco y leyenda:** `etiquetaCampo()` (nuevo, en `web/js/ui.js`) agrega un asterisco
     visible a la etiqueta de un campo obligatorio; `leyendaObligatorios()` (nuevo, en
     `web/js/componentes.js`) agrega la leyenda "* Campo obligatorio" una vez por formulario.
     Aplicado en los 7 formularios reales de la aplicación (ingreso, nueva solicitud, enviar
     propuesta, registrar material, cambiar contraseña, crear cuenta, bitácora, y el diálogo de
     motivo de rechazo/detención). El color del asterisco (`--error-tx`) se verificó aparte: pasa
     7.5:1 o más de contraste contra los fondos del sistema.
  2. **Ejemplos:** se agregaron los placeholders que el equipo pidió explícitamente antes en esta
     sesión y que todavía no se habían aplicado: Técnica "Ej.: bordado", Medidas "Ej.: 8 x 8 cm",
     Colores "Ej.: morado, azul (separados por coma)", más Ubicación, Descripción, Nombre, Correo
     y Cantidad de material (antes sin ningún ejemplo).
  3. **Mensajes por campo:** `describirErrorApi()` (nuevo, en `web/js/ui.js`) usa el arreglo
     `campos` que el servidor ya venía devolviendo en cada error de validación (`src/middleware/seguridad.js`),
     y arma "Revisa estos campos: X, Y." en vez de mostrar solo el genérico. Aplicado en los
     formularios de creación/edición (nueva solicitud, enviar propuesta, registrar material, crear
     cuenta, cambiar contraseña). De paso se corrigió un descuido real en
     `detalleTrabajo.js`: el formulario de materiales ocultaba CUALQUIER error del servidor
     (incluido uno específico como "Material no válido") detrás de un genérico fijo; ahora sí lo
     muestra cuando el servidor lo da.
- **Nueva ejecución:** verificado con Playwright, con el entorno aislado: asteriscos y leyenda
  visibles (capturas en `evidencias/capturas/revision_def15_*.png`), placeholders presentes con el
  texto exacto pedido, y un error real de servidor (correo duplicado al crear una cuenta) mostrado
  tal cual lo da el servidor ("El correo ya está registrado"), sin pasar por el genérico. 0
  violaciones de accesibilidad en las pantallas con el cambio.
- **Lo que no se cubrió:** el diálogo de "Cambiar rol o área" (Rol/Área de un usuario ya existente)
  no se marcó como obligatorio a propósito: el Rol siempre tiene un valor (no hay estado vacío
  real que impedir) y el Área puede ser legítimamente "Sin área" según el rol, así que un asterisco
  ahí sería incorrecto, no solo innecesario.
- **Estado:** Corregido.

## DEF-16 — Contraste insuficiente del color de acento usado como texto (WCAG AA)

- **Encontrado en:** Parte C (continuación), medido con herramienta real (`@axe-core/playwright`,
  no a simple vista), en TODAS las pantallas de Vendedor revisadas.
- **Caso de prueba:** escaneo de accesibilidad con axe-core sobre "Nueva solicitud", el detalle de
  un trabajo y "Mis solicitudes", en 1280 px y 390 px.
- **Causa confirmada:** `--color-acento` (rosa-600, `#B5586B`) se usaba también como color de
  TEXTO sobre fondos claros (enlaces genéricos `a`, `.cabecera-marca`, `.boton-enlace`,
  `.etapa-destacada-nombre`). Contra los fondos claros del sistema da 4.24:1, por debajo del
  4.5:1 que exige WCAG AA para texto normal. Literal de axe-core:
  ```
  color-contrast (serious): Element has insufficient color contrast of 4.24
  (foreground #b5586b, background #faf5f1). Expected contrast ratio of 4.5:1
  ```
  Como color de FONDO (botones primarios, con texto blanco encima) nunca estuvo en duda: ese par
  de colores no lo marcó axe-core.
- **Corrección:** se agregó el token `--color-acento-texto-legible` (`web/css/tokens.css`),
  usando `rosa-700` (`#964658`), ya dentro de la paleta aprobada del proyecto — no un color
  inventado. Se cambiaron las 4 reglas de CSS que usaban `--color-acento` como color de texto
  (`a`, `.cabecera-marca`, `.boton-enlace`, `.etapa-destacada-nombre`) para usar el token nuevo.
  Los usos como fondo (`.boton-primario`, `.nav-item[aria-current="page"]`) no se tocaron.
- **Nueva ejecución:** mismo escaneo con axe-core, mismas pantallas, ambos anchos: **0
  violaciones** (antes: 1 violación "serious" por pantalla, de 3 a 4 elementos cada vez).
- **Estado:** Corregido.
- **Adicional, fuera de lo que mide axe-core (axe no revisa estados `:hover` porque no se disparan
  sin interacción):** se calculó a mano el contraste de `a:hover` (color `--color-acento-hover` =
  rosa-400, `#E8A3B2`, contra `#FAF5F1`) y daba **1.88:1**, muy por debajo de 4.5:1 — peor que el
  estado normal que motivó este defecto. Terminó corrigiéndose igual, de forma independiente, al
  resolver **DEF-18** (el mismo color de "hover" fallaba también, y peor, en los botones).

## DEF-17 — Los campos "Rol" y "Área" (crear cuenta y cambiar perfil) no tenían etiqueta accesible

- **Encontrado en:** Parte C (continuación), revisión de Administrador, medido con herramienta
  (`@axe-core/playwright`) en "Usuarios".
- **Severidad:** Alta (`critical` en axe-core): quien usa un lector de pantalla no tenía forma de
  saber para qué servía ese `<select>`.
- **Causa confirmada:** `web/js/pantallas/admin.js` armaba el campo y su `<label>` como hermanos
  (`el('label', {}, 'Rol')` junto a `el('select', {})`), sin `id` en el `<select>` ni `for` en el
  `<label>` — nada los asociaba de verdad, ni implícita ni explícitamente. Afectaba a los 4
  lugares donde se arma este campo: crear cuenta (Rol y Área) y el diálogo "Cambiar rol o área"
  (Rol y Área otra vez).
- **Corrección:** se agregó `id` a `selectRoles()`/`selectAreas()` (parámetro nuevo) y `for` a
  cada `<label>` correspondiente, en los 4 lugares.
- **Nueva ejecución:** mismo escaneo, misma pantalla: 0 violaciones (antes: 1 "critical" con 2
  elementos).
- **Estado:** Corregido.

## DEF-18 — El color de "hover" de los botones primarios bajaba el contraste del texto blanco a 2.03:1

- **Encontrado en:** Parte C (continuación), revisión de Administrador, medido con herramienta
  (`@axe-core/playwright`) en "Bitácora" (el cursor quedó sobre el botón "Buscar" justo después de
  hacerle clic, lo que dejó capturado su estado `:hover` en el escaneo — un hallazgo real, no
  buscado a propósito).
- **Severidad:** Alta (`serious` en axe-core, y afecta a cualquier persona, no solo a quien usa
  un lector de pantalla: el texto del botón casi desaparece justo al pasar el mouse por encima).
- **Causa confirmada:** `--color-acento-hover` (usado como fondo de `.boton-primario:hover`, con
  texto blanco encima) era rosa-400 (`#E8A3B2`), más CLARO que el rosa-600 del estado normal del
  botón — un "hover" que aclara en vez de oscurecer. Contraste real: 2.03:1 contra el 4.5:1
  exigido. Literal de axe-core:
  ```
  color-contrast (serious): insufficient color contrast of 2.03
  (foreground #ffffff, background #e8a3b2). Expected contrast ratio of 4.5:1
  ```
- **Corrección:** `--color-acento-hover` pasó a ser rosa-700 (ya dentro de la paleta aprobada), que
  da 6.34:1 con texto blanco — y de paso corrigió también el `a:hover` de DEF-16 (que usaba el
  mismo token; ahora usa `--color-texto`, más oscuro todavía, para que el cambio al pasar el mouse
  se note). Como rosa-700 ya era el valor de `--color-acento-presionado`, el estado "hover" y el
  estado "presionado" de un botón primario quedaron con el mismo tono (antes eran distintos); es
  una concesión visual menor para no inventar un color fuera de la paleta aprobada.
- **Nueva ejecución:** mismo escaneo, misma pantalla: 0 violaciones (antes: 1 "serious").
- **Estado:** Corregido.

## Hallazgos menores de esta ronda, anotados sin corregir (severidad baja, según el criterio acordado)

- **`empty-table-header` (axe, "minor"):** la última columna de las tablas de "Panel general" y
  "Usuarios" (`<th>` de "Acciones") no tiene texto, solo el visual. Encontrado en Producción y
  Administrador, en ambos anchos. Corrección sugerida: un texto "Acciones" visible solo para
  lectores de pantalla (clase utilitaria que no existe todavía en el proyecto).
- **Tabla "Usuarios" en 390 px:** al apilarse sin encabezados (mismo patrón ya usado en "Panel
  general"), cada celda se lee sin su etiqueta de columna. Los valores son mayormente
  autoexplicativos (nombre, correo, rol, chip de estado), salvo quizás la fecha de "Último
  acceso", que podría confundirse con otra fecha sin el rótulo. No se consideró de gravedad media
  por ahora; si el equipo lo nota confuso en su propia prueba, subir su prioridad.

## Incidente de proceso — un servidor de demostración real quedó corriendo sin cerrarse, y la "limpieza" anterior quedó incompleta

- **Encontrado en:** verificación de rutina antes/después de una prueba con el entorno aislado:
  el conteo de `bitacora_eventos` de la base real no coincidía con el de la vez anterior (122 →
  125), cuando debía ser idéntico.
- **Causa 1 (proceso, más grave de lo que se pensó al principio):** no era un solo
  `node scripts/arrancar-demo.js` sin cerrar: eran **al menos tres** instancias distintas del
  servidor real (puerto 3000), de tres momentos distintos de esta sesión (17-11 23:35, 18-11
  0:34 y 18-11 1:45), más dos scripts de verificación propios que se habían quedado colgados
  (uno esperando una descarga de PDF que nunca llegó, otro bloqueado por el límite de intentos de
  inicio de sesión de `marcela`) y dos procesos de Jest de un `npm run pruebas` del 15-11 que
  tampoco habían terminado. Cada vez que se cerraba "el" servidor visible en el puerto 3000,
  otra instancia que ya estaba esperando tomaba el puerto apenas quedaba libre — por eso el
  conteo de bitácora volvió a cambiar una segunda vez (125 → 128) después de la primera
  corrección, con el mismo patrón (solo inicios/cierres de sesión, ninguna escritura de datos).
  Corregido de verdad esta vez: se identificaron TODOS los procesos `node.exe` reales por su
  línea de comando completa (`Get-CimInstance Win32_Process`, no solo "lo que está en el puerto
  3000 ahora mismo"), se cerraron todos, y se confirmó que el conteo de la base real queda
  estable (128, sin un tercer cambio) con los puertos 3000 y 3100 y la lista de procesos `node`
  vacíos.
- **Causa 2 (más importante, datos):** al revisar la base completa para entender el conteo, se
  encontró que **todavía quedaban 8 trabajos de prueba sin borrar**: `KT-2026-0010` a
  `KT-2026-0017`, todos con la descripción `"Caso de prueba DEF-11"`, creados por los primeros
  scripts de reproducción de DEF-11 (antes de que existiera el entorno aislado), con propuestas,
  archivos reales en GridFS y eventos de bitácora propios. **`KT-2026-0010` es justamente el
  código que el equipo había identificado como el trabajo real que no había que tocar** — un error
  real: no era un trabajo del equipo, era un resto de esta misma investigación que nadie había
  identificado todavía (ni el equipo en su revisión con pgAdmin, ni esta sesión al armar la lista
  de los primeros 14).
- **Corrección propuesta, NO ejecutada:** se amplió `scripts/db/limpiar-trabajos-prueba.js` con
  estos 8 códigos nuevos (separados con un comentario de los 14 ya confirmados). Se corrió
  **solo en modo vista previa** (sin `--si`): confirma los 8, con el detalle de qué depende de
  cada uno, y no borra nada. Falta la orden explícita del equipo para ejecutar
  `npm run db:limpiar-trabajos-prueba -- --si` con la lista ampliada.
- **Estado:** Hallazgo documentado; corrección de datos pendiente de autorización explícita
  (confirmada por el equipo como "sí, procede", pero a la espera del "adelante" final en el mismo
  mensaje, según la nueva regla de proceso). El incidente de proceso (varios servidores abiertos)
  está corregido.
- **Lección para el protocolo de esta sesión:** antes de declarar una limpieza "completa", conviene
  hacer una auditoría de TODA la tabla `trabajo` (no solo de la lista de códigos que uno recuerda
  haber creado), precisamente por lo que pasó acá: una lista armada de memoria dejó ocho casos
  afuera. Además, "cerrar el servidor" no es "cerrar lo que está en el puerto en este momento":
  hay que revisar la lista completa de procesos por su línea de comando.
- **Reglas nuevas de proceso, adoptadas desde este momento (orden del equipo):** (1) al terminar
  cualquier verificación, cerrar TODOS los procesos iniciados (no solo el del puerto activo) y
  comprobar que el puerto 3000 queda libre; (2) toda prueba con navegador va solo al entorno
  aislado (`scripts/entorno-efimero.js`), nunca a `npm run demo`; (3) ninguna acción irreversible
  (borrar datos, etc.) sin una orden explícita del equipo en el mismo mensaje.
- **Resolución (con el "adelante" explícito del equipo):** se ejecutó
  `npm run db:limpiar-trabajos-prueba -- --si` con la lista ampliada (14 códigos ya borrados en la
  ronda anterior + los 8 nuevos). Resultado: los 8 nuevos (`KT-2026-0010` a `KT-2026-0017`) se
  borraron correctamente junto con todo lo que dependía de ellos; los 14 anteriores salieron como
  "no encontrados" (ya estaban borrados de la ronda previa), como se esperaba.
  - **Conteos antes → después:** `trabajo` 14 → 6; `diseno` 10 → 3; `etapa_trabajo` 8 → 2;
    `propuestas_diseno` (Mongo) 10 → 6; `bitacora_eventos` (Mongo) 128 → 108; `disenos.files`
    (Mongo) 6 → 1.
  - **Revisión de huérfanos en Mongo** (script propio, no comiteado) sobre las 4 colecciones que
    pidió el equipo: `propuestas_diseno` (¿`trabajoCodigo` sin trabajo real?), `bitacora_eventos`
    (¿`entidad.codigo` de tipo trabajo sin trabajo real?), `disenos.files` (¿archivo sin ninguna
    propuesta que lo referencie?) y `disenos.chunks` (¿chunk sin su `files_id` en `disenos.files`?):
    **0 huérfanos en las 4**, sobre los 6 trabajos reales que quedan (`KT-2026-0001` a `0006`).
  - Los 6 `trabajo` reales que quedan son exactamente los del seed original
    (`scripts/sembrar-demo.js`); los 6 `propuestas_diseno` y el único `disenos.files` restante
    (`Glosario.pdf`, 4 860 009 bytes, 19 chunks) pertenecen a esos mismos trabajos — no hay rastro
    de los 22 trabajos de prueba borrados en ninguna de las 4 colecciones.
- **Hallazgo nuevo, encontrado al revisar ese único `disenos.files` restante — contaminación
  distinta, NO ejecutada ninguna corrección todavía:** el archivo `Glosario.pdf` que quedó en
  GridFS no es basura huérfana (por eso el chequeo de huérfanos no lo marcó), pero tampoco
  pertenece al guion de la demo: es una **segunda versión real de diseño** que esta misma sesión
  envió contra `KT-2026-0003` ("Letrero luminoso fachada local centro") durante la primera
  verificación manual de GridFS (Funcionalidad 2), antes de que existiera el entorno aislado.
  - **Guion original de `sembrar-demo.js` para `KT-2026-0003`:** una sola versión de diseño
    (v1), **RECHAZADA** por Marcela con motivo "El tamaño del letrero supera el ancho permitido
    por la fachada", y el trabajo debía quedar en estado `EN_DISENO` (vuelve a diseño con el
    motivo visible), para mostrar ese caso en la bandeja.
  - **Estado real actual (verificado ahora):** el trabajo tiene una **v2** de diseño
    (`id_diseno 9`, `Glosario.pdf`, 4 860 009 bytes), en estado `PENDIENTE`, enviada el
    2026-11-18T01:46:17 (fecha/hora de esta sesión). Al enviarse esa v2, el trabajo cambió de
    `EN_DISENO` a **`PENDIENTE_APROBACION`** — ya no muestra el caso "rechazado" que el guion de
    la demo necesita; en su lugar aparece como una aprobación pendiente real, con un archivo de
    prueba (`Glosario.pdf`, 4,6 MB) que cualquiera podría aprobar o rechazar por error.
  - **Por qué no se tocó:** no estaba en la lista de 8/14 trabajos autorizada para borrar (el
    trabajo en sí es real y legítimo), y corregir esto implica una acción irreversible distinta
    (borrar la v2 del diseño, su archivo en GridFS y su propuesta en Mongo, y devolver
    `KT-2026-0003` a `EN_DISENO`) que no estaba autorizada en el mismo mensaje. Queda pendiente de
    una orden explícita del equipo.
- **Estado:** Incidente de proceso corregido y verificado de forma estable. Limpieza de los 22
  trabajos de prueba completada y verificada sin huérfanos. Contaminación nueva en `KT-2026-0003`
  **encontrada y documentada, corrección pendiente de autorización explícita**.

## DEF-19 — En "Aprobaciones", el placeholder del buscador se corta y la flecha del selector tapa el texto

- **Encontrado en:** reportado por una usuaria real, con una captura real de la pantalla.
- **Caso de prueba:** pantalla "Aprobaciones" (Producción), campos "Buscar por código o
  descripción" y "Ordenar por", en 1280 px y 390 px.
- **Causa confirmada:** `.filtros-lista .campo` tenía `min-width: 180px` y nada de `flex-grow`:
  cada campo se quedaba en ese mínimo en vez de usar el espacio disponible. El placeholder
  `Ej.: KT-2026-0005 o "poleras"` y la opción `Más urgentes primero (fecha comprometida)` no
  cabían en 180 px, así que el texto se cortaba y, en el `<select>`, el texto llegaba a tocar la
  flecha decorativa.
- **Corrección:** `.filtros-lista .campo` pasó a `flex: 1 1 240px; min-width: 0` (crece con el
  espacio disponible, en vez de quedarse en un mínimo fijo); además se acortó el texto de la
  opción a "Más urgentes primero" (la palabra "comprometida" ya estaba implícita en el nombre del
  campo "Ordenar por" y en el resto de la pantalla).
- **Nueva ejecución:** capturas reales antes/después en `evidencias/capturas/`
  (`revision_visual_aprobaciones_filtros_*.png`): el placeholder completo y la opción completa se
  ven enteros, sin que la flecha tape ninguna letra, en 1280 px y 390 px.
- **Estado:** Corregido.

## DEF-20 — El paginador (Anterior/Página N/Siguiente) no tenía espacio real entre sus partes

- **Encontrado en:** barrido visual sistemático pedido por el equipo tras DEF-19, revisando TODAS
  las pantallas de los 5 perfiles en 1280 px y 390 px.
- **Causa confirmada:** `web/js/componentes.js` arma el paginador con `el('div', ...)` uniendo el
  botón "Anterior", un `<span>` con el texto "Página N" y el botón "Siguiente" directamente por
  DOM (`appendChild`), sin ningún nodo de texto en blanco entre ellos (a diferencia de escribir
  HTML a mano, donde un espacio en el código fuente sí deja un espacio real). La clase `.paginador`
  nunca tuvo una regla de CSS propia, así que no había ningún `gap` que separara las tres partes:
  quedaban pegadas.
- **Corrección:** se agregó la regla `.paginador { display: flex; align-items: center; gap: ...; }`.
- **Nueva ejecución:** captura real antes/después (`evidencias/capturas/revision_visual_paginador.png`):
  las tres partes quedan separadas con un espacio parejo.
- **Estado:** Corregido.
- **Nota para el barrido:** se revisaron visualmente las capturas de las 32 combinaciones de
  pantalla × ancho (5 perfiles) buscando el mismo patrón (texto cortado, solapado, ícono sobre
  texto, elementos fuera de su caja) y no se encontró ningún otro caso real. Se descartaron
  explícitamente dos falsas alarmas, verificadas antes de descartarlas, no solo asumidas: (1) la
  barra de navegación inferior, fija (`position: fixed`), parece "superponerse" a una tarjeta a
  mitad de pantalla en una captura de página completa — es un artefacto de cómo Playwright arma
  una captura de toda la página con un elemento fijo, no algo que vea una persona real
  desplazándose; (2) los botones "Aprobar"/"Rechazar" parecían quedar tapados por esa misma barra
  al usar `scrollIntoViewIfNeeded()` — al desplazarse hasta el final real de la página (como lo
  haría una persona), sí quedan completamente libres de la barra, gracias al
  `padding-bottom: 72px` que ya tenía `main#app`.
