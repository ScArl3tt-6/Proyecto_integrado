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
| 16 al 19 de noviembre | Fase 1 | Materiales, archivos reales, MFA, restablecimiento | ✅ Terminada (18-11), con dos preguntas abiertas del equipo sin implementar (ver abajo) |
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

## Fase 1 — Materiales, archivos reales, MFA, restablecimiento (terminada, 18-11-2026)

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
- **Etapa 2 — "Ver archivo" con vista previa y formularios:** ✅ terminado. La pantalla de
  aprobación muestra cada archivo en una tarjeta con un botón claro ("📄 Ver archivo completo") y
  una vista previa real en la misma pantalla (`<img>` para PNG/JPG, `<iframe>` para PDF),
  verificado con Playwright contra el servidor real. Ejemplos visibles por campo y mensajes del
  servidor traducidos por campo (`describirErrorApi()`), aplicados en los 8 formularios reales.
  Revisión posterior del equipo: los campos obligatorios ya no se marcan con un asterisco (no
  todo el mundo conoce esa convención); ahora se marca lo opcional con "(opcional)" y un campo
  obligatorio vacío muestra su propio mensaje junto al campo (ver DEF-15, revisado, y DEF-21).
- **Base de demostración:** se agregó `scripts/db/mongo-limpiar-demo.js` para vaciar las
  colecciones de MongoDB de la demostración sin tocar usuarios ni roles. Procedimiento completo de
  limpieza (Postgres + Mongo) documentado en `evidencias/fase1_def12_y_ux.txt`.
- **MFA (TOTP):** ✅ terminado, para Administración y Producción (como ya anunciaba el texto de
  Ingreso). Se agregaron `usuario.mfa_secreto` (en claro: hace falta poder recalcular el código,
  no solo compararlo, a diferencia de la contraseña) y `usuario.mfa_ultimo_paso` (evita reutilizar
  el mismo código dos veces). Activación en dos pasos desde "Mi cuenta"
  (`POST /api/auth/mfa/iniciar` genera el secreto y un código QR —librería `qrcode`—, sin activar
  todavía; `POST /api/auth/mfa/confirmar` exige un código real para activarlo de verdad). El
  ingreso (`POST /api/auth/login`) ahora puede devolver `{ requiereMfa, desafio }` en vez de la
  sesión, cuando la cuenta tiene MFA; un segundo endpoint
  (`POST /api/auth/login/verificar`) consume ese "desafío" junto con el código y recién ahí crea la
  sesión real. Un código incorrecto en ese paso cuenta como el mismo intento fallido que una
  contraseña incorrecta (mismo contador, mismo bloqueo de 15 minutos). Desactivación propia exige
  la contraseña actual (`POST /api/auth/mfa/desactivar`); Administración puede desactivarlo sin
  ella para alguien que perdió el acceso a su aplicación de autenticación
  (`POST /api/usuarios/:id/mfa/desactivar`), con chip "2FA" visible en "Usuarios". El texto
  "Próximamente verificación en dos pasos" de Ingreso ya no existe: ahora es el segundo paso real
  del formulario. CSP: se agregó `imgSrc: ["'self'", 'data:']` para que el código QR (una imagen
  incrustada, generada en el servidor) se pueda mostrar. Pruebas CP-66 a CP-69 y PM-13; verificado
  con un recorrido real en navegador (activar con un código real calculado con la librería,
  ingresar con el segundo paso, un código incorrecto no deja pasar, y las dos vías de
  desactivación).
- **Restablecimiento de contraseña:** ✅ terminado. Como no hay infraestructura de correo en este
  prototipo, el camino real es: Administración genera un enlace de un solo uso desde «Usuarios» →
  «Generar enlace» (`POST /api/usuarios/:id/restablecimiento`, solo `USUARIO_GESTIONAR`) y se lo
  entrega a la persona por un canal que ya use con ella (en persona, chat, etc.). La persona lo abre
  sin sesión y fija una contraseña nueva en `#/restablecer/:token`
  (`POST /api/auth/restablecer`, público, limitado por IP). El token real nunca se guarda (solo su
  hash, igual que `sesion.hash_token`); vence en 30 minutos, sirve una sola vez, un enlace nuevo
  invalida cualquier otro sin usar de la misma cuenta, y al completarse revoca todas las sesiones
  activas y desbloquea la cuenta si estaba bloqueada por intentos fallidos. El texto "¿Olvidaste tu
  contraseña?" de Ingreso ahora explica este camino real en vez de solo remitir a Administración.
  Pruebas CP-62 a CP-65 y PM-12; se verificó a mano (no solo con Jest, que corre como el dueño del
  esquema) que `sst_app` tiene de verdad los permisos mínimos sobre la tabla nueva
  (`restablecimiento_contrasena`): INSERT, SELECT y UPDATE, sin DELETE — la misma comprobación que
  DEF-09 enseñó a no omitir.
  **Pregunta abierta del equipo (sin implementar, pendiente de confirmación):** qué pasa si
  Administración (único rol con permiso para generar enlaces) es quien queda sin acceso. Propuesta
  documentada en `docs/CAMBIOS_RESPECTO_AL_DISENO.md` (Fase 1, punto 1).
- **Cierre de sesión por inactividad:** ✅ terminado. Antes solo existía un temporizador en el
  cliente (JavaScript, 30 minutos) que avisaba de la inactividad pero no cerraba nada en el
  servidor: si el navegador seguía renovando el token de acceso solo, la sesión real podía durar
  hasta `horasSesion` (8 horas) sin ninguna actividad genuina. Ahora `sesion.ultima_actividad`
  (columna nueva) se actualiza en cada solicitud autenticada real (no en la renovación del token) y
  `autenticar` revoca la sesión en el servidor si pasó más de `entorno.minutosInactividad` (30
  minutos) desde la última; el aviso en pantalla distingue este caso («Tu sesión se cerró por
  inactividad. Ingresa de nuevo.») del de una sesión revocada o expirada por otra razón. Pruebas
  CP-60 y CP-61 y PM-11. El evento queda en la bitácora como `SESION_INACTIVIDAD`.
- **Matriz HU-pantalla-endpoint:** ✅ terminada (`docs/MATRIZ_HU_PANTALLA_ENDPOINT.md`). Construida
  leyendo directamente el código (14 pantallas reales, 35 endpoints reales), no de memoria; donde
  el Informe 2 no estaba cargado en esta sesión para citar la numeración oficial de HU, la columna
  describe el requisito en palabras en vez de inventar un número (el equipo debe cotejarla contra
  su copia real del informe). Al construirla se encontró un hueco real: `POST /api/usuarios`
  (crear cuenta) no tenía ninguna prueba automática contra la ruta HTTP real ni un PM propio; se
  cerró en el momento agregando CP-73 y PM-14. Estado final: 35/35 endpoints "Implementada", 0
  "Parcial", 0 "Pendiente".
- **Pruebas manuales (PM):** `web/PRUEBAS_MANUALES.md` tiene PM-01 a PM-14 completas.

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
