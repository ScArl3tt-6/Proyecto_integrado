# Plan de fases — SST Kotoduo

Reconstruido el 17-11-2026 porque el documento original (`PROMPTS_FASES.md`) solo se compartió por
chat en una sesión anterior y no quedó guardado como archivo del repositorio. Este documento recoge
el cronograma que el equipo dio de nuevo, más el estado real de cada fase verificado contra el
código y las pruebas (no se repite nada "de memoria" sin comprobarlo). Se debe actualizar al cierre
de cada fase, no reescribir desde cero.

## Cronograma

| Fechas | Fase | Tema | Estado al 17-11-2026 |
|---|---|---|---|
| 14 al 16 de noviembre | Fase 0 | PostgreSQL y MongoDB reales | ✅ Terminada y verificada |
| 16 al 19 de noviembre | Fase 1 | Materiales, archivos reales, MFA, restablecimiento | 🔶 En curso |
| 18 al 21 de noviembre | Fase 2 | Rediseño con la marca Kotoduo | ⬜ No iniciada |
| 20 al 24 de noviembre | Fases 3 y 4 | Pruebas ejecutadas, documentación, respaldo | ⬜ No iniciada |
| 24 al 26 de noviembre | Cierre | Informe, guion de la demo y ensayo de preguntas | ⬜ No iniciada |

## Fase 0 — PostgreSQL y MongoDB reales (terminada)

- Migración de PGlite y Mongo sin autenticación a PostgreSQL 16 real y MongoDB con autenticación,
  con roles de mínimo privilegio en ambos motores.
- 47 pruebas automáticas pasando contra los motores reales; `npm run verificar` en 12/12 OK.
- Evidencias de integridad y de índices en `evidencias/`.
- Flujo de GitHub Actions corregido (DEF-05) para que corra con un PostgreSQL real de CI.
- Detalle completo en `docs/CAMBIOS_RESPECTO_AL_DISENO.md`, `evidencias/defectos.md` (DEF-01 a
  DEF-05) y `docs/BITACORA_DE_SESIONES.md`.
- Rama: `feature/bases-reales`, PR #1 abierto, sin fusionar a `main` todavía.

## Fase 1 — Materiales, archivos reales, MFA, restablecimiento (en curso)

Estado real de cada punto, revisado directamente en el código (no por memoria):

- **Materiales:** parcial. Existe la tabla `trabajo_material` y el endpoint de solo lectura
  `GET /api/trabajos/:codigo/materiales` (probado en CP-31). **Falta** el endpoint para asociar o
  registrar materiales a un trabajo (hoy solo se puede insertar esa fila a mano por SQL, como hace
  la propia prueba).
- **Archivos reales (GridFS):** no empezado. Hoy `src/dominio/archivosDiseno.js` solo valida la
  firma, el tamaño y el nombre del archivo recibido; ni el archivo ni su contenido se guardan en
  ningún lado (ni GridFS ni disco). Falta el almacenamiento real.
- **MFA (TOTP):** no empezado. Solo existe la columna `mfa_habilitado` en `usuario`
  (`src/db/esquema.sql`), siempre en `FALSE`; no hay ninguna lógica de TOTP en `src/`.
- **Restablecimiento de contraseña:** no empezado. No existe ningún endpoint ni servicio para esto;
  hoy solo existe el cambio de contraseña estando con la sesión abierta
  (`POST /api/auth/cambiar-contrasena`).
- **Cierre de sesión por inactividad:** no empezado. Hoy la sesión expira por un tiempo fijo
  (`minutosAcceso`, `horasSesion`), no por inactividad.
- **Matriz HU-pantalla-endpoint:** no existe. No hay ningún documento de trazabilidad entre
  historias de usuario, pantallas y endpoints en el repositorio.
- **Pruebas manuales (PM):** `web/PRUEBAS_MANUALES.md` solo llega hasta PM-08. Las PM-09 a PM-14
  (presumiblemente para los temas nuevos de esta fase: materiales, archivos, MFA, restablecimiento,
  inactividad) todavía no están escritas.

## Fase 2 — Rediseño con la marca Kotoduo (no iniciada)

- Aplicar la identidad visual de Kotoduo en todo el front-end (hoy solo se definió la regla de
  `CLAUDE.md`: logo completo solo sobre fondo oscuro, emblema sobre fondo claro).
- Pendiente de detallar con el equipo: paleta de marca definitiva, tipografía, y qué pantallas
  cambian primero.

## Fases 3 y 4 — Pruebas ejecutadas, documentación, respaldo (no iniciada)

- Ejecutar y dejar evidencia de la batería de pruebas completa (automáticas + manuales PM-01 a
  PM-14) sobre el sistema ya con la Fase 1 y la Fase 2 terminadas.
- Completar la documentación final del proyecto y dejar un respaldo (backup) de bases de datos y
  código.

## Cierre — Informe, guion de la demo y ensayo de preguntas (no iniciada)

- Redactar el informe final del proyecto.
- Preparar el guion de la demostración en vivo.
- Ensayar las preguntas esperadas de la defensa/evaluación.

---

**Nota:** las fases 1 y 2 se traslapan en el cronograma (16–19 y 18–21 de noviembre), así que
conviene que el equipo decida ahora qué integrante avanza en cuál para no bloquearse entre sí.
