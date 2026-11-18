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

- **Materiales:** ✅ terminado. `POST /api/trabajos/:codigo/materiales` (solo Producción,
  permiso `MATERIAL_REGISTRAR`), con pantalla en el detalle del trabajo, pruebas CP-49 a CP-51 y
  PM-09. En el camino se encontraron y corrigieron dos defectos reales al probar contra la base
  real (no solo con las pruebas de Jest): DEF-08 (`src/servidor.js` seguía usando el nombre de
  campo de PGlite y el servidor real nunca arrancaba desde la Fase 0) y DEF-09 (`sst_app` no tenía
  permiso de escritura sobre `trabajo_material`). Detalle en `evidencias/defectos.md` y
  `evidencias/fase1_materiales.txt`.
- **Riesgo abierto (de DEF-09):** las pruebas de Jest corren con el rol dueño del esquema, no con
  `sst_app`, así que no pueden detectar un permiso real que falte en una tabla nueva. Revisar en
  las Fases 3-4 si conviene que `tests/contexto.js` use `sst_app` para las operaciones de la
  aplicación.
- **Archivos reales (GridFS):** ✅ terminado. El archivo completo (no solo su cabecera) se guarda
  en GridFS (bucket `disenos`, dentro de `sst_kotoduo`); Producción puede verlo/descargarlo desde
  la pantalla de aprobación antes de decidir (`GET /api/disenos/:idDiseno/archivos/:idArchivo`,
  permiso `DISENO_VER`, verificando que el archivo pedido pertenezca de verdad a ese diseño). Si
  algo falla después de subir el archivo (trabajo no encontrado, fallo de MongoDB), el archivo
  subido se borra para no dejar huérfanos. Pruebas CP-52 a CP-54 y PM-10. En el camino se encontró
  y corrigió DEF-10 (`detalle()` no traía `idDiseno` en la respuesta: el enlace nuevo quedaba roto
  hasta agregar el alias que faltaba). Detalle en `evidencias/defectos.md` y
  `evidencias/fase1_archivos_diseno.txt`.
- **Aviso del equipo (prioridad absoluta) — DEF-11:** el equipo reprodujo un fallo real al enviar
  una propuesta ("Datos de entrada inválidos"). Se encontraron y corrigieron dos defectos reales:
  nombres de archivo con símbolos comunes (`#`, `&`, etc.) se rechazaban por una lista blanca
  demasiado estricta, y un cuerpo con la forma anterior a GridFS ahora avisa recargar la página en
  vez de solo mostrar el mensaje genérico. El equipo confirmó DEF-11 corregido en su propia
  máquina. Detalle en `evidencias/defectos.md` y `evidencias/fase1_def11.txt`.
- **Service worker (hallazgo adicional sobre DEF-11):** `web/sw.js` cacheaba los archivos
  estáticos con "cache-first" (JavaScript viejo podía quedar servido para siempre). Corregido a
  "network-first" con purga de la caché vieja.
- **DEF-12 (investigado, no reproducido):** el equipo reportó propuestas/trabajos repetidos en las
  bandejas. Se auditó el código de cada consulta de lista de la aplicación (ninguna puede
  duplicar filas) y se probó en vivo sin reproducir el fallo; se agregaron pruebas de regresión
  (CP-57, CP-58) que lo detectarían si ocurre de verdad. Detalle en `evidencias/defectos.md`.
- **Etapa 2 (en curso) — "Ver archivo" con vista previa:** la pantalla de aprobación ahora muestra
  cada archivo en una tarjeta con un botón claro ("📄 Ver archivo completo") y una vista previa
  real en la misma pantalla (`<img>` para PNG/JPG, `<iframe>` para PDF), verificado con Playwright
  contra el servidor real. Falta el resto de la Etapa 2: asteriscos de campo obligatorio,
  ejemplos visibles por campo, y traducir los errores del servidor a mensajes por campo en TODAS
  las pantallas (hoy solo se corrigió el caso puntual de "página desactualizada" en DEF-11).
- **Base de demostración:** se agregó `scripts/db/mongo-limpiar-demo.js` para vaciar las
  colecciones de MongoDB de la demostración sin tocar usuarios ni roles. Procedimiento completo de
  limpieza (Postgres + Mongo) documentado en `evidencias/fase1_def12_y_ux.txt`.
- **MFA (TOTP):** no empezado. Solo existe la columna `mfa_habilitado` en `usuario`
  (`src/db/esquema.sql`), siempre en `FALSE`; no hay ninguna lógica de TOTP en `src/`.
- **Restablecimiento de contraseña:** no empezado. No existe ningún endpoint ni servicio para esto;
  hoy solo existe el cambio de contraseña estando con la sesión abierta
  (`POST /api/auth/cambiar-contrasena`).
- **Cierre de sesión por inactividad:** no empezado. Hoy la sesión expira por un tiempo fijo
  (`minutosAcceso`, `horasSesion`), no por inactividad.
- **Matriz HU-pantalla-endpoint:** no existe. No hay ningún documento de trazabilidad entre
  historias de usuario, pantallas y endpoints en el repositorio.
- **Pruebas manuales (PM):** `web/PRUEBAS_MANUALES.md` ya tiene PM-09 (materiales) y PM-10
  (archivos reales). Faltan las de MFA, restablecimiento de contraseña, cierre por inactividad y
  la matriz HU-pantalla-endpoint, a medida que se implementen.

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
