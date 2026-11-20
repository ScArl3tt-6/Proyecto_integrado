# Bitácora de sesiones

Una entrada por cada sesión de trabajo con Claude Code, de la más reciente a la más antigua.
No se borran entradas anteriores aunque algo se corrija después.

---

## 16 al 18-11-2026 — Fase 1: materiales, archivos reales, restablecimiento, cierre por inactividad, MFA

- **Participantes:** Catalina Quezada, Génesis Quezada. (Malia Cabrera tiene la invitación como
  colaboradora de GitHub, pero sus commits no llevan todavía su línea `Co-authored-by` porque aún
  no confirma un correo válido; su usuario de GitHub es `estudmaliacabrerab-dotcom`.)
- **Objetivo:** terminar la Fase 1 completa (`docs/PLAN_FASES.md`): materiales, archivos reales de
  diseño (GridFS), y las cuatro funcionalidades de seguridad pendientes (cierre por inactividad,
  restablecimiento de contraseña, MFA, matriz de trazabilidad), más una auditoría honesta de UX de
  los 5 perfiles.
- **Qué se hizo (resumen; el detalle completo está en los documentos citados):**
  - **Materiales** (RF-08) y **archivos reales en GridFS** (RF-02), ambos terminados y probados.
  - **Crisis DEF-11:** el equipo reportó "Datos de entrada inválidos" con un caso real; se
    reprodujo con navegador real, se encontraron dos causas reales distintas (nombres de archivo
    con símbolos comunes rechazados por una lista blanca muy estricta, y un cuerpo con la forma
    anterior a GridFS sin aviso claro de recargar la página) y se corrigieron ambas.
  - **Etapa 2 y Parte B/C del equipo:** asteriscos y ejemplos por campo (más tarde revertido, ver
    abajo), vista previa real de archivos antes de aprobar/rechazar, contador/búsqueda/orden/
    paginación en listas, y una auditoría de UX completa de los 5 perfiles con tabla de hallazgos
    (`docs/REVISION_EXPERIENCIA_USUARIO.md`), que encontró y corrigió DEF-13 a DEF-20 (botones con
    forma de enlace subrayados, falta de paginación, contraste insuficiente en dos lugares,
    etiquetas sin asociar a su campo, placeholder cortado, flecha de un select tapando texto,
    paginador sin espacio).
  - **Incidente de proceso y de datos (importante, documentado en `evidencias/defectos.md`):** se
    detectaron y corrigieron varios servidores de demostración reales sin cerrar (el conteo de la
    bitácora real derivaba) y, en dos rondas, 22 trabajos de prueba de esta misma sesión que habían
    quedado en la base real (`KT-2026-0007` a `0009`, `0018` a `0028`, y luego `0010` a `0017` —
    este último grupo incluía el código que el equipo creía que era un trabajo real). Se
    verificaron 0 huérfanos en Mongo tras borrar ambos grupos. De esto salieron reglas nuevas de
    proceso, adoptadas desde entonces: toda prueba con navegador va al entorno aislado
    (`scripts/entorno-efimero.js`, nuevo), nunca a `npm run demo`; cerrar siempre todos los
    procesos iniciados; ninguna acción irreversible sin una orden explícita en el mismo mensaje.
  - **Funcionalidad 3 — cierre de sesión por inactividad:** antes solo existía un temporizador en
    el cliente que avisaba pero no cerraba nada en el servidor. Ahora `sesion.ultima_actividad` se
    actualiza en cada solicitud autenticada real (nunca al renovar el token) y el servidor revoca
    la sesión sola a los 30 minutos sin actividad real.
  - **Funcionalidad 4 — restablecimiento de contraseña:** como no hay correo en este prototipo,
    Administración genera un enlace de un solo uso desde "Usuarios"; quien lo recibe lo usa sin
    sesión para crear una contraseña nueva. El equipo preguntó qué pasa si Administración misma
    pierde el acceso: documentado y propuesto (script de emergencia, solo en el servidor, sin
    implementar) en `docs/CAMBIOS_RESPECTO_AL_DISENO.md`.
  - **Funcionalidad 5 — MFA por TOTP:** activación en dos pasos con código QR (secreto estable
    mientras no se confirme ni se cancele), segundo paso real al ingresar, desactivación propia
    (con contraseña) o por Administración (sin ella, para quien perdió el teléfono). Verificado
    contra los 18 vectores oficiales del RFC 6238 y contra dos implementaciones independientes
    (66/66 coinciden); confirmado además por el equipo con un teléfono real.
  - **Revisión de textos y formularios:** inventario completo de mensajes visibles al usuario
    (`docs/TEXTOS_DE_LA_APLICACION.md`, pendiente de que el equipo lo revise); se quitó el
    asterisco de "obligatorio" de toda la aplicación (no todo el mundo conoce esa convención) a
    favor de marcar solo lo opcional y mostrar un mensaje junto al campo cuando falta uno
    obligatorio; se corrigió un defecto real de espaciado (DEF-21, títulos pegados a la sección
    anterior) encontrado en el barrido a 390 px.
- **Commits generados (rama `feature/funcionalidad-completa`, sin push):** `ceecb11`, `bd64a6c`,
  `d56e017`, `10f2907`, `e9a5792`, `6ce5907`, `d6f8d8d`, `7a6f7b7`, `f551347`, `a57d4fe`, `598de31`,
  `4c8df44`, `b8b30c7`, `2719259`, `2ad6302`, `08e5c4f`, `6d2599b`, `6368be0`, `5137151`, `54e2464`,
  `b17602b` (20 commits; el mensaje de cada uno describe su propio cambio en detalle).
- **Decisiones tomadas:**
  - MFA, por ahora, solo para Administración y Producción (los roles con las acciones más
    sensibles), y de forma opcional, no obligatoria — discrepancia reportada si el Informe 2 la
    exige obligatoria; propuesta sin implementar.
  - El secreto TOTP se guarda en claro (no cifrado): hace falta poder recalcular el código, no solo
    compararlo; la protección es el acceso a la base, igual que la contraseña.
  - Ningún script de recuperación de emergencia (contraseña o MFA de Administración) se implementó
    todavía: queda documentado como propuesta, a la espera de confirmación del equipo.
- **Pendiente para la próxima sesión:**
  - Terminar la Funcionalidad 6 (matriz HU-pantalla-endpoint) — en curso al cerrar esta entrada.
  - Decidir si se implementa el script de recuperación de emergencia de Administración
    (`docs/CAMBIOS_RESPECTO_AL_DISENO.md`, Fase 1 punto 1) y si se exige el MFA en vez de dejarlo
    opcional.
  - Revisar y aprobar (o ajustar) `docs/TEXTOS_DE_LA_APLICACION.md` antes de aplicar los cambios de
    texto propuestos.
  - Conseguir el correo real de Malia Cabrera para agregar su línea de coautoría a los commits.
  - Fase 2 (rediseño con la paleta de Kotoduo): repetir la medición de contraste con herramienta y
    el recorrido de celular una vez aplicada la nueva paleta (ver memoria del equipo).

## 14 y 15-11-2026 — Fase 0: bases de datos reales y entorno reproducible

- **Participantes:** Catalina Quezada, Genesis Quezada.
- **Objetivo:** pasar de PGlite (PostgreSQL embebido) y MongoDB sin autenticación a motores
  reales, con roles de mínimo privilegio, pruebas automáticas contra esos motores reales, y la
  documentación y evidencias correspondientes (Fase 0 de `PROMPTS_FASES.md`).
- **Qué se hizo:**
  - Se instaló `pg` y se quitó `@electric-sql/pglite`. Se reescribió `src/db/postgres.js` con un
    `Pool` real, manteniendo la misma interfaz que usaban los servicios.
  - Se creó `scripts/db/crear-base-postgres.js`: pide la contraseña del superusuario `postgres`
    por consola oculta (nunca por chat), crea la base `sst_kotoduo` y los roles `sst_propietario`,
    `sst_app` y `sst_pruebas` con privilegios mínimos. `scripts/db/reiniciar-base-postgres.js`
    permite reiniciar todo en desarrollo.
  - Se creó `scripts/db/mongo-iniciar.js` y `scripts/db/mongo-crear-usuarios.js`: MongoDB pasa a
    correr con `--auth`, con las cuentas `sst_admin`, `sst_app` y `sst_pruebas`.
  - Se reescribió `tests/contexto.js` para crear y destruir una base PostgreSQL real y temporal
    por cada suite de pruebas (antes usaba PGlite en memoria).
  - Se creó `scripts/verificar-entorno.js` (`npm run verificar`): confirma versiones, conexión con
    el rol de aplicación, mínimo privilegio y un ciclo real de escritura/lectura/limpieza.
  - Se adaptó `rendimiento/evidenciaBases.js` (ya corría contra el nuevo `tests/contexto.js` sin
    cambios de código) y se creó `rendimiento/indices.js` (comparación con y sin índices, con 5000
    trabajos sintéticos).
  - Se agregaron las pruebas CP-47 y CP-48 (`tests/integracion/baseRelacional.test.js`) y se
    amplió CP-31 para cubrir partes de `src/db/postgres.js` que habían quedado sin probar.
  - Se escribió `docs/VER_LAS_BASES_DE_DATOS.md` (cómo conectarse con pgAdmin 4 y MongoDB Compass)
    y `docs/CAMBIOS_RESPECTO_AL_DISENO.md` (motor de base de datos, variables de entorno, roles,
    privilegios mínimos, por qué cambió la cobertura de pruebas).
  - Se encontraron y corrigieron 4 defectos reales durante la propia preparación del entorno
    (`evidencias/defectos.md`, DEF-01 a DEF-04): un falso positivo al detectar si MongoDB ya tenía
    usuarios, el orden de creación de esos usuarios, que `readWriteAnyDatabase` no incluye
    `dropDatabase`, y que las pruebas no cargaban `.env`.
- **Commits generados (rama `feature/bases-reales`, sin push):**
  1. `6388e89` — Adapta la conexión a PostgreSQL real y la configuración del entorno.
  2. `7568cfa` — Agrega los scripts de preparación de PostgreSQL y MongoDB reales.
  3. `9ceebbc` — Agrega pruebas y evidencias de la migración a bases de datos reales.
  4. (este commit) — Documentación.
  Más un commit previo (`257a9a3`) de la sesión anterior, con `CLAUDE.md` y el logo.
- **Decisiones tomadas:**
  - Tres roles de PostgreSQL en vez de uno (`sst_propietario`, `sst_app`, `sst_pruebas`), para que
    la contraseña del superusuario `postgres` se use una sola vez y nunca se guarde en ningún
    archivo del proyecto.
  - `sst_pruebas` de MongoDB necesita `readWriteAnyDatabase` **y** `dbAdminAnyDatabase` (no solo
    el primero), porque `dropDatabase` pertenece al segundo.
  - El logo completo de Kotoduo solo se usa sobre fondo oscuro; sobre fondo claro, solo el
    emblema (se pedirá a Kotoduo una versión con texto oscuro para fondos claros).
- **Pendiente para la próxima sesión:**
  - Pedir a Kotoduo una versión del logo con el texto en color oscuro, para usar sobre fondos
    claros (hoy solo se usa el logo completo sobre fondo oscuro).
  - Transcribir los incidentes INC-01 a INC-05 del Informe 2 a `evidencias/defectos.md` (esta
    sesión no tenía ese informe cargado para copiarlos).
  - Catalina debe hacer el `push` de la rama `feature/bases-reales` desde su propia cuenta, y
    alguna integrante distinta de quien programó debe revisar la solicitud de incorporación.
  - Seguir con la Fase 1 (completar la funcionalidad: materiales, archivos de diseño reales, MFA,
    restablecimiento de contraseña, cierre por inactividad) cuando el equipo decida continuar.
