# Bitácora de sesiones

Una entrada por cada sesión de trabajo con Claude Code, de la más reciente a la más antigua.
No se borran entradas anteriores aunque algo se corrija después.

---

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
