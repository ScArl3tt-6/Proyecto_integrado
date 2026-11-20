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
- **Revisión del equipo, 18-11-2026:** no todo el mundo conoce la convención del asterisco para
  "obligatorio". Se revirtió el punto 1 de esta corrección: `etiquetaCampo()` ya no agrega ningún
  asterisco ni `leyendaObligatorios()` (se eliminó esa función); ahora solo se marca lo **opcional**
  con la palabra "(opcional)" junto al nombre del campo, y un campo obligatorio vacío muestra un
  mensaje junto al campo mismo (ver DEF-21) en vez de depender de un símbolo. Los puntos 2 y 3
  (ejemplos y mensajes de error por campo del servidor) siguen vigentes, no cambiaron.

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

## DEF-21 — Un título de sección quedaba pegado al botón o la lista de la sección anterior, y pares de botones contiguos sin espacio entre ellos

- **Encontrado en:** barrido visual a 390 px de "Mi cuenta" pedido por el equipo, al revisar la
  sección nueva de verificación en dos pasos (Funcionalidad 5). No es exclusivo de esa pantalla:
  el mismo patrón aparece en "Usuarios" ("Crear cuenta" → "Cuentas"), "Detalle de trabajo"
  ("Etapas", "Versiones de diseño", "Materiales") y las bandejas con varias listas seguidas.
- **Por qué el barrido de DEF-20 no lo encontró antes:** ese barrido se hizo antes de que existiera
  la sección de MFA (Funcionalidad 5, de esta misma sesión); el patrón ya existía en el código
  (`h1, h2, h3` nunca tuvieron margen superior, solo inferior) pero no se había notado porque
  ninguna de las 32 capturas de entonces tenía dos secciones con tan poca distancia entre un botón
  y el título de la siguiente como la que agregó "Mi cuenta" ahora.
- **Causa confirmada (verificada con medición real, no solo visual):** `h1, h2, h3` solo tienen
  margen inferior (`margin: 0 0 var(--espacio-2)`), nunca superior; y en `cuenta.js`, los pares de
  botones "Confirmar y activar"/"Cancelar" y "Sí, desactivar"/"Cancelar" se agregaban sueltos al
  contenedor (dos `appendChild` separados) sin ningún `display:flex` ni `gap` entre ellos — el
  mismo patrón de fondo que DEF-20 (el `el()` de este proyecto nunca deja espacio en blanco entre
  elementos). Medido con `getBoundingClientRect()` en el navegador real: 0 px de separación en
  ambos casos antes de la corrección.
- **Nota sobre una falsa alarma propia, verificada antes de descartarla:** una primera captura de
  página completa (`fullPage: true`) parecía mostrar el botón "Confirmar y activar" tapado por la
  barra de navegación inferior fija — es el mismo artefacto de captura ya documentado en DEF-20
  (no algo que vea una persona real). Verificado con `getBoundingClientRect()` tras bajar de
  verdad hasta el final de la página: no hay superposición real (el botón queda 130 px por encima
  de la barra).
- **Corrección:**
  1. Regla general `* + h2, * + h3 { margin-top: var(--espacio-4); }` en `base.css` (con el
     selector de hermano adyacente, para que un título que SÍ es el primer elemento de su
     contenedor — por ejemplo, el de un diálogo — no reciba un espacio de más).
  2. `.seccion-cuenta h2 { margin-top: var(--espacio-4); }` en `pantallas.css`, para el único caso
     que la regla general no alcanza (el título de "Verificación en dos pasos" queda anidado
     dentro de su propio contenedor, sin un hermano directo).
  3. Los dos pares de botones de `cuenta.js` ahora se envuelven en `.acciones-decision` (clase que
     ya existía, reutilizada, con `display:flex; gap:8px`).
- **Nueva ejecución:** verificado con capturas reales en 1280 px y 390 px en "Mi cuenta", "Usuarios",
  "Detalle de trabajo" y "Bandeja de diseño": los títulos de sección y los pares de botones quedan
  con una separación clara en las cuatro pantallas, sin espacios excesivos en los diálogos (que no
  cambiaron, como se esperaba).
- **Lo que no se verificó:** no se revisaron las 32 combinaciones completas de pantalla × ancho de
  los 5 perfiles una por una tras este cambio (sí se revisaron 7: Mi cuenta ×2 anchos, Usuarios ×2,
  Detalle de trabajo ×2, Bandeja de diseño). Dado que la regla es general (no por pantalla), es
  razonable esperar que el resto se beneficie igual, pero esto queda dicho explícitamente como no
  comprobado pantalla por pantalla.
- **Estado:** Corregido en los casos verificados.

## DEF-22 — Cualquier operario del área podía completar una etapa que no había tomado, sin que nadie supiera quién la estaba trabajando

- **Encontrado en:** revisión del equipo con captura real ("Mis actividades" idéntica para todo
  operario del área, punto 3 de la revisión del 18-11-2026, `CORRECCIONES_SSTKOTO.docx`).
- **Severidad:** Alta (lógica de negocio: dos operarios podían reportar haber hecho el mismo
  trabajo, o uno completar el trabajo de otro sin haberlo tocado).
- **Causa confirmada:** `completarEtapa()` solo comprobaba que la etapa estuviera `EN_CURSO` y en
  el área del operario; `id_responsable` se escribía recién AL completar, nunca antes, así que no
  había forma de distinguir "nadie la ha tomado" de "la está trabajando otra persona".
- **Corrección:** nuevo endpoint `POST /trabajos/:codigo/etapas/:orden/comenzar`, que reclama la
  etapa de forma atómica (`UPDATE ... WHERE id_responsable IS NULL`, así que con dos solicitudes
  concurrentes PostgreSQL solo deja pasar una); `completarEtapa()` ahora exige que
  `id_responsable` sea quien la completa (salvo Producción, que supervisa todas las áreas y puede
  completar cualquiera, la haya tomado alguien o no). "Mis actividades" muestra "Comenzar etapa"
  (nadie la tomó), "Completar etapa" (la tomé yo) o "En curso por &lt;nombre&gt;" (la tomó otra
  persona), según corresponda.
- **Nueva ejecución:** CP-74 fuerza una concurrencia real (`Promise.all` con dos operarios de la
  misma área pidiendo la misma etapa al mismo tiempo, no simulada): exactamente uno de los dos
  recibe 200 y el otro 409, verificado 3 veces seguidas sin fallar. CP-75 confirma que Producción
  completa sin haberla tomado, y que un operario recién creado no puede completar la etapa de
  otro. CP-12 se actualizó para tomar cada etapa antes de completarla.
- **Efecto secundario encontrado y corregido:** `scripts/sembrar-demo.js` y
  `scripts/entorno-efimero.js` completaban las etapas del trabajo de demostración "Terminado" sin
  tomarlas primero; dejaron de funcionar hasta agregarles el mismo paso de "comenzar". Se encontró
  verificando en vivo, no se asumió que los scripts seguirían funcionando solo porque las pruebas
  de Jest pasaban.
- **Estado:** Corregido.

## DEF-23 — Las especificaciones de una propuesta de diseño mostraban las claves internas en crudo ("tecnica", "ubicacion")

- **Encontrado en:** revisión del equipo con captura real (punto 8 de la revisión del 18-11-2026).
- **Severidad:** Media (no es un error de datos, pero confunde a quien usa la pantalla).
- **Causa confirmada:** `produccion.js` armaba cada línea con `` `${clave}: ${valor}` `` directo
  sobre las claves del objeto `especificaciones` (`tecnica`, `ubicacion`, `medidas`, `colores`),
  sin traducirlas.
- **Corrección:** `TEXTO_ESPECIFICACION` (nuevo, en `componentes.js`) traduce cada clave a
  "Técnica", "Ubicación", etc.; se revisó el resto de la aplicación en busca del mismo patrón
  (`Object.entries`/`Object.keys` renderizado directo) y no se encontró ningún otro caso.
- **Nueva ejecución:** verificado con un recorrido real completo (Diseño envía una propuesta real
  con los cuatro campos desde el formulario, Producción la revisa): "Técnica: Bordado",
  "Ubicación: Pecho izquierdo", "Medidas: 8 x 8 cm", "Colores: morado, azul".
- **Estado:** Corregido.

## DEF-24 — Un servidor desactualizado podía responder sin que la pantalla lo notara

- **Encontrado en:** confirmación del equipo (19-11-2026) sobre PM-15: "Comenzar etapa" parecía no
  funcionar entre dos cuentas reales; la causa real era un servidor viejo, levantado antes de la
  corrección de DEF-22, que seguía respondiendo mientras se probaba.
- **Severidad:** Media (no es un error de lógica de negocio, pero genera diagnósticos equivocados:
  se puede creer que una corrección no funciona cuando en realidad no se aplicó porque el proceso
  no se reinició).
- **Causa confirmada:** ninguna respuesta de la API llevaba ninguna marca de versión; no había
  forma de que el navegador supiera que el código del servidor había cambiado (o no) desde que
  cargó la página.
- **Corrección:** `src/version.js` calcula una vez, al arrancar, un identificador de versión (el
  commit corto de git; si no hay git disponible, al menos cambia en cada arranque del proceso).
  Toda respuesta de `/api` lleva la cabecera `X-SST-Version` (`src/app.js`). El cliente
  (`web/js/api.js`) recuerda la primera versión que ve y, si una respuesta posterior trae una
  distinta, avisa una sola vez con un evento (`sst:version-nueva`); `web/js/router.js` muestra un
  aviso persistente y amable ("Hay una versión nueva. Recarga la página.") con un botón "Recargar",
  sin interrumpir lo que la persona esté haciendo.
- **Nueva ejecución:** CP-79 (`tests/integracion/sitioEstatico.test.js`) confirma que toda respuesta
  lleva la cabecera con el mismo valor mientras el proceso no se reinicia. Verificado además con un
  navegador real contra el entorno aislado: el aviso aparece cuando una respuesta trae una versión
  distinta (simulado interceptando una respuesta con Playwright), la pantalla sigue funcionando con
  normalidad mientras tanto, y "Recargar" refresca la página.
- **Estado:** Corregido.

## DEF-25 — Una etapa tomada y abandonada quedaba trabada para siempre (no se podía liberar)

- **Encontrado en:** punto B1 de la revisión del equipo (19-11-2026).
- **Severidad:** Media (no corrompe datos, pero bloquea el trabajo real hasta una intervención
  manual en la base).
- **Causa confirmada:** "Comenzar etapa" (DEF-22) no tenía contraparte: una vez tomada, solo esa
  persona (o Producción) podía completarla; si la abandonaba, nadie podía liberarla desde la
  pantalla.
- **Corrección:** nuevo endpoint `POST /trabajos/:codigo/etapas/:orden/liberar` y permiso
  `ETAPA_LIBERAR` (quien la tomó, Producción o Administración); deja `id_responsable` en `NULL` de
  nuevo y registra `ETAPA_LIBERADA` en la bitácora con el id de quien la tenía antes. Ver
  `docs/CAMBIOS_RESPECTO_AL_DISENO.md` (incluye la limitación deliberada de un solo responsable por
  etapa y por qué no se implementó la asignación explícita por Producción).
- **Nueva ejecución:** CP-81, CP-82, CP-83 (`tests/integracion/comenzarEtapa.test.js`): no se puede
  liberar una etapa sin tomar, un operario ajeno no puede liberar la de otro (403), quien la tomó
  (o Producción) sí puede (200), y queda disponible de nuevo para cualquiera.
- **Estado:** Corregido.

## DEF-26 — Quién tiene tomada una etapa aparecía como texto chico bajo el botón, no como algo destacado

- **Encontrado en:** punto B3 de la revisión del equipo (19-11-2026).
- **Severidad:** Baja (información presente, pero fácil de pasar por alto).
- **Causa confirmada:** tanto en "Mis actividades" como en el detalle de un trabajo, el nombre de
  quien tenía la etapa se mostraba con la misma clase `campo-ayuda` que cualquier texto secundario
  (tamaño de letra chico, sin color de énfasis), separado del título de la etapa.
- **Corrección:** `chipResponsable()` (nuevo, en `web/js/componentes.js`): una etiqueta con ícono,
  del mismo tamaño que el chip de estado, ubicada junto al título de la etapa (no debajo, aparte).
  Se usa en `listaEtapas()` (detalle de un trabajo) y en "Mis actividades" (operario).
- **Nueva ejecución:** verificado visualmente con el entorno aislado y un navegador real, a 1280 y
  390px.
- **Estado:** Corregido.

## DEF-27 — La bitácora podía mostrar "Alguien" en vez de un texto honesto, y no había saludo personalizado

- **Encontrado en:** punto C de la revisión del equipo (19-11-2026): la demostración real mostraba
  "Alguien · Vendedor" en vez de un nombre.
- **Severidad:** Baja (no es un error de datos: el nombre de verdad no se puede recuperar si la
  cuenta original ya no existe; el problema era el texto que se mostraba en ese caso).
- **Causa confirmada:** eventos de la bitácora sembrados antes de un reseed de PostgreSQL apuntan a
  un `usuario.id` que ya no existe en la base actual (la tabla se recreó con ids nuevos); el
  servidor ya resolvía esto devolviendo `nombre: null` (comportamiento correcto), pero la pantalla
  (`web/js/pantallas/admin.js`) mostraba el texto genérico "Alguien" en ese caso.
- **Corrección:** la pantalla ahora muestra "Datos de demostración" cuando hay un rol pero no se
  pudo resolver el nombre, y "Sistema" cuando el evento no tiene ningún usuario asociado; nunca
  "Alguien". De paso, se agregó un saludo personalizado ("Hola, &lt;nombre&gt;") en el encabezado y
  en "Mi cuenta" (con rol, área y correo): `/auth/sesion` ahora entrega `nombre`, `correo` y `area`
  (antes solo entregaba el rol y el id de área).
- **Nueva ejecución:** CP-78 (`/auth/sesion` entrega nombre/correo/área) y CP-80 (un evento con
  `usuario.id` inexistente llega con `nombre: null`, no con un nombre inventado), ambos en
  `tests/integracion/flujoTrabajo.test.js`. Verificado además con un navegador real: el encabezado
  y "Mi cuenta" muestran el saludo, el rol, el área y el correo, sin desborde a 390px.
- **Estado:** Corregido.

## DEF-28 — El botón "Liberar etapa" no aparecía para Producción en el detalle de un trabajo

- **Encontrado en:** verificación propia (no reportado por el equipo) del punto B1, con navegador
  real contra el entorno aislado, al revisar el detalle de un trabajo como `marcela` (Producción).
- **Severidad:** Alta (la corrección de DEF-25 quedaba invisible para Producción y Administración
  en esa pantalla, aunque el endpoint funcionaba bien al llamarlo directo).
- **Causa confirmada:** `web/js/permisos.js` es un espejo, en el cliente, de la matriz de permisos
  del servidor (`src/dominio/permisos.js`) — existe solo para decidir qué mostrar, el servidor
  sigue siendo quien autoriza de verdad. Al agregar el permiso `ETAPA_LIBERAR` en el servidor (y en
  `ETAPA_AVANZAR` ya existente para Producción) no se actualizó también este espejo, así que
  `tienePermiso('PRODUCCION', 'ETAPA_LIBERAR')` devolvía `false` en el navegador y el botón nunca
  se agregaba al DOM, aunque la llamada a la API sí habría funcionado.
- **Riesgo de fondo:** esta duplicación (dos listas de permisos que deben mantenerse manualmente
  sincronizadas, una en el servidor y otra en el cliente) es frágil por diseño: cualquier permiso
  nuevo puede repetir este mismo error. Se deja como limitación conocida, no se rediseña ahora (sacar
  el espejo del cliente y consultar siempre al servidor cambiaría cómo se arma el menú y las rutas
  internas en toda la aplicación, más allá de lo que pidió este punto).
- **Corrección:** se sincronizó `web/js/permisos.js` con `src/dominio/permisos.js` (agregado
  `ETAPA_LIBERAR` a Administración, Producción y Operario; `ETAPA_AVANZAR` a Producción).
- **Nueva ejecución:** verificado con un navegador real: el botón "Liberar [etapa]" aparece para
  Producción en el detalle de un trabajo con una etapa tomada, y liberarla la deja disponible de
  nuevo para cualquiera.
- **Estado:** Corregido.

## DEF-29 — El detalle de un trabajo no tenía un historial humano de lo que pasó, cuándo y quién lo hizo

- **Encontrado en:** punto 2 de la revisión del equipo (19-11-2026).
- **Severidad:** Media (la bitácora completa ya existía, pero solo Administración podía verla; para
  el resto de los roles, el detalle de un trabajo no contaba su propia historia).
- **Causa confirmada:** `GET /trabajos/:codigo` nunca incluyó eventos de bitácora, y
  `GET /auditoria/trabajos/:codigo` (el que sí los trae) exige el permiso `AUDITORIA_VER`, que solo
  tiene Administración.
- **Corrección:** nuevo endpoint `GET /trabajos/:codigo/historial`, con el mismo alcance que ya
  decide quién puede ver el detalle de ese trabajo (`verificarAlcance`: Vendedor el propio, Diseño
  mientras le corresponde, Producción/Administración todos); a Operario (que no tiene ruta al
  detalle general, ver CP-37) se le permite esta ruta en particular, acotada a trabajos de su área y
  sin los eventos de diseño, que no son de su incumbencia. El detalle ahora muestra, en lenguaje
  claro, la etapa actual y la siguiente (o que el trabajo terminó, o que aún no entra a producción).
  De paso, un trabajo ya en producción sin materiales registrados ahora se destaca con un aviso, no
  un texto plano más entre la lista.
- **Límite existente, no modificado (a confirmar si se quiere cambiar):** Diseño pierde acceso al
  detalle (y por lo tanto a este historial) apenas envía su propuesta, porque el trabajo pasa a
  `PENDIENTE_APROBACION` y `verificarAlcance` solo permite `SOLICITADO`/`EN_DISENO` para ese rol; es
  el comportamiento que ya tenía la pantalla (la "Bandeja de diseño" tampoco mostraba nunca trabajos
  en ese estado) y no es algo que este punto haya pedido cambiar, pero significa que Diseño no puede
  ver si su propuesta fue aprobada o rechazada después de enviarla, salvo que vuelva a aparecer en su
  bandeja por un rechazo. Se deja anotado para decidir si vale la pena ampliarlo.
- **Nueva ejecución:** CP-84 (`tests/integracion/trabajosListadoDetalle.test.js`): el alcance por
  rol se respeta, y a Operario le llega acotado a su área y sin eventos de diseño. Verificado con
  navegador real en los 4 roles con acceso (Vendedor, Diseño, Producción, Operario).
- **Actualización (20-11-2026):** la limitación anotada arriba quedó confirmada como un problema
  real (punto 2 de la revisión del equipo) y se amplió el alcance de Diseño a
  `PENDIENTE_APROBACION` — ver DEF-42, que registra el arreglo completo (alcance + bandeja).
- **Estado:** Corregido.

## DEF-30 — Aprobar o rechazar una propuesta no decía a quién, con qué consecuencia, ni dejaba ninguna confirmación visible

- **Encontrado en:** punto 4 de la revisión del equipo (19-11-2026).
- **Severidad:** Media (la decisión se guardaba bien; lo que faltaba era que la pantalla explicara
  sus consecuencias antes de confirmar, y qué pasó después de confirmar).
- **Causa confirmada:** "Decidir propuesta" no mostraba quién creó la solicitud ni quién envió esa
  versión; el diálogo de "Aprobar" no decía qué etapa seguía ni en qué área; "Rechazar" pedía el
  motivo pero no decía a quién se rechazaba ni a qué estado volvía el trabajo; y tras confirmar
  cualquiera de las dos, la pantalla volvía en silencio a la lista de aprobaciones, sin ningún
  resumen de lo que acababa de pasar.
- **Corrección:** la pantalla ahora muestra "Solicitó: &lt;vendedor&gt; (Vendedor) · Propuesta
  enviada por: &lt;diseñador&gt; (Diseño)"; el diálogo de aprobar dice la etapa y el área que
  siguen; el de rechazar (tras el motivo) dice a quién se rechaza, a qué estado vuelve el trabajo y
  quién puede retomarlo. `GET /disenos/:idDiseno` ahora incluye `vendedor`, `disenador`,
  `primera_etapa` y `primera_etapa_area`. Al confirmar cualquiera de las dos decisiones, la pantalla
  ya no vuelve a la lista: va al detalle del trabajo, que (gracias al historial del punto 2) muestra
  de inmediato la decisión registrada y la etapa actual en lenguaje claro — la confirmación visible
  que faltaba, reutilizando lo que ya existía en vez de agregar un mensaje de éxito aparte.
- **Nueva ejecución:** CP-85 (`tests/integracion/disenosPendientes.test.js`). Verificado con
  navegador real: aprobar y rechazar una propuesta real, revisando el texto exacto de ambos
  diálogos y el detalle del trabajo después de cada una.
- **Estado:** Corregido.

## DEF-31 — Vendedor y Diseño no tenían ninguna forma de enterarse de qué pasó con sus solicitudes, salvo entrar a revisarlas una por una

- **Encontrado en:** punto 5 de la revisión del equipo (19-11-2026).
- **Severidad:** Media (ningún dato se perdía; pero Diseño, en particular, no tenía NINGUNA forma de
  saber si su propuesta fue aprobada o rechazada, porque pierde acceso al detalle del trabajo apenas
  la envía — ver DEF-29 — y "Bandeja de diseño" tampoco muestra un trabajo ya aprobado).
- **Corrección:** pantalla nueva "Novedades" (`#/novedades`, permiso `NOVEDADES_VER`, solo Vendedor y
  Diseño), con un enlace en el menú que muestra un contador cuando hay novedades sin ver. Reutiliza
  eventos que ya existía en la bitácora (nada de correo ni servicios nuevos): para Vendedor, cuando
  una de sus solicitudes se aprueba, se rechaza, completa una etapa o termina; para Diseño, cuando
  una propuesta QUE ÉL envió se aprueba o se rechaza, y cuando el trabajo que diseñó termina. Se
  agregó `usuario.novedades_vistas_en` (migración `scripts/db/agregar-novedades-vistas.js`,
  idempotente, igual que las anteriores) para saber qué es nuevo desde la última visita sin tocar la
  bitácora (que sigue siendo solo de inserción). De paso, `ETAPA_COMPLETADA` ahora guarda
  `trabajoTerminado` en su detalle, para poder avisar "el trabajo terminó" sin inventar un tipo de
  evento nuevo.
- **Nueva ejecución:** CP-86 a CP-89 (`tests/integracion/novedades.test.js`): sin permiso para
  Producción/Operario; Vendedor y Diseño ven la aprobación como novedad con contador correcto;
  marcar como vistas no afecta a otra persona; se avisa cuando el trabajo termina (incluso a Diseño,
  que ya no puede ver el detalle); Diseño no ve novedades de propuestas ajenas. Verificado con
  navegador real: el contador aparece en el menú, la lista muestra la novedad, y al visitar la
  pantalla el contador baja a 0 en la siguiente navegación.
- **Estado:** Corregido.

## DEF-32 — La vista previa de un PDF/imagen de una propuesta quedaba bloqueada (ícono de contenido bloqueado)

- **Encontrado en:** punto 6 de la revisión del equipo (19-11-2026), captura 5 del documento.
- **Severidad:** Media (el archivo seguía pudiéndose abrir completo con "Ver archivo completo"; lo
  que fallaba era solo la vista previa incrustada en la misma pantalla de decidir).
- **Causa confirmada:** `src/app.js` aplica `helmet()` a TODA la aplicación con
  `frameAncestors: ["'none'"]` en la CSP, pensado para las páginas HTML (que nunca deben
  enmarcarse en ningún sitio, ni siquiera el propio, para evitar "clickjacking"). Ese mismo
  encabezado se aplicaba también a `GET /disenos/:idDiseno/archivos/:idArchivo`, que es exactamente
  el archivo que `produccion.js` muestra dentro de un `<iframe>` en la misma pantalla: el propio
  navegador bloqueaba la vista previa por la misma regla que protege el resto del sitio.
- **Corrección:** esa única ruta ahora sobrescribe el encabezado con `Content-Security-Policy:
  frame-ancestors 'self'` y `X-Frame-Options: SAMEORIGIN` (en vez de heredar `'none'`/`DENY`):
  permite enmarcarlo desde el propio sitio únicamente, nunca desde cualquier otro. Un PDF o una
  imagen no son navegables ni ejecutan código: no hay riesgo real de "clickjacking" al enmarcarlos
  desde la propia aplicación.
- **Nueva ejecución:** se extendió CP-52 (`tests/integracion/archivosDiseno.test.js`) para
  comprobar los dos encabezados en la respuesta real. Verificado además contra el servidor real
  (una llamada HTTP directa desde el propio navegador a la URL que carga el `<iframe>`): antes de
  la corrección la respuesta traía `frame-ancestors 'none'`; después, `frame-ancestors 'self'` y
  `X-Frame-Options: SAMEORIGIN`.
- **Limitación de esta verificación, dicho con honestidad:** no logré capturar una comparación
  visual "antes bloqueado / después se ve" con una captura de pantalla: el Chromium sin interfaz
  (headless) que usa Playwright no renderiza el PDF dentro del `<iframe>` de ninguna de las dos
  formas en esta automatización (la pantalla se ve igual de vacía con el encabezado roto que con el
  corregido, y los eventos de red también son idénticos en ambos casos — es una limitación conocida
  de automatizar Chromium sin interfaz para este caso puntual, no algo que dependa de la corrección).
  La evidencia que sí es concluyente es el encabezado HTTP en sí: es la regla exacta, documentada en
  el estándar CSP, que hace que un navegador de verdad (con interfaz) muestre el ícono de "contenido
  bloqueado" cuando dice `'none'`, y lo deje de mostrar cuando dice `'self'` con el mismo origen.
  Queda pendiente que alguien del equipo confirme visualmente con un navegador normal (no headless),
  aunque la causa y la corrección están verificadas con certeza a nivel de protocolo.
- **Estado:** Corregido (verificado a nivel de protocolo HTTP; confirmación visual humana pendiente).

## DEF-33 — Administración fijaba (y por lo tanto conocía) la contraseña inicial de cada cuenta nueva

- **Encontrado en:** punto 7 de la revisión del equipo (19-11-2026).
- **Severidad:** Alta (una persona de Administración podía, en teoría, ingresar con la contraseña
  de cualquier cuenta recién creada hasta que la propia persona la cambiara; además, entregar esa
  contraseña "en mano" es un canal informal y no deja ningún registro de cuándo se compartió).
- **Causa confirmada:** el formulario "Crear cuenta" pedía una contraseña inicial que Administración
  escribía directamente, y el servidor la guardaba tal cual (validada contra la política, pero
  elegida por un tercero).
- **Corrección:** el formulario ya no pide ninguna contraseña. `POST /api/usuarios` ya no acepta ese
  campo (se rechaza con 400 si llega); el servidor genera una contraseña aleatoria que nadie ve ni
  necesita conocer, y entrega de inmediato un enlace de primer acceso — el mismo mecanismo que ya
  existía para restablecer una contraseña (Funcionalidad 4): un token de un solo uso, con
  vencimiento, que lleva a "Crear una contraseña nueva" sin sesión. La pantalla de "Usuarios"
  muestra ese enlace en un diálogo con "Copiar enlace", igual que el botón "Generar enlace" que ya
  existía para cuentas existentes (ambos casos ahora comparten el mismo diálogo).
- **De paso, URL base configurable:** el enlace completo ahora lo arma el SERVIDOR con su propia
  URL base (`SST_URL_BASE`, nueva variable de entorno; por defecto `http://localhost:<puerto>`), no
  el navegador de Administración con `location.origin` — así el enlace sirve de verdad para quien
  lo recibe aunque Administración esté mirando la pantalla desde una URL distinta a la pública
  (por ejemplo, localhost en desarrollo). Ver `.env.example`.
- **Compatibilidad interna:** `usuarios.crear()` sigue aceptando una contraseña conocida como
  parámetro interno opcional, solo para `scripts/sembrar-demo.js` y la suite de pruebas
  (`tests/contexto.js`), que necesitan contraseñas deterministas para iniciar sesión sin pasar por
  un enlace; la ruta HTTP real que usa Administración nunca envía ese campo, así que en los hechos
  nunca se ejerce desde la aplicación.
- **Nueva ejecución:** CP-73 (reescrita) y CP-90 (`tests/integracion/usuariosListado.test.js`):
  la ruta rechaza un cuerpo con "contrasena", crear una cuenta entrega un enlace de primer acceso
  que de verdad sirve para crear la contraseña y luego ingresar, y el enlace usa la URL base
  configurada, no un valor fijo. Verificado de punta a punta con un navegador real contra el
  entorno aislado (`scripts/entorno-efimero.js`, al que también se le agregó pasar su propio
  `urlBase` para que sus enlaces apunten al puerto 3100 en el que de verdad corre, no al 3000 por
  defecto).
- **Estado:** Corregido.

## DEF-34 — "Mis solicitudes" (Vendedor) era una lista plana: sin línea de tiempo, sin motivo de atraso, sin etapa actual/siguiente

- **Encontrado en:** punto 9 de la revisión del equipo (19-11-2026).
- **Severidad:** Baja (la información existía en el detalle de cada trabajo, punto 2; faltaba en el
  listado mismo, que es lo primero que ve el Vendedor).
- **Causa confirmada:** `GET /trabajos` (usado por "Mis solicitudes") solo traía el nombre de la
  etapa vigente como texto plano (`etapa_actual`), sin la etapa siguiente, sin el resto de la línea
  de tiempo, y el chip "Atrasado" no decía desde cuándo.
- **Corrección:** `GET /trabajos?conEtapas=true` (nuevo parámetro opcional, solo lo usa "Mis
  solicitudes") agrega la línea de tiempo completa de cada trabajo, con el mismo formato que ya
  devuelve el detalle (reutiliza `listaEtapas()` tal cual, sin pantalla nueva ni componente nuevo).
  La tarjeta de cada solicitud ahora muestra, en lenguaje claro, la etapa actual y la siguiente (o
  que el trabajo terminó, o que aún no entra a producción — reutiliza `textoEtapaActualSiguiente()`
  del punto 2) y, si está atrasada, "Debía estar listo el &lt;fecha&gt; y todavía no termina.".
  "Novedades" (punto 5) ya cubre el aviso de cambios; no se duplicó esa lista dentro de "Mis
  solicitudes" para no repetir la misma información dos veces.
- **Nueva ejecución:** CP-91 (`tests/integracion/trabajosListadoDetalle.test.js`): por defecto
  "etapas" no viene; con `conEtapas=true` trae la línea de tiempo completa, con el mismo contenido
  que el detalle. Verificado con navegador real a 1280 y 390px: línea de tiempo, motivo de atraso y
  etapa actual/siguiente visibles en cada tarjeta, sin scroll horizontal en celular.
- **Estado:** Corregido.

## DEF-35 — La tabla de Usuarios tenía hasta 4 botones del mismo peso por fila (uno destructivo), y las tarjetas de celular no decían qué era cada dato

- **Encontrado en:** punto 10 de la revisión del equipo (19-11-2026).
- **Severidad:** Baja (nada fallaba; la fila se veía desordenada y el botón "Desactivar" tenía la
  misma prominencia que acciones rutinarias, con el riesgo de un clic equivocado).
- **Causa confirmada:** la celda de acciones apilaba "Cambiar rol o área", "Generar enlace",
  "Desactivar 2FA" y "Desactivar/Activar" (hasta 4 botones) uno tras otro, todos con el mismo
  estilo; en celular, al ocultar el encabezado de la tabla, cada tarjeta mostraba los valores en
  crudo, sin decir a qué columna correspondía cada uno.
- **Corrección:** una sola acción principal visible ("Cambiar rol o área", la más habitual) más un
  botón "⋯" que abre un menú con el resto (`menuAcciones()`, nuevo en `ui.js`); construido sobre
  `<details>/<summary>` nativo (adelanta el punto 11, "controles nativos"): abrir con clic, Enter o
  Espacio ya lo trae nativo, pero Escape para cerrar y las flechas para moverse entre las opciones
  SÍ hubo que agregarlos a mano (a diferencia de `<dialog>`, `<details>` no los trae) — se
  verificó primero sin ese agregado y, en efecto, no funcionaban, así que quedaron documentados
  recién después de confirmarlos de verdad, no por supuesto. En celular, cada celda de la tabla
  (`.tabla-simple`, compartida con el Panel general) ahora trae un atributo `data-label` que una
  regla CSS muestra como etiqueta chica antes del valor, solo en ese ancho.
- **Nueva ejecución:** verificado con navegador real: cada fila queda con exactamente 2 botones
  alineados (antes, hasta 4, con alturas de fila desparejas); el menú abre con clic o con teclado
  (Enter/Espacio), Tab y las flechas mueven el foco entre las opciones, Escape cierra y devuelve el
  foco al botón "⋯", y un clic afuera también cierra; en celular (390px) cada tarjeta muestra la
  etiqueta de cada dato, sin scroll horizontal.
- **Estado:** Corregido.

## DEF-36 — El fondo oscuro de los modales se veía como un lavado gris parejo, y el selector de archivos se veía con el estilo del sistema operativo, en inglés

- **Encontrado en:** punto 11 de la revisión del equipo (19-11-2026).
- **Severidad:** Baja (nada fallaba; el modal y el selector de archivos seguían funcionando, pero
  rompían la coherencia visual del resto de la aplicación).
- **Causa confirmada (fondo del modal):** `dialog.dialogo::backdrop` usaba el café más oscuro de
  la paleta (`--cafe-900`) a solo 45 % de opacidad; sobre el fondo rosa claro de la app, ese
  porcentaje no alcanza a leerse como "oscurecido a propósito": se ve como un lavado parejo sobre
  toda la pantalla (confirmado con una captura real, antes y después).
- **Causa confirmada (selector de archivos):** `<input type="file">` no tenía ningún estilo propio;
  el botón "Choose Files"/"No file chosen" que muestra es dibujado por el sistema operativo, en SU
  idioma (el de la instalación del navegador, no el de la página: se comprobó que ni `lang="es-CL"`
  en el documento ni fijar el idioma del navegador cambian ese texto), y no se puede pintar con el
  estilo de la app.
- **Corrección:**
  - El fondo del modal sube a 70 % de opacidad, sin salirse de la paleta (sigue siendo
    `--cafe-900`, no un gris fuera de ella).
  - El selector de archivos: el campo real queda oculto visualmente (`.visualmente-oculto`, la
    misma clase que ya existía para el enlace "Saltar al contenido", no una nueva) y se activa con
    un botón normal de la app ("Elegir archivos"), que además muestra el nombre del archivo elegido
    (o "Ningún archivo elegido") en el mismo idioma y estilo que el resto de la pantalla.
- **Decisión documentada — el calendario del campo "Fecha comprometida" se deja nativo:** se abrió
  el selector de fecha de verdad (`<input type="date">`, en "Nueva solicitud") y resultó estar
  completamente sin traducir ("November 2026", "Su Mo Tu We Th Fr Sa", "Clear"/"Today") y sin
  ningún estilo de la app (fondo blanco, acento azul del sistema). Se intentó corregirlo con
  `lang="es-CL"` (ya heredado del documento) y fijando el idioma del navegador: ninguno de los dos
  cambió el idioma del calendario, porque ese texto lo pone el propio navegador instalado, no la
  página — alguien con Chrome en español vería ese mismo calendario ya en español, sin que la app
  tenga que hacer nada. No existe ninguna propiedad CSS, en ningún navegador actual, para repintar
  ese calendario emergente por dentro (a diferencia del selector de archivos, aquí no hay ningún
  botón disponible para reemplazar: todo el calendario es una sola pieza nativa). Construir uno
  propio significaría rehacer, con código nuevo a mantener, la navegación por teclado, el formato
  de fecha según el idioma de cada persona y el manejo de huso horario (un área donde este
  proyecto ya tuvo que corregir bugs reales, ver `estaAtrasado()`), a cambio de solo un beneficio
  cosmético. Se deja nativo a propósito, en escritorio y en celular por igual (en celular el
  calendario del sistema operativo, además, es más cómodo de usar con el dedo que cualquier
  cuadrícula armada a mano). Lo que sí se pudo confirmar ya correcto sin cambios: el campo cerrado
  (el recuadro de texto antes de abrir el calendario) ya comparte el mismo borde, relleno y foco
  visible que el resto de los campos de la aplicación.
- **Nueva ejecución:** verificado con navegador real: el fondo del modal computa
  `rgba(62, 44, 34, 0.7)`; el botón "Elegir archivos" aparece en español, muestra el nombre del
  archivo elegido tras seleccionarlo, y el foco con teclado (Shift+Tab) llega a ese botón, no al
  campo oculto.
- **Estado:** Corregido (fondo del modal y selector de archivos); el calendario nativo queda
  documentado como decisión deliberada, no como algo pendiente.

## DEF-37 — La paleta de colores (rosa/café) no correspondía a la marca Kotoduo

- **Encontrado en:** brecha ya anotada en `CLAUDE.md` §3 ("Paleta rosada que no corresponde a la
  marca") y retomada como punto 12 de la revisión del equipo (19-11-2026): paleta de tonos azules
  pastel derivada del logo, coherente en toda la aplicación, con el contraste medido con
  herramienta (no a ojo) y el recorrido repetido en celular — exactamente lo que la memoria del
  proyecto ("Requisitos de la Fase 2") pedía no dar por heredado de la paleta anterior.
- **Severidad:** Baja (no es un error funcional; la app funcionaba bien con la paleta anterior,
  pero no correspondía a la identidad visual de Kotoduo).
- **Causa confirmada:** `web/css/tokens.css` definía la paleta completa en tonos rosa/café
  (`--rosa-*`, `--cafe-*`), sin relación con los colores reales del logo de Kotoduo
  (`web/img/logo-kotoduo-original.png`), que es azul.
- **Corrección:** paleta nueva en tonos azules (`--azul-50` a `--azul-950`). Tres de los nueve
  tonos (`azul-400`, `azul-600`, `azul-950`) se tomaron muestreando los píxeles reales del logo
  con un script (`pngjs`, no a ojo): `azul-600` (#3C6496) y `azul-400` (#6EAAD2) son el azul medio
  y el azul claro del degradado del emblema "K"; `azul-950` (#09132B) es el tono más oscuro
  presente de verdad en el logo. El resto de la rampa se diseñó a partir de esos tres para
  completar los pasos intermedios. La cabecera pasa a fondo oscuro (`--color-cabecera-fondo`,
  `azul-950`), tal como ya describía `CLAUDE.md` §6.5 ("cabecera azul-950") pensando en el día que
  se use el logo real ahí — por ahora sigue con el texto "SST Kotoduo", en un tono claro legible
  sobre ese fondo oscuro, sin insertar la imagen (decisión explícita de la usuaria). Los colores de
  estado (éxito/aviso/error) NO se tocaron: son una convención aparte de la marca.
- **De paso, dos mejoras de contraste que la paleta anterior no cumplía (no heredadas, vueltas a
  medir con esta paleta):** el foco de teclado (`--color-foco`) pasa de dar 2.04:1 contra blanco
  (bajo el 3:1 que exige WCAG AA para indicadores de interfaz) a 6.08:1 con el azul nuevo. El borde
  general (`--color-borde`) sigue sin llegar a 3:1 (igual que en la paleta anterior, 1.65:1 antes
  vs. 1.75:1 ahora): es una limitación conocida que ya existía, no algo que este punto haya
  empeorado, y se deja anotada en vez de forzar un azul más saturado que dejaría de verse "pastel".
- **Nueva ejecución:** auditoría con `@axe-core/playwright` (la misma herramienta que ya se usó en
  la Parte C de la revisión anterior) contra 8 pantallas reales (Panel general, Usuarios, Bitácora,
  Mi cuenta, Aprobaciones, Mis solicitudes, Nueva solicitud, Ingreso), en 1280 y 390 px: **0
  violaciones de `color-contrast` y 0 violaciones totales de WCAG 2 A/AA** en las 16 combinaciones
  (8 pantallas × 2 anchos). Verificado también visualmente con capturas reales: cabecera oscura
  legible, fondo de modal correctamente oscurecido (ver DEF-36), formularios y tablas coherentes en
  todas las pantallas revisadas.
- **Estado:** Corregido.

## DEF-38 — La fecha comprometida se veía en dos formatos distintos según la pantalla

- **Encontrado en:** punto 13 de la revisión del equipo (19-11-2026).
- **Severidad:** Baja (el dato era el mismo; solo cambiaba cómo se mostraba).
- **Causa confirmada:** las tarjetas de trabajo (`tarjetaTrabajo()`, usadas en "Mis solicitudes" y
  la bandeja de Diseño) mostraban "Compromiso: 28-11-2026" (día-mes-año, vía `formatoFecha()`),
  pero el detalle de un trabajo (`detalleTrabajo.js`) mostraba el valor crudo que entrega la API
  sin pasar por ningún formateador: "compromiso 2026-11-28" (año-mes-día).
- **Corrección:** `detalleTrabajo.js` ahora usa el mismo `formatoFecha()` ya compartido (se
  exportó desde `componentes.js`, antes era privado) en vez de recortar el texto crudo a mano. Con
  esto, junto con la unificación de fecha+hora ya hecha en el punto 2 (`formatoFechaHora()`,
  compartido entre Bitácora y el historial del detalle), queda un solo formateador por tipo de
  dato (fecha sola, fecha con hora) para toda la aplicación.
- **Nueva ejecución:** verificado con navegador real: el mismo trabajo muestra "28-11-2026" tanto
  en la tarjeta de "Mis solicitudes" como en su propio detalle.
- **Estado:** Corregido.

## DEF-39 — Un aviso de materiales faltantes quedaba con una viñeta de lista pegada a la caja

- **Encontrado en:** barrido de espaciado del punto 14 de la revisión del equipo (19-11-2026), al
  revisar en vivo el aviso agregado en el punto 2 ("faltan materiales").
- **Severidad:** Baja (cosmético).
- **Causa confirmada:** el aviso de "Todavía no hay materiales registrados…" se insertaba dentro
  de un `<li>` de `.lista-reglas`, que sí tiene viñeta (correcto para una lista de texto plano);
  al ser ahora una caja de aviso con su propio fondo y relleno, la viñeta quedaba pegada al borde
  de la caja, como un error de maquetación.
- **Corrección:** `.lista-reglas li:has(.aviso) { list-style: none; }` — sin viñeta solo cuando el
  contenido del ítem ya es su propia caja.
- **Nueva ejecución:** verificado con navegador real, antes y después del cambio (se confirmó que
  la viñeta aparecía realmente, no se asumió).
- **Estado:** Corregido.

## DEF-40 — "Novedades" fallaba (error interno) para Vendedor y Diseño en la base real, por una columna que solo existía en la base efímera de pruebas

- **Encontrado en:** aviso de la usuaria, 20-11-2026 ("EN LA PANTALLA DEL VENDEDOR ES LO UNICO
  RARO.docx", 8 capturas reales) — punto 1 de esa revisión.
- **Severidad:** Alta (la pantalla no cargaba nada; afectaba a Vendedor y Diseño en la base real
  de demostración, no solo en un caso límite).
- **Causa confirmada:** `src/db/esquema.sql` agregó `usuario.novedades_vistas_en` para la
  funcionalidad de Novedades (punto 5 de la revisión anterior, 19-11-2026). Las bases EFÍMERAS
  (`scripts/entorno-efimero.js`, usadas por `npm run test`) aplican `esquema.sql` completo en cada
  ejecución, así que siempre tienen la columna. La base REAL persistente de demostración, creada
  antes con `npm run db:crear`, solo recibe cambios de esquema posteriores si alguien corre a mano
  el script de migración correspondiente (`scripts/db/agregar-*.js`) — paso que no se había hecho
  para esta columna. Confirmado con una consulta de solo lectura directa contra la base real
  (`information_schema.columns`): la columna no existía. Reproducido también de punta a punta
  contra una COPIA desechable de la base real (mismos datos de demostración, `pg_dump`/`psql`,
  sin tocar la base real ni la efímera): `GET /api/auditoria/novedades` como Jorge (Vendedor) y
  como Valentina (Diseño) devolvía 500 ("Error interno"), que en el navegador se muestra como "No
  pudimos cargar las novedades. Revisa tu conexión e inténtalo otra vez." — el mismo mensaje
  genérico que usa cualquier error de red, por lo que no daba ninguna pista de la causa real.
- **Corrección:** ninguna en el código (la columna y el servicio ya estaban bien escritos). Lo que
  falta es ejecutar la migración ya existente contra la base real:
  **`npm run db:agregar-novedades-vistas`** (es idempotente: no hace nada si la columna ya existe,
  y no borra ni modifica ningún dato). Verificado en la copia desechable: tras aplicar esa misma
  migración, ambas cuentas volvieron a recibir 200 con sus novedades reales (rechazo, aprobación,
  etapa completada), incluido el contador de no vistas.
- **Prevención (para que no vuelva a pasar, ni con esta columna ni con la próxima):** `npm run
  verificar` ahora compara, contra la base real que tenga configurada, cada columna que declara
  `src/db/esquema.sql` contra `information_schema.columns`, y reporta por nombre cualquier columna
  que falte. Verificado contra la base real: detectó exactamente `usuario.novedades_vistas_en`
  como faltante, antes de aplicar la migración.
- **Nueva ejecución:** diagnóstico y verificación de la causa y de la corrección hechos contra una
  copia real de la base (datos de demostración reales, no la base efímera vacía), con peticiones
  HTTP reales (`curl` con cookies de sesión) equivalentes a lo que haría el navegador — no se probó
  todavía con un navegador real abriendo la pantalla, porque este entorno no tiene uno disponible;
  queda pendiente que alguien confirme visualmente después de ejecutar la migración en la base real.
- **Estado:** Causa y corrección verificadas contra una copia de la base real; pendiente que la
  usuaria ejecute `npm run db:agregar-novedades-vistas` contra la base real (acción sobre la base
  real: se deja para que la ejecute ella, no se tocó la base real directamente).

## DEF-41 — La Bitácora y el historial mostraban "Etapa n.º 2" en vez del nombre real de la etapa, en la vista general y en "Mis actividades"

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 6, primera mitad).
- **Severidad:** Baja (el dato existía y era correcto en otras pantallas; aquí solo faltaba
  traducirlo a un nombre).
- **Causa confirmada:** el nombre de la etapa se resolvía en el cliente, no en el servidor, y solo
  en las dos pantallas que YA tenían a mano las etapas de ESE trabajo para otra cosa (el detalle de
  un trabajo, y la Bitácora ya filtrada a uno): cada una armaba su propio mapa "orden → nombre" con
  una segunda petición. La vista general de Bitácora (varios trabajos de tipos distintos a la vez) y
  el historial dentro de "Mis actividades" nunca armaban ese mapa, así que mostraban el número crudo.
- **Corrección:** el nombre de la etapa se resuelve ahora en el servidor, al leer la bitácora
  (`servicioBitacora.enriquecer()`), igual que ya se hacía con el nombre de usuario y de material:
  una sola consulta por lote, agregada automáticamente a cualquier evento de tipo "trabajo" con un
  número de etapa, sin que quien llama tenga que pedirlo aparte. Las dos pantallas que ya armaban su
  propio mapa se simplificaron (ya no hacen la segunda petición).
- **Nueva ejecución:** 96/96 pruebas automáticas en verde en la suite completa. Verificado además con
  peticiones HTTP reales contra una copia de la base real: la vista general de novedades de Jorge y
  Valentina ya trae `"nombreEtapa": "Preparación de matriz de bordado"`, etc., en vez del número.
- **Actualización (20-11-2026, segunda vuelta):** verificado con un navegador real de verdad
  (Playwright/Chromium) contra una copia de la base real: "Mis solicitudes" (Vendedor) y "Mis
  actividades" (Operario) muestran el nombre real de la etapa ("Bordado de prendas", etc.), nunca
  un número.
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real.

## DEF-42 — El trabajo desaparecía por completo de la bandeja de Diseño apenas se enviaba la propuesta, sin ninguna sección de espera ni filtros

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 2). Limitación ya anotada antes en
  DEF-29, ahora confirmada como un problema a corregir.
- **Severidad:** Media (Diseño perdía toda visibilidad de su propio trabajo mientras esperaba la
  decisión de Producción, y no tenía forma de filtrar por estado).
- **Causa confirmada:** `servicioTrabajos.listar()` y `detalle()` restringían el alcance de rol
  `DISENO` a `estado IN ('SOLICITADO', 'EN_DISENO')` únicamente: apenas una propuesta se envía, el
  trabajo pasa a `PENDIENTE_APROBACION` y queda fuera de ese filtro — invisible en `GET /trabajos`
  y con 403 en `GET /trabajos/:codigo`, no solo "oculto en la pantalla". `renderBandejaDiseno()`
  tampoco tenía ninguna sección ni filtro para ese estado (ni para ningún otro).
- **Corrección:** se amplió el alcance de `DISENO` a `PENDIENTE_APROBACION` en `listar()` y
  `verificarAlcance()` (`src/modulos/trabajos/servicioTrabajos.js`); la bandeja (`diseno.js`) suma
  una tercera sección, "Esperando aprobación", y una barra de filtros (Todos, Por tomar, En diseño,
  Rechazados, En aprobación) — "Rechazados" es un recorte de "En diseño" (los que tienen un rechazo
  reciente sin corregir), no una sección nueva bajo "Todos".
- **Nueva ejecución:** nueva prueba automática CP-92 (`tests/integracion/novedades.test.js`): con el
  trabajo en `PENDIENTE_APROBACION`, Diseño sigue viendo el listado, el detalle y el historial.
  96/96 pruebas en verde en la suite completa. Verificado también con peticiones HTTP reales contra la copia de la base
  real: `GET /api/trabajos` como Valentina ya incluye el trabajo en `PENDIENTE_APROBACION`.
- **Actualización (20-11-2026, segunda vuelta):** la usuaria reprodujo esta pantalla con un
  navegador real contra el servidor de demostración (puerto 3000) y NO vio ni los filtros ni la
  sección "Esperando aprobación". Causa real: ese servidor lleva corriendo desde antes de este
  arreglo, y Node.js cachea en memoria los módulos de backend al arrancar (`require()`) — una
  edición en disco de `servicioTrabajos.js` no la toma un proceso ya en marcha hasta reiniciarlo.
  Reproducido y confirmado con un navegador real de verdad (Playwright/Chromium) contra una copia
  desechable de la base real, con un proceso recién iniciado: las tres secciones y los cinco
  filtros se ven y funcionan correctamente, sin errores de consola. **Para que se vea en el
  servidor de demostración real, hace falta reiniciarlo** (parar `npm run demo` y volver a
  ejecutarlo) después de aplicar estos cambios.
  De paso, se amplió también a `EN_PRODUCCION` (filtro "Aprobados", nuevo): Diseño sigue viendo de
  solo lectura una propuesta ya aprobada (no puede decidir: eso lo bloquea el permiso
  `DISENO_APROBAR`, que Diseño nunca tuvo). Filtros finales, en el orden pedido: Todos, Por tomar,
  En diseño, Esperando aprobación, Rechazados, Aprobados.
- **Nueva ejecución (segunda vuelta):** capturas de pantalla reales (Playwright/Chromium, 1280 y
  390px) de la bandeja completa, del filtro "Aprobados", y 0 errores de consola en las 16
  combinaciones de pantalla/rol revisadas en esta vuelta. Prueba automática ampliada
  (`tests/integracion/novedades.test.js`): tras aprobarse, Diseño sigue viendo el trabajo
  (`EN_PRODUCCION`) y un intento de decidir devuelve 403; `tests/unit/dominio.test.js` fija que
  `DISENO` nunca tiene el permiso `DISENO_APROBAR`. 96/96 pruebas en verde en la suite completa.
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real; pendiente que se reinicie el servidor de demostración real para que tome el cambio.

## DEF-43 — Cada pantalla con lista de trabajos tenía su propio control de orden (o ninguno), con nombres distintos, y uno de ellos ordenaba al revés de lo que decía su propia etiqueta

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 3).
- **Severidad:** Baja (no impedía usar la pantalla, pero confundía: el mismo concepto se veía y se
  comportaba distinto según dónde se estuviera).
- **Causa confirmada:** "Aprobaciones" (Producción) tenía un selector propio con las opciones "Más
  urgentes primero" / "Más recientes primero"; "Mis solicitudes" (Vendedor), la bandeja de Diseño y
  el Panel general no tenían ninguno. Además, "Más recientes primero" en Aprobaciones en realidad
  ordenaba `enviado_en ASC` (las propuestas más ANTIGUAS primero) — lo contrario de lo que decía su
  propia etiqueta.
- **Corrección:** un solo componente reutilizable (`selectorOrden()` en `componentes.js`) con tres
  opciones en todas las pantallas: "Entrega más próxima" (con una nota de ayuda que aclara que
  ordena por fecha de entrega comprometida), "Más recientes" y "Más antiguos". Se agregó a Vendedor,
  Diseño, Producción y Panel general; "Más recientes" en Aprobaciones ahora sí ordena `enviado_en
  DESC`, corregido junto con la unificación. `GET /trabajos` aceptó el mismo parámetro `orden` que ya
  tenía `GET /disenos/pendientes`. El Panel general ordena en el navegador (ya trae todos los datos
  de una vez); el resto se lo pide al servidor.
- **Nueva ejecución:** nueva prueba automática CP-93 (`tests/integracion/disenosPendientes.test.js`):
  "recientes" y "antiguos" quedan en orden exactamente inverso entre sí, y "antiguos" trae primero lo
  que se envió primero. 96/96 pruebas en verde en la suite completa. Verificado con peticiones HTTP reales contra la
  copia de la base real.
- **Actualización (20-11-2026, segunda vuelta):** verificado con un navegador real de verdad
  (Playwright/Chromium) contra una copia de la base real, en las cuatro pantallas (Mis solicitudes,
  Bandeja de diseño, Aprobaciones, Panel general): mismas tres opciones, mismo texto, misma nota de
  ayuda. De paso se encontró y corrigió un desalineamiento visual del campo vecino (ver DEF-48).
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real.

## DEF-44 — Una versión de diseño rechazada mostraba el chip "Detenido" (vocabulario de otro estado) y el texto crudo "Decisión: RECHAZADO"

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 4).
- **Severidad:** Media (información incorrecta/confusa sobre una decisión ya tomada: "Detenido" es
  el estado de un TRABAJO detenido por falta de materiales o similar, no el de una propuesta
  rechazada — son conceptos distintos con la misma palabra prestada por error).
- **Causa confirmada:** `detalleTrabajo.js` pintaba el chip de una versión de diseño con
  `chipEstado()`, pensado para `trabajo.estado` (SOLICITADO/EN_DISENO/.../DETENIDO/TERMINADO),
  traduciendo a mano "RECHAZADO → DETENIDO" y "APROBADO → TERMINADO" para reusar sus colores — una
  versión de diseño tiene su propio estado (`PENDIENTE`/`APROBADO`/`RECHAZADO`, tabla `diseno`) que
  nunca tuvo su propio vocabulario. La línea de abajo imprimía `d.decision` tal cual llega de la
  API ("RECHAZADO"/"APROBADO"), sin traducir, y no mostraba quién decidió (el campo ni se pedía a
  la base de datos). El mismo problema de texto crudo aparecía en "Decidir propuesta" (Producción)
  al reabrir una versión ya decidida: "Esta versión ya tiene una decisión registrada (RECHAZADO)."
- **Corrección:** vocabulario propio para la versión de diseño (`TEXTO_ESTADO_DISENO`/
  `chipEstadoDiseno()` en `componentes.js`): Pendiente/Aprobada/Rechazada, con sus propios colores,
  sin tomar nada prestado de `trabajo.estado`. `GET /trabajos/:codigo` ahora también entrega quién
  decidió (`aprobador`, antes solo tenía `decidido_en` y `motivo`); `textoDecisionDiseno()` compone
  "Rechazada por Marcela Fuentes el 17-11-2026 22:53. Motivo: …" a partir de eso. Se aplicó en las
  dos pantallas (versiones de diseño del detalle, y el aviso de "Decidir propuesta").
- **Nueva ejecución:** verificado con peticiones HTTP reales contra la copia de la base real: el
  detalle de KT-2026-0003 ya entrega `aprobador: "Marcela Fuentes"` junto a `decision`, `motivo` y
  `decidido_en` para cada versión. Nueva prueba automática `tests/unit/etiquetasEstado.test.js`
  (pedido explícito de la usuaria): fija que `TEXTO_ESTADO` (trabajo) y `TEXTO_ESTADO_DISENO`
  (versión de diseño) tengan, cada uno, una etiqueta propia por estado, sin duplicados y sin dejar
  ningún valor crudo sin traducir, y específicamente que una versión rechazada/aprobada nunca
  reutilice la etiqueta de un trabajo detenido/terminado. 96/96 pruebas en verde en la suite completa.
- **Actualización (20-11-2026, segunda vuelta):** verificado con un navegador real de verdad
  (Playwright/Chromium) contra una copia de la base real, sobre KT-2026-0003 (una versión
  rechazada y una pendiente): la versión 1 muestra el chip "Rechazada" (rojo) con el texto
  "Rechazada por Marcela Fuentes el 17-11-2026 19:53. Motivo: El tamaño del letrero supera el
  ancho permitido por la fachada"; la versión 2 muestra "Pendiente", sin texto de decisión. 0
  errores de consola.
- **Estado:** Corregido, con prueba automática de etiquetas distintas y verificado con navegador
  real (Playwright) contra una copia de la base real.

## DEF-45 — El diálogo de confirmación de rechazo decía que se rechazaría a la persona que envió la propuesta, no la propuesta misma

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 5).
- **Severidad:** Baja (no cambiaba el resultado de la acción, solo cómo se explicaba antes de
  confirmarla).
- **Causa confirmada:** el mensaje decía textualmente "Se rechazará a Valentina Rojas (quien envió
  esta versión); el trabajo de Jorge Saavedra vuelve a 'En diseño'...", con la diseñadora como
  sujeto gramatical de "se rechazará" — como si el rechazo fuera contra ella, en vez de contra la
  propuesta/versión que mandó.
- **Corrección:** el sujeto de la frase pasa a ser la propuesta: "Se rechazará la versión N de
  KT-2026-XXXX, enviada por Valentina Rojas; el trabajo vuelve a 'En diseño' para que Valentina
  Rojas pueda retomarlo con una nueva versión. Motivo: '...'." — se mantiene toda la información
  que ya daba el aviso (quién la envió, que el trabajo vuelve a "En diseño", que puede reintentar,
  el motivo), solo cambia a quién/qué apunta la primera frase.
- **Nueva ejecución:** revisión de código (es un diálogo del navegador, sin prueba automática de
  backend que lo cubra).
- **Actualización (20-11-2026, segunda vuelta):** verificado con un navegador real de verdad
  (Playwright/Chromium) contra una copia de la base real, disparando el rechazo completo (motivo +
  confirmación) sobre una propuesta real: el diálogo dice textualmente "Se rechazará la versión 2
  de KT-2026-0003, enviada por Valentina Rojas; el trabajo vuelve a 'En diseño' para que Valentina
  Rojas pueda retomarlo con una nueva versión. Motivo: 'Las medidas no coinciden con lo pedido'."
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real.

## DEF-46 — Convivían tres formatos de fecha/hora visualmente distintos en la aplicación (regresión parcial de DEF-38)

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 6, segunda mitad). Ejemplos dados:
  "19-11-26 10:41 p. m.", "12-11-2026", "20-12-2026".
- **Severidad:** Baja (el dato era correcto en los tres casos; solo la forma de mostrarlo era
  inconsistente).
- **Causa confirmada:** DEF-38 (19-11-2026) unificó el formato de FECHA SOLA (`formatoFecha()`,
  DD-MM-AAAA cada vez) pero no tocó el formato de fecha CON HORA (`formatoFechaHora()`), que seguía
  delegando en `Date.prototype.toLocaleString('es-CL', ...)`: ese método entrega el año a 2 dígitos
  y "a. m."/"p. m." con un espacio angosto que en algunas pantallas se ve pegado o distinto según
  la fuente — "19-11-26 10:41 p. m." (2 dígitos de año) junto a "12-11-2026" (4 dígitos, de
  `formatoFecha()`): dos formatos de fecha que no coincidían entre sí, visibles en la misma sesión.
- **Corrección:** `formatoFechaHora()` ya no delega en `toLocaleString`: construye la fecha con el
  mismo patrón DD-MM-AAAA (4 dígitos) que `formatoFecha()`, más la hora en formato 24 horas
  (HH:MM), sin depender del locale que tenga configurado el navegador. Con esto hay un solo patrón
  de fecha en toda la aplicación, con u sin hora según el dato lo tenga o no (p. ej.
  `fecha_compromiso` es una columna `DATE`, sin hora: mostrarle una hora inventada habría sido
  incorrecto, no más "consistente").
- **Nueva ejecución:** revisión de código y de las llamadas existentes (no hay una prueba
  automática de backend que cubra el formato de texto del navegador).
- **Actualización (20-11-2026, segunda vuelta):** verificado con un navegador real de verdad
  (Playwright/Chromium) contra una copia de la base real: Bitácora, Novedades y el historial del
  detalle de un trabajo muestran "DD-MM-AAAA HH:MM" (por ejemplo "17-11-2026 19:53") de forma
  consistente, sin el año a 2 dígitos ni "a. m./p. m." de antes.
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real.

## DEF-47 — El estado vacío de "Mis actividades" (Operario) no explicaba por qué no había nada

- **Encontrado en:** capturas de la usuaria, 20-11-2026 (punto 7).
- **Severidad:** Baja (no era un error; solo no explicaba la ausencia de datos de forma que no se
  confundiera con una falla).
- **Causa confirmada:** el mensaje era "No tienes actividades en curso en tu área por ahora." —
  cierto, pero no decía cuándo o por qué iban a aparecer, lo que puede leerse como que algo no
  está funcionando.
- **Corrección:** el mensaje ahora explica la causa real (`actividadesDeMiArea()`: solo aparecen
  etapas `EN_CURSO` de trabajos `EN_PRODUCCION` del área de quien pregunta): "No tienes actividades
  en este momento. Aparecerán aquí apenas Producción apruebe un diseño cuya primera etapa sea de tu
  área, o cuando te toque la etapa siguiente de un trabajo ya en curso."
- **Nueva ejecución:** revisión de código contra la consulta real de `actividadesDeMiArea()` (la
  explicación corresponde exactamente a cuándo aparece una fila). No verificado todavía con un
  navegador real (ver limitación anotada en DEF-40).
- **Estado:** Corregido en el código; verificación visual pendiente.

## DEF-48 — "Filtrar por área"/"Filtrar por estado" quedaba más abajo que "Ordenar por" en todas las pantallas con ambos filtros

- **Encontrado en:** captura real de la usuaria (Panel general, Producción), 20-11-2026 (punto 2,
  segunda vuelta).
- **Severidad:** Baja (ambos campos seguían funcionando; solo se veían desalineados).
- **Causa confirmada:** `.filtros-lista` alinea sus campos por la base (`align-items: flex-end`).
  `selectorOrden()` devolvía un `.campo` de TRES líneas (etiqueta, select y su propio texto de
  ayuda), mientras que el campo vecino ("Filtrar por área"/"Filtrar por estado"/"Buscar por código")
  tenía solo DOS (etiqueta y control) — al alinear por la base, el campo más corto quedaba empujado
  hacia abajo para que ambos terminaran a la misma altura. Afectaba a Panel general y Aprobaciones
  (Producción); Mis solicitudes (Vendedor) tenía el mismo defecto de fondo aunque no siempre se
  notara según el ancho de pantalla.
- **Corrección:** `selectorOrden()` ya no incluye su texto de ayuda dentro del `.campo` que
  devuelve (queda solo etiqueta + control, igual que sus vecinos); el texto de ayuda se agrega
  aparte, DEBAJO de toda la fila. Se creó `barraFiltros(...campos)` en `componentes.js`, una sola
  envoltura reutilizable para la fila de filtros, usada ahora en las cuatro pantallas (Vendedor,
  Diseño, Producción, Panel general) en vez de que cada una arme su propio `<div class="filtros-
  lista">` a mano.
- **Nueva ejecución:** capturas de pantalla reales (Playwright/Chromium) antes y después, a 1280px,
  en Panel general y Aprobaciones: los dos campos quedan exactamente a la misma altura. Revisado
  también Mis solicitudes y la bandeja de Diseño (que no tenían este defecto visible, pero ahora
  comparten el mismo componente). 0 errores de consola. Sin prueba automática de backend (es
  puramente de maquetación, en el navegador).
- **Estado:** Corregido y verificado con navegador real (Playwright) a 1280px; verificación visual
  de la propia usuaria, bienvenida para confirmar.

## DEF-49 — Novedades no tenía filtros, agrupación, "marcar todas como leídas" ni forma de ver más de las últimas 30

- **Encontrado en:** pedido explícito de la usuaria, 20-11-2026 (punto 3, segunda vuelta).
- **Severidad:** Baja (la pantalla funcionaba; con pocas novedades alcanzaba, pero no escalaba).
- **Causa confirmada:** `consultarNovedades()` traía como máximo 30 eventos, sin paginación, sin
  indicar cuáles ya se habían visto individualmente (solo un contador total), y los marcaba TODOS
  como vistos automáticamente con solo abrir la pantalla — sin esa marca automática no tendría
  sentido un botón para hacerlo a mano, así que había que quitarla primero.
- **Corrección:** `GET /auditoria/novedades` acepta `pagina`/`limite` (igual que el resto de la
  app) y cada evento trae ahora `leida` (antes solo el total `noVistas`). La pantalla
  (`novedades.js`) ya no marca como vistas al abrir: agrega un botón explícito "Marcar todas como
  leídas", seis filtros (Todas, No leídas, Rechazos, Aprobados, En producción, Terminados —
  calculados en el navegador a partir del tipo de evento, sin tocar el servidor), agrupación por
  día ("Hoy", "Ayer", o la fecha) y un botón "Cargar más" mientras falten eventos por traer. Un
  evento no leído se destaca además con un chip "Nueva" (mismo `filaEvento()` que ya usan Bitácora
  e historial; el chip solo aparece donde el evento trae "leida", nunca en esas otras pantallas).
- **Error encontrado y corregido en el camino:** al mover a una consulta de MongoDB la comparación
  "¿es posterior a la última visita?", dejó de funcionar para quien nunca había visitado Novedades:
  PostgreSQL entrega ese "nunca" (`-infinity`) como el número `-Infinity`, no como una fecha — en
  JavaScript puro, comparar una fecha contra ese número con "mayor que" funciona bien (se convierte
  solo), pero dentro de una consulta de MongoDB no, porque el motor compara por tipo de dato, no
  convierte un número a fecha. Se corrigió reemplazando ese "nunca" por una fecha real (1970) antes
  de usarla en cualquier consulta; sin este arreglo, el contador de no leídas daba 0 siempre (lo
  detectó una prueba automática existente, CP-87, que empezó a fallar justo al hacer este cambio).
- **Nueva ejecución:** 96/96 pruebas automáticas en verde en la suite completa (incluida CP-87, que
  detectó el error de `-infinity` de camino). Capturas de pantalla reales (Playwright/Chromium,
  1280 y 390px) de Novedades con filtros, agrupación por día y el botón de marcar todas, para
  Diseño y Vendedor; 0 errores de consola.
- **Estado:** Corregido y verificado con navegador real (Playwright) contra una copia de la base
  real.
