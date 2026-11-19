# Cambios respecto al diseño (Informe 2)

Registro de todo lo que se desvía de lo documentado en el Informe 2, con qué cambió, por qué,
el impacto y la fecha. No se borra nada de aquí aunque se vuelva a corregir después.

> Este archivo se crea en la Fase 0 (bases de datos reales). Si hay desvíos de etapas anteriores
> del proyecto que todavía no están documentados, agréguenlos arriba de esta sección con la fecha
> real en la que ocurrieron; esta sesión de Claude Code no tenía el Informe 2 cargado para
> compararlo línea por línea.

---

## Fase 0 — Bases de datos reales y entorno reproducible (14 y 15-11-2026)

### 1. Motor de la base estructurada: PGlite → PostgreSQL real

- **Qué cambió:** el Informe 2 documenta PostgreSQL como motor de la base estructurada. Durante
  el desarrollo se había usado PGlite (una compilación de PostgreSQL a WebAssembly que corre
  embebida dentro del propio proceso de Node, sin servidor aparte) para no depender de una
  instalación local mientras se armaba la aplicación. A partir de esta fase se usa **PostgreSQL
  16.14 real**, instalado como servicio de Windows, escuchando en `127.0.0.1:5432`.
- **Por qué (sin restarle mérito a PGlite: es PostgreSQL de verdad, con sus mismas limitaciones
  reales, no un simulador):**
  - **No se puede inspeccionar con herramientas externas.** Al vivir dentro del mismo proceso de
    Node, no expone un puerto de red al que pgAdmin 4 (ni ningún otro cliente) pueda conectarse.
    La única forma de ver sus datos era a través del propio código de la aplicación.
  - **Una sola conexión real a la vez.** PGlite no implementa el protocolo de conexiones
    concurrentes de PostgreSQL: todo el acceso pasa por un único objeto en memoria dentro del
    proceso que lo creó. Esto impedía, por ejemplo, abrir una segunda conexión para inspeccionar
    datos mientras la aplicación seguía corriendo, o simular dos personas operando a la vez sobre
    la misma base (necesario para las pruebas de concurrencia de la Fase 3).
  - **No tiene roles ni privilegios reales.** Todo el código corría con un único "usuario"
    implícito y con permisos completos sobre el esquema; no había forma de crear un rol como
    `sst_app` y comprobar que, aunque algo salga mal, no pueda borrar una tabla. El indicador
    3.1.3.5 (patrones de seguridad avanzados) pide demostrar justamente eso.
  - El informe y la demostración en vivo necesitan mostrar la base real, con pgAdmin conectado,
    delante de quien evalúa.
- **Impacto en el código:** se reescribió `src/db/postgres.js` para usar el driver `pg` con un
  `Pool` (máx. 10 conexiones), manteniendo exactamente la misma interfaz que ya usaban los
  servicios (`query`, `transaction`, `exec`, `close`), para no tener que tocar `src/modulos/*`.
  Se agregaron parsers de tipo (`pg` devuelve `BIGINT`/`NUMERIC` como texto y `DATE` como objeto
  `Date`; se configuraron para que sigan llegando como número y como texto `AAAA-MM-DD`,
  igual que antes).
- **Impacto en el modelo de datos:** ninguno. `src/db/esquema.sql` no se modificó; es el mismo
  esquema de 12 tablas y 16 relaciones del Informe 2.
- **Dependencias:** se agregó `pg` (`^8.23`) y se quitó `@electric-sql/pglite` (ya no se usa en
  ningún lugar del proyecto).

### 2. Variables de entorno de PostgreSQL

- **Qué cambió:** `SST_PG_DIRECTORIO` (ruta de la base embebida) se reemplazó por tres URL de
  conexión, una por rol:
  - `SST_PG_URL`: rol `sst_app` (la aplicación en marcha; privilegio mínimo).
  - `SST_PG_PROPIETARIO_URL`: rol `sst_propietario` (dueño del esquema; solo scripts de
    migración).
  - `SST_PG_PRUEBAS_URL`: rol `sst_pruebas` (con `CREATEDB`, sin superusuario; crea y borra una
    base temporal por cada ejecución de la suite automática).
- **Por qué tres roles y no uno:** separación de privilegios. La idea original del Informe 2 no
  especificaba roles de base de datos; se decidió este diseño para que la aplicación en marcha
  nunca tenga permisos de `CREATE`/`DROP`/`ALTER`, y para que la contraseña del superusuario
  `postgres` se use una sola vez (al ejecutar `npm run db:crear`) y nunca más se necesite ni se
  guarde en ningún archivo del proyecto.
- **Dónde queda documentado el detalle:** `docs/VER_LAS_BASES_DE_DATOS.md`.

### 3. Privilegios mínimos por tabla (rol `sst_app`)

- **Qué se hizo:** se revisó con `grep` cada `INSERT`/`UPDATE`/`DELETE` real de `src/modulos/*`
  contra el esquema y se armó una lista exacta de permisos por tabla:
  - Solo lectura: `rol`, `area`, `tipo_trabajo`, `etapa_plantilla`, `material`,
    `trabajo_material` (la aplicación nunca escribe ahí; son catálogos sembrados una vez).
  - Lectura y escritura (sin `DELETE`): `usuario`, `sesion`, `trabajo`, `etapa_trabajo`, `diseno`.
  - Solo lectura e inserción (sin `UPDATE` ni `DELETE`): `aprobacion_diseno` (una decisión de
    diseño es definitiva, nunca se modifica ni se borra).
  - Ninguna tabla tiene `DELETE` para `sst_app`: el código de la aplicación nunca borra filas
    (los trabajos, sesiones y usuarios se marcan con un estado en vez de eliminarse), así que no
    hacía falta otorgarlo.
- **Por qué importa para el informe:** es evidencia concreta y verificable de "mínimo privilegio"
  (3.1.3.5) y de que el diseño de la base ya anticipaba esta separación (ningún `DELETE` en el
  código, confirmado al revisarlo).

### 4. Base documental: MongoDB sin autenticación → con autenticación

- **Qué cambió:** MongoDB pasó a ejecutarse con `--auth`, con tres cuentas:
  - `sst_admin`: rol `root` en `admin`, solo para inspección manual con MongoDB Compass.
  - `sst_app`: rol `readWrite` **solo** sobre `sst_kotoduo` (la aplicación en marcha).
  - `sst_pruebas`: roles `readWriteAnyDatabase` + `dbAdminAnyDatabase` en `admin`, para que la
    suite automática de pruebas pueda crear y borrar una base temporal por cada ejecución.
- **Por qué un tercer usuario de Mongo:** se detectó (ver `evidencias/defectos.md`, DEF-03) que
  `sst_app`, al estar acotado a `sst_kotoduo`, no podía usarse para las bases de prueba
  `sst_prueba_xxxx` sin ampliar sus permisos más allá de lo necesario para la aplicación real. Se
  prefirió un usuario aparte, de alcance más amplio pero usado solo por la suite de pruebas, antes
  que ampliar los permisos del usuario de producción.
- **Variable nueva:** `SST_MONGO_PRUEBAS_URI`.

### 5. Pruebas automatizadas contra motores reales

- **Qué cambió:** `tests/contexto.js` ya no crea una base PostgreSQL en memoria; crea una base
  PostgreSQL real y temporal (`sst_prueba_xxxx`) con el rol `sst_pruebas`, le aplica el esquema y
  la semilla, y la destruye (`DROP DATABASE ... WITH (FORCE)`) al terminar cada suite. La base de
  MongoDB de pruebas ahora se conecta con `sst_pruebas` en vez de reutilizar las credenciales de
  `sst_app`, por la misma razón del punto 4.
- **Resultado:** ver `evidencias/ejecucion_pruebas_postgresql_real.txt` (se completa al cerrar
  esta fase).

### 6. Script de siembra y de arranque de la demostración

- **Qué cambió:** `scripts/sembrar-demo.js` usa `entorno.pgUrl` en vez de `entorno.pgDirectorio`.
  `scripts/arrancar-demo.js` ya no intenta levantar MongoDB por su cuenta (eso ahora lo hace
  `npm run mongo:iniciar`, con autenticación) ni genera una carpeta de PGlite; si falta
  `SST_PG_URL` o `SST_MONGO_URI` en `.env`, el script lo dice claramente y no arranca, en vez de
  inventar una configuración a medias.
- **Orden de arranque nuevo** (ver `README.md`): `npm run db:crear` → `npm run mongo:iniciar` →
  `npm run demo:sembrar` → `npm run demo`. A diferencia de la versión anterior con PGlite, ahora
  **sí se puede** sembrar con el servidor ya corriendo (PostgreSQL real admite varias conexiones a
  la vez, a diferencia del motor embebido anterior); se deja igual el orden recomendado por
  prolijidad, pero ya no es obligatorio.

### 7. Cobertura de pruebas: por qué se movió y dónde quedó al final

Al terminar de migrar `src/db/postgres.js`, la primera corrida completa mostró
**93,77 % de statements**, un número que a primera vista parece más bajo que el **98,15 %** que
`CLAUDE.md` tenía anotado de antes. Comparar esos dos números directamente es comparar cosas
distintas: 98,15 % era la cobertura de **líneas**, no de **statements** (son métricas distintas de
Istanbul/Jest, casi siempre con valores diferentes entre sí). La comparación correcta,
métrica por métrica, entre el estado anterior (PGlite, fin de la etapa de pantallas) y el final de
esta fase (PostgreSQL real, con las pruebas agregadas en los puntos siguientes) es:

| Métrica | Antes (PGlite) | Después (PostgreSQL real) |
|---|---|---|
| Statements | 94,05 % | **94,24 %** |
| Branches | 79,19 % | **80,21 %** |
| Functions | 94,65 % | **94,28 %** |
| Lines | 98,15 % | **98,2 %** |

Tres de las cuatro métricas quedaron un poco mejor que antes; "Functions" quedó 0,37 puntos por
debajo, y se explica completo más abajo. No fue una caída real: fue una comparación entre dos
métricas distintas, y ya quedó corregida con pruebas agregadas, no solo con una nota.

**Qué pasó en el camino (con el detalle exacto, función por función, usando el reporte de Istanbul
en `coverage/coverage-final.json`):**

- El nuevo `src/db/postgres.js` creció de 25 a 67 líneas y agregó funciones que `PGlite` no
  necesitaba (`query`, `transaction`, `exec`, `close` como funciones separadas, más los parsers de
  tipo). Dos de ellas no las llamaba ninguna prueba al terminar la primera corrida:
  - **`exec()`**: antes la usaba la propia `crearBaseRelacional` para aplicar `esquema.sql` y
    `semilla.sql` la primera vez. Con PostgreSQL real, aplicar el esquema se movió a
    `scripts/db/crear-base-postgres.js` y a `tests/contexto.js`, cada uno con su propia conexión
    (porque esos pasos los hace el rol `sst_propietario` o `sst_pruebas`, nunca `sst_app`), así que
    `exec()` quedó sin ningún llamador real dentro del código de la aplicación. **Se agregó la
    prueba CP-47** (`tests/integracion/baseRelacional.test.js`), que la ejercita directamente con
    varias sentencias DDL separadas por `;`, tal como la necesitan esos scripts.
  - **La validación de la URL de conexión** (`if (!urlConexion) throw ...`): ninguna prueba
    llamaba nunca a `crearBaseRelacional()` sin una URL. **Se agregó la prueba CP-48** para ese
    caso.
- Con esas dos pruebas agregadas, se revisó el detalle función por función y rama por rama (no
  solo línea por línea) y quedan exactamente **dos** casos sin cubrir, ambos genuinos y difíciles
  de forzar de forma natural, así que se documentan aquí en vez de agregar una prueba artificial
  solo para subir el número:
  1. **El parser de `BIGINT`** (rama `INT8` dentro de `getTypeParser`, `src/db/postgres.js` línea
     11): ninguna consulta del código actual devuelve una columna `BIGINT` sin convertirla antes a
     `INTEGER` (todos los `COUNT(*)` llevan `::int`), así que esa rama nunca se activa. Es
     intencional: la conversión se dejó puesta por precaución, para el día en que alguna consulta
     nueva use `COUNT()` sin convertir el resultado.
  2. **El `catch` de seguridad dentro de `transaction()` cuando el propio `ROLLBACK` falla**
     (`src/db/postgres.js` línea 46): la prueba CP-16 ya fuerza que una transacción falle (cuando
     MongoDB rechaza guardar la propuesta) y confirma que el `ROLLBACK` se ejecuta y revierte todo
     bien. Lo que no se prueba es el escenario de **doble falla**: que además ese mismo `ROLLBACK`
     falle (por ejemplo, porque la conexión a PostgreSQL se cortó justo en ese instante). Forzar
     eso de forma realista requeriría interceptar la conexión a mitad de una transacción, algo que
     no se intentó por el riesgo de terminar probando el simulador en vez del código real. Queda
     anotado aquí como limitación conocida, no resuelta.
- Aparte de `postgres.js`, las columnas 37-40 de `src/db/mongo.js` (la rama que SALTA crear una
  colección porque ya existe) y las líneas 7-30 de `src/config/entorno.js` (la función
  `cargarEntorno()` en sí) ya estaban sin cubrir **antes** de esta fase, por motivos que no tienen
  que ver con el cambio de motor (cada prueba crea una base nueva, así que esa colección nunca
  existe de antemano; y las pruebas arman su propio objeto `entorno` a mano en vez de llamar a
  `cargarEntorno()`). No se tocaron en esta fase.

## Fase 1 — Materiales, archivos reales, restablecimiento, cierre por inactividad, MFA (16 al 19-11-2026)

### 1. Restablecimiento de contraseña y MFA: qué pasa si Administración queda sin acceso

- **Pregunta del equipo (ampliada tras la Funcionalidad 5):** la Funcionalidad 4 (restablecimiento
  por enlace) solo la puede generar una cuenta con el permiso `USUARIO_GESTIONAR` (hoy, solo
  ADMINISTRADOR). ¿Qué pasa si la persona de Administración es justo la que olvida su contraseña o
  queda bloqueada? Y ahora, con la Funcionalidad 5: ¿qué pasa si en vez de (o además de) eso pierde
  el teléfono con la aplicación de verificación en dos pasos?
- **Cómo está cubierto hoy:**
  - Un **bloqueo por intentos fallidos** (`usuario.bloqueado_hasta`) se autodesbloquea solo a los
    15 minutos (`entorno.minutosBloqueo`), para cualquier rol, incluida Administración. No es un
    callejón sin salida.
  - Una **contraseña olvidada** (no solo bloqueada) sí lo es hoy si Administración es la única
    cuenta con `USUARIO_GESTIONAR`: `POST /api/auth/cambiar-contrasena` exige la contraseña actual
    (no sirve si se olvidó) y el enlace de restablecimiento solo lo genera otra cuenta con ese
    permiso. En el seed de la demostración (`scripts/sembrar-demo.js`) y en el diseño general no
    hay ninguna obligación de tener más de una cuenta ADMINISTRADOR: hoy existe exactamente una
    (`koto`). Si esa cuenta queda sin acceso, nadie dentro de la aplicación puede generarle un
    enlace.
  - **Perder el teléfono con MFA (Funcionalidad 5) es el mismo problema, un nivel más adentro:**
    `POST /api/usuarios/:id/mfa/desactivar` sí permite que Administración desactive el MFA de
    **otra** cuenta sin pedirle nada a esa persona — pero si la propia Administración es quien
    perdió el teléfono, necesita pasar primero el segundo factor para llegar a usar esa misma
    función sobre su propia cuenta, y no puede. Con una sola cuenta ADMINISTRADOR, perder el
    teléfono (incluso con la contraseña intacta) deja exactamente en el mismo callejón sin salida
    que olvidar la contraseña.
  - La única vía que existe hoy fuera de la aplicación, para cualquiera de los dos casos, es que
    alguien con acceso directo al servidor y a las credenciales de `.env`
    (`SST_PG_PROPIETARIO_URL`) edite la fila a mano con SQL. Funciona, pero no queda en la
    bitácora, no respeta la política de contraseñas, y depende de que esa persona escriba el SQL
    correcto — es exactamente lo que no se quiere dejar como único camino.
- **Propuesta (NO implementada; pendiente de confirmación del equipo antes de tocar código):**
  1. **Práctica inmediata, sin código:** mantener siempre al menos dos cuentas ADMINISTRADOR
     activas. Con eso, el mecanismo que ya existe (Funcionalidad 4) resuelve el caso común: una le
     genera el enlace a la otra. No resuelve el caso en que las dos pierdan el acceso a la vez.
  2. **Red de seguridad técnica, para ese caso catastrófico:** un script nuevo,
     `scripts/db/recuperar-acceso-emergencia.js`, que se ejecuta solo en el servidor (nunca por
     HTTP, nunca alcanzable desde la red) con las credenciales de `sst_propietario` de `.env` — el
     mismo nivel de confianza que ya tienen `scripts/db/limpiar-trabajos-prueba.js` o
     `scripts/db/reiniciar-base-postgres.js`, no uno nuevo. Recibiría el correo de la cuenta y qué
     recuperar, por ejemplo:
     - `--contrasena`: reutiliza EXACTAMENTE el mismo mecanismo de la Funcionalidad 4 (token de un
       solo uso, solo su hash guardado, vencimiento de 30 minutos, la misma política de contraseña
       al consumirlo), registrado como `RESTABLECIMIENTO_GENERADO_EMERGENCIA`.
     - `--mfa`: reutiliza EXACTAMENTE el mismo UPDATE que ya usa
       `POST /api/usuarios/:id/mfa/desactivar` (desactivar, borrar el secreto), registrado como
       `MFA_DESACTIVADO_EMERGENCIA`.
     Ambas opciones exigen `--si` para ejecutarse, igual que los demás scripts que cambian datos, y
     se pueden usar juntas (por ejemplo, si se perdieron las dos cosas a la vez). En los dos casos,
     el registro queda sin ningún administrador asociado, para que al revisar el historial se note
     con claridad que no lo hizo ninguna cuenta desde la pantalla, sino alguien con acceso directo
     al servidor: el evento de bitácora de `--mfa` queda sin `usuario`, y para `--contrasena` haría
     falta un cambio chico de esquema (`restablecimiento_contrasena.creado_por` es hoy
     `NOT NULL`; tendría que admitir `NULL` para este único caso, cosa que no se tocó todavía
     porque es justo el tipo de cambio que se documenta aquí antes de hacerlo, no después).
  - **Por qué esto no es una puerta trasera ni una cuenta con clave fija:** no agrega ninguna ruta
    nueva alcanzable por la red, no crea ninguna cuenta ni contraseña fija, no evita la política de
    contraseñas, y cada uso queda en la bitácora. El nivel de acceso que necesita (el archivo
    `.env` real, en el servidor) es el mismo que ya se necesita hoy para la vía no oficial (editar
    la fila a mano con SQL); la diferencia es que esta vía queda auditada y es segura por diseño,
    en vez de depender de que alguien escriba el SQL correcto a mano.
  - **Alternativa considerada y descartada por ahora:** códigos de recuperación de un solo uso
    generados al crear cada cuenta ADMINISTRADOR (como Google o GitHub). Se descartó por ahora
    porque agrega bastante más superficie para un proyecto de este tamaño (mostrarlos una sola vez
    al crearse la cuenta, guardarlos hasheados, pantalla para regenerarlos, qué pasa si también se
    pierden); el script de emergencia cubre el mismo caso con mucho menos código.
- **Estado:** documentado y a la espera de la decisión del equipo. No se creó ningún archivo ni se
  tocó código para esto todavía.

### 2. CSP: se agregó `img-src 'self' data:` para el código QR del MFA

- **Qué cambió:** `src/app.js` configura `helmet` con una Política de Seguridad de Contenido
  (CSP) explícita. Antes no declaraba `img-src`, así que las imágenes caían en el valor por
  defecto `default-src 'self'` (solo imágenes del propio origen, nunca `data:`). Al agregar la
  Funcionalidad 5 (MFA), el código QR de activación se genera en el servidor como una imagen
  `data:image/png;base64,...` incrustada directamente en la respuesta JSON (librería `qrcode`,
  sin subir ni servir ningún archivo) y el navegador la bloqueaba. Se agregó
  `imgSrc: ["'self'", 'data:']` a las directivas existentes.
- **Por qué es seguro ampliarlo así:** `data:` en `img-src` (y solo ahí, no en `script-src` ni en
  ninguna otra directiva, que seguirían bloqueando `data:`) no abre ninguna puerta para ejecutar
  código: una imagen incrustada no puede ejecutar JavaScript ni cargar ningún recurso externo. El
  QR nunca llega desde el usuario ni desde ningún tercero, lo genera el propio servidor a partir
  del secreto recién creado; no hay manera de que algo que no sea una imagen PNG de verdad llegue
  por esa vía.
- **Dónde se usa:** `web/js/pantallas/cuenta.js`, el `<img>` del paso "Activar verificación en dos
  pasos".
- **Cómo se encontró:** revisando el código antes de probarlo en el navegador (no al revés): al
  escribir el `<img src="data:...">`, se revisó la CSP existente y se notó que `img-src` no estaba
  declarado, así que heredaba el valor por defecto sin `data:`. El recorrido real en navegador
  (Playwright) confirmó después que el QR se ve correctamente con el cambio.

### 3. `etapa_trabajo.id_responsable` ahora se escribe al tomar la etapa, no solo al completarla

- **Qué decía el diseño original:** según el Informe 2, `id_responsable` queda vacío hasta que la
  etapa se completa (recién ahí se registra quién la hizo).
- **Qué cambió y por qué (punto 3 de la revisión del equipo, 18-11-2026, con captura real):** se
  detectó que, con el diseño original, cualquier operario del área podía completar una etapa que
  nunca había tomado — no había ninguna forma de saber, mientras la etapa estaba en curso, si
  alguien ya la estaba trabajando. La corrección agrega un paso explícito, "Comenzar etapa"
  (`POST /trabajos/:codigo/etapas/:orden/comenzar`), que escribe `id_responsable` de inmediato, de
  forma atómica (dos operarios no pueden tomar la misma etapa a la vez: ver DEF-22). Como
  consecuencia, `id_responsable` deja de estar vacío mientras la etapa sigue en curso: queda
  escrito desde que alguien la toma, no solo cuando termina.
- **Impacto:** ninguna columna nueva (la columna ya existía, nullable, para este mismo propósito);
  cambia únicamente CUÁNDO se escribe. `completarEtapa()` ahora exige que quien completa sea quien
  la tomó (salvo Producción, que puede completar cualquiera sin haberla tomado).
- **Propuesta NO implementada, a la espera de decisión del equipo:** asignación explícita por
  Producción (elegir de antemano qué operario hace cada etapa, en vez de que cualquiera del área
  la tome por su cuenta). Se descartó implementarla ahora porque agrega una pantalla y una decisión
  de negocio nueva (¿qué pasa si la persona asignada no está disponible? ¿puede reasignarse?) que
  el equipo no pidió todavía; el mecanismo de "Comenzar etapa" ya resuelve el problema concreto que
  se reportó (no saber quién la está haciendo) con mucho menos alcance.
- **Verificación:** CP-74 (concurrencia real, `Promise.all`, verificado 3 veces seguidas sin
  fallar) y CP-75. Detalle completo en `evidencias/defectos.md`, DEF-22.

**Actualización, punto B de la revisión del equipo (19-11-2026): liberar una etapa abandonada.**
- **Qué faltaba:** "Comenzar etapa" resolvía quién la está trabajando, pero no qué pasa si esa
  persona la abandona (se fue, se equivocó de etapa, quedó bloqueada): antes de esta actualización,
  nadie más podía tomarla ni completarla, y quedaba trabada hasta tocar la base de datos a mano.
- **Qué se agregó:** `POST /trabajos/:codigo/etapas/:orden/liberar` (`liberarEtapa()` en
  `src/modulos/trabajos/servicioTrabajos.js`), que pone `id_responsable` de nuevo en `NULL` para que
  cualquiera del área pueda tomarla desde cero. Puede liberarla quien la tomó, Producción o
  Administración (permiso nuevo `ETAPA_LIBERAR`); ningún otro operario del área puede liberar la
  etapa de otra persona. Queda registrado en la bitácora (`ETAPA_LIBERADA`, con el id de quien la
  tenía antes).
- **Decisión de modelado — un único responsable por etapa:** el sistema sigue modelando "quién la
  tiene ahora" como una sola persona (una columna `id_responsable`, no una lista de colaboradores).
  Liberar una etapa no "reparte" ni conserva el trabajo ya avanzado: dos personas no pueden figurar
  como responsables a la vez, y liberar + volver a tomar reinicia quién aparece como responsable
  (no el progreso real del trabajo físico, que nadie registra en este sistema etapa por etapa, solo
  al completarla). Esta es una limitación conocida y deliberada, no un olvido: una etapa hecha entre
  dos personas, o por turnos, se sigue viendo como si la hubiera hecho una sola. La asignación
  explícita por Producción (propuesta no implementada, arriba) tampoco resolvería esto sin agregar
  ese mismo concepto de "varios responsables", que el equipo no ha pedido.
- **Datos de demostración existentes (anteriores a "Comenzar etapa"):** las etapas `EN_CURSO` que ya
  existían en la base antes de este cambio (sembradas por `scripts/sembrar-demo.js` antes de hoy)
  tienen `id_responsable` en `NULL` porque la columna siempre fue nullable y nunca se completó un
  backfill: se comportan exactamente igual que una etapa recién activada sin tomar (cualquiera del
  área puede tomarla con "Comenzar etapa"; Producción puede completarla directo). No se necesitó
  ninguna migración de datos.
- **Verificación:** CP-81, CP-82 y CP-83 (`tests/integracion/comenzarEtapa.test.js`): no se puede
  liberar una etapa que nadie tomó, un operario ajeno no puede liberar la de otro, quien la tomó (o
  Producción) sí puede, y queda de verdad disponible para cualquiera después. Detalle en
  `evidencias/defectos.md`, DEF-25.

### 4. Alta de usuarios: Administración ya no fija ninguna contraseña (primer acceso por enlace)

- **Qué decía el diseño original:** "Crear cuenta" incluía un campo de contraseña inicial que
  Administración completaba y entregaba "en mano" a la persona.
- **Qué cambió y por qué (punto 7 de la revisión del equipo, 19-11-2026):** Administración no debe
  conocer la contraseña de nadie. `POST /api/usuarios` ya no acepta ningún campo de contraseña (se
  rechaza con 400 si se envía); el servidor genera una aleatoria que nadie ve ni necesita conocer, y
  entrega de inmediato un enlace de primer acceso, reutilizando tal cual el mecanismo de
  restablecimiento de la Funcionalidad 4 (mismo token de un solo uso con vencimiento, misma pantalla
  "Crear una contraseña nueva", mismo diálogo con "Copiar enlace" en "Usuarios").
- **Impacto:** el formulario de "Crear cuenta" pierde el campo de contraseña; a cambio, al crear la
  cuenta se abre el mismo diálogo que ya existía para "Generar enlace" en una cuenta existente. No
  se agregó ninguna tabla ni mecanismo nuevo.
- **De paso, URL base configurable (segunda mitad del punto 7):** el enlace completo (de primer
  acceso o de un restablecimiento posterior) ahora lo arma el servidor con su propia URL base
  (`entorno.urlBase`, variable de entorno `SST_URL_BASE`; por defecto `http://localhost:<puerto>`),
  no el navegador de Administración con `location.origin`. Antes, si Administración generaba el
  enlace mirando la pantalla desde una URL que no es la pública (por ejemplo, "localhost" en
  desarrollo, o una IP interna), el enlace quedaba armado con ESA URL y no le servía a quien lo
  recibía. Ver `.env.example` (`SST_URL_BASE`).
- **Compatibilidad interna:** `usuarios.crear()` sigue aceptando una contraseña conocida como
  parámetro interno opcional, usada solo por `scripts/sembrar-demo.js` y por
  `tests/contexto.js` (necesitan credenciales deterministas para la demostración y para iniciar
  sesión directo en las pruebas, sin pasar por un enlace); la ruta HTTP real nunca envía ese campo.
- **Verificación:** CP-73 (reescrita) y CP-90 (`tests/integracion/usuariosListado.test.js`), y de
  punta a punta con un navegador real contra el entorno aislado. Detalle en
  `evidencias/defectos.md`, DEF-33.

### 5. Cobertura de pruebas al cerrar los puntos 1 a 9 (19-11-2026)

Corrida completa (`npm run pruebas`, Istanbul/Jest) tras terminar toda la Prioridad 1 de la
revisión del equipo: **90/90 pruebas, 17 suites**, 94,82 % statements, 80,72 % branches, 95,54 %
functions, 98,17 % lines.

Dos archivos quedan con huecos genuinos, documentados aquí en vez de forzar una prueba artificial
solo para subir el número (mismo criterio que la sección 7 de la Fase 0):

- **`src/config/entorno.js` (0 %, función `cargarEntorno()` completa):** hueco **anterior** a esta
  sesión, ya explicado en la Fase 0 — cada prueba arma su propio objeto `entorno` a mano en vez de
  llamar a `cargarEntorno()`. La línea nueva de este punto (`urlBase`) queda dentro de ese mismo
  hueco ya aceptado, no agrega uno nuevo.
- **`src/version.js` línea 13 (83,33 %), el `catch` de `calcularVersion()`:** la rama que se usa
  cuando `git` no está disponible (`arranque-${Date.now()}`) nunca se activa en este entorno,
  porque aquí `git` sí está disponible. Forzarla exigiría simular que `execSync` falla, lo que
  terminaría probando el simulador en vez del código real (mismo motivo por el que la Fase 0 dejó
  sin forzar el `catch` del `ROLLBACK` fallido en `postgres.js`). Queda como limitación conocida.
