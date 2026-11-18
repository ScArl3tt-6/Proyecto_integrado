# Revisión de experiencia de usuario (Parte C)

Metodología: navegador real (Playwright), contra `scripts/entorno-efimero.js` (base de datos
propia y desechable, nunca la real), en 1280 px (escritorio) y 390 px (celular), con
`@axe-core/playwright` para medir accesibilidad (incluido el contraste de color) con una
herramienta real, no a simple vista. Cada hallazgo se registra como `DEF-nn` en
`evidencias/defectos.md`, sin borrarlo aunque se corrija. Esta valoración es de quien hizo la
revisión (Claude), no reemplaza la prueba del equipo: al final de cada perfil se dice
explícitamente qué se comprobó y qué no.

**Estado al cierre de esta sesión: recorrido completo de los 5 perfiles.** "Mi cuenta" (pantalla
común) se revisó parcialmente (ver su sección). Lo que quedó realmente sin verificar está anotado
al final, sin maquillarlo.

## Mapa de pantallas por perfil (verificado contra el código: `web/js/router.js` y
`web/js/permisos.js`, no por memoria)

| Perfil | Pantallas que puede ver |
|---|---|
| Vendedor | Mis solicitudes, Nueva solicitud, Detalle de un trabajo (el propio), Mi cuenta |
| Diseño | Bandeja de diseño, Enviar propuesta, Detalle de un trabajo (en diseño), Mi cuenta |
| Producción | Aprobaciones, Decidir propuesta, Panel general, Detalle de un trabajo (cualquiera), Mi cuenta |
| Operario | Mis actividades, Mi cuenta (NO tiene acceso a la pantalla genérica de detalle de un trabajo: ve materiales y medidas desde su propia pantalla) |
| Administrador | Panel general, Usuarios, Bitácora, Detalle de un trabajo (cualquiera), Mi cuenta |

Las 3 tareas principales del día a día que se usaron para medir cada perfil:

| Perfil | Tarea 1 | Tarea 2 | Tarea 3 |
|---|---|---|---|
| Vendedor | Crear una solicitud nueva | Ver el estado de mis solicitudes | Ver el detalle de una solicitud propia |
| Diseño | Tomar una solicitud nueva | Enviar una propuesta (archivo real) | Ver el motivo de un rechazo y reenviar |
| Producción | Decidir una propuesta pendiente | Ver el panel general | Registrar materiales / detener un trabajo |
| Operario | Ver qué etapa le toca hoy | Marcar una etapa como completada | Ver materiales y medidas antes de producir |
| Administrador | Ver el panel general | Gestionar un usuario | Revisar la bitácora de un trabajo |

---

## Operario (Luis) — recorrido completo

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Mis actividades | Ver qué etapa le toca hoy | Ninguno. 1 paso (iniciar sesión; es la pantalla de inicio del rol). Título claro, una tarjeta por trabajo, la etapa actual destacada, indica la siguiente etapa. | — | — | `revision_operario_actividades_*.png` |
| Mis actividades | Marcar una etapa como completada | Ninguno. 2 clics (botón + confirmar). Botón de 56 px de alto, ancho completo en celular. Confirmación específica (nombra la etapa actual y la siguiente). | — | — | `revision_operario_confirmar_390px.png` |
| Mis actividades | Ver materiales y medidas | Ninguno. 1 clic, se expande en la misma tarjeta, con estado "Cargando…" y mensaje claro si no hay materiales. | — | — | `revision_operario_materiales_390px.png` |
| Mis actividades | (general) | **DEF-14:** la lista no tenía paginación ni contador, aunque el servidor ya la admitía. | Media | Corregido: se agregó `pagina`/`limite` y el mismo `paginador()` ya usado en otras pantallas. | — |
| Mis actividades | (general) | Sin scroll horizontal en 390 px; menú de navegación inferior visible y usable en celular. | — | — | — |

**Qué se comprobó:** las 3 tareas completas, en 1280 px y 390 px, con navegador real, el texto
exacto de la confirmación, el tamaño real del botón principal, ausencia de errores de consola y
de scroll horizontal, y que la corrección de DEF-14 no rompió nada (se repitió el recorrido tras
el cambio).
**Qué NO se comprobó:** navegación con teclado en este perfil en particular (sí se verificó en
Producción y Vendedor, con el mismo patrón de componentes); medición de contraste con axe-core
específicamente en esta pantalla (si se midió en las demás, que comparten los mismos estilos, y
dio 0 violaciones tras DEF-16); un operario con más de una etapa en curso al mismo tiempo.
**Valoración:** buena para las 3 tareas principales.

---

## Vendedor (Jorge) — recorrido completo

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Nueva solicitud | Crear una solicitud nueva | **DEF-16** (contraste, ver abajo): 1 violación "serious" de axe-core en esta pantalla (la marca de la cabecera, no un campo del formulario). | Alta | Corregido (token de color nuevo, ver DEF-16). | `revision_vendedor_nueva_solicitud_*.png` |
| Nueva solicitud | Crear una solicitud nueva | Ninguno en el formulario en sí: 5 acciones (1 selección + 3 campos + 1 clic), mensaje de error específico y por campo antes de llamar a la API ("Selecciona un tipo de trabajo."). | — | — | — |
| Nueva solicitud | (teclado) | El `Tab` desde "Tipo" avanza correctamente a Descripción, Cantidad y Fecha; en el campo de fecha, el foco se queda ahí 2-3 veces (es el comportamiento normal de un `<input type="date">`, que tiene 3 segmentos internos — día, mes, año — cada uno con su propio `Tab`; no es un error). | — | — | — |
| Mis solicitudes | Ver el estado de mis solicitudes | Ninguno. Ya tenía filtro por estado, paginación y tarjetas; sin scroll horizontal en 390 px. | — | — | `revision_vendedor_mis_solicitudes_*.png` |
| Detalle de un trabajo | Ver el detalle de una solicitud propia | Ninguno. Se llega con 1 clic desde "Mis solicitudes" ("Ver detalle"). | — | — | `revision_vendedor_detalle_*.png` |

**Qué se comprobó:** las 3 tareas completas, en 1280 px y 390 px; navegación con teclado real
(`Tab`, no foco programático) en el formulario; escaneo de accesibilidad con axe-core en las 3
pantallas, en ambos anchos.
**Qué NO se comprobó:** el envío del formulario con `Enter` en vez de clic; comportamiento con
más de 20 solicitudes (paginación real, solo se probó con pocas).
**Valoración:** buena; el único hallazgo (DEF-16) era de toda la aplicación, no de este perfil en
particular, y ya se corrigió.

---

## Producción (Marcela) — recorrido completo

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Aprobaciones | Decidir una propuesta pendiente | Ninguno. Contador, búsqueda, orden y paginación ya agregados en la Parte B. | — | — | `revision_produccion_aprobaciones_*.png` |
| Decidir propuesta | Decidir una propuesta pendiente | Ninguno. Con `Tab` real se llega al botón "Aprobar" en 3 pasos, con foco visible (anillo de 3 px); pide confirmación antes de aprobar. | — | — | `revision_produccion_decidir_*.png` |
| Panel general | Ver el panel general | `empty-table-header` (axe, "minor"): la columna de acciones de la tabla no tiene texto de encabezado, solo visual. | Baja | No corregido (gravedad baja, anotado). | `revision_produccion_panel_*.png` |
| Detalle de un trabajo | Detener un trabajo en producción | Ninguno. El botón "Detener trabajo" aparece correctamente para un trabajo en producción, con motivo obligatorio y sugerencias. | — | — | `revision_produccion_detalle_*.png` |

**Qué se comprobó:** las 3 tareas completas, en 1280 px y 390 px; navegación con teclado real
hasta el botón "Aprobar" (con una verificación cuidadosa: el primer intento, con foco programático
en vez de `Tab` real, dio un falso "sin foco visible" — se repitió con `Tab` de verdad y el foco
sí es visible); escaneo de accesibilidad en las 4 pantallas.
**Qué NO se comprobó:** registrar un material desde esta vista (ya se había probado a fondo en la
Fase 1, Parte B de este trabajo); el flujo de "Reanudar" un trabajo detenido.
**Valoración:** buena; el único hallazgo es de severidad baja y queda anotado, no corregido.

---

## Diseño (Valentina) — recorrido completo

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Bandeja de diseño | Tomar una solicitud nueva | Ninguno. 2 clics (Tomar + confirmar). | — | — | `revision_diseno_bandeja_*.png` |
| Enviar propuesta | Enviar una propuesta (archivo real) | **DEF-15** (ver abajo): sin asterisco de obligatorio ni ejemplos en Técnica/Ubicación/Medidas/Colores. | Media | Corregido. | `revision_diseno_enviar_*.png` |
| Enviar propuesta | Enviar una propuesta (archivo real) | Validación de archivo faltante antes de llamar a la API ("Adjunta al menos un archivo."); 6 acciones para el caso completo (1 archivo + 4 campos opcionales + 1 clic). | — | — | — |
| Bandeja de diseño | Ver el motivo de un rechazo y reenviar | Ninguno. Probado de punta a punta: se creó un trabajo, se rechazó con un motivo real, y la bandeja de "En diseño" muestra el motivo exacto junto al botón "Enviar propuesta" para esa misma tarjeta. | — | — | `revision_diseno_motivo_rechazo_1280px.png` |

**Qué se comprobó:** las 3 tareas completas (la tercera con un escenario creado a propósito para
poder verla de verdad, no solo en teoría), en 1280 px y 390 px; escaneo de accesibilidad.
**Qué NO se comprobó:** navegación con teclado en este perfil en particular; subir más de un
archivo a la vez en el recorrido real (sí se probó como prueba automática, CP-55 y la de "dos
archivos" de la Parte 1 de esta sesión).
**Valoración:** buena; el único hallazgo (DEF-15) era de toda la aplicación y ya se corrigió.

---

## Administrador (Koto) — recorrido completo

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Panel general | Ver el panel general | Mismo `empty-table-header` de "baja" severidad que en la vista de Producción (es la misma pantalla). | Baja | No corregido (anotado). | `revision_admin_panel_*.png` |
| Usuarios | Gestionar un usuario | **DEF-17:** los campos "Rol" y "Área" (crear cuenta y el diálogo de cambiar perfil) no tenían etiqueta accesible (`critical` en axe-core). | Alta | Corregido. | `revision_admin_usuarios_*.png`, `revision_admin_dialogo_perfil_*.png` |
| Usuarios | Gestionar un usuario | **DEF-15** también aquí (sin asterisco ni ejemplos en Nombre/Correo). | Media | Corregido. | — |
| Usuarios (390 px) | Gestionar un usuario | La tabla se apila sin encabezados de columna (mismo patrón que el panel). Los valores son mayormente autoexplicativos; "Último acceso" podría confundirse sin su rótulo. | Baja | No corregido (anotado). | — |
| Bitácora | Revisar la bitácora de un trabajo | **DEF-18:** el botón "Buscar", en estado `:hover`, bajaba el contraste del texto blanco a 2.03:1 (`serious` en axe-core). | Alta | Corregido. | `revision_admin_bitacora_*.png` |
| Bitácora | Revisar la bitácora de un trabajo | Ninguno más: búsqueda por código real (3 eventos encontrados para KT-2026-0001), formato de código inválido rechazado con mensaje claro antes de llamar a la API. | — | — | — |

**Qué se comprobó:** las 3 tareas completas, en 1280 px y 390 px; escaneo de accesibilidad en las
3 pantallas; validación de "Crear cuenta" vacío y con datos inválidos.
**Qué NO se comprobó:** desactivar/activar una cuenta de verdad (se revisó el diálogo de
confirmación por código, no se ejecutó la acción); navegación con teclado en este perfil en
particular.
**Valoración:** buena, una vez corregidos DEF-17 y DEF-18 (ambos de severidad alta, encontrados
aquí). Dos hallazgos de severidad baja quedan anotados.

---

## "Mi cuenta" (pantalla común a los 5 perfiles) — revisión parcial

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Mi cuenta | Cambiar la contraseña | **DEF-15** también aquí (sin asterisco ni leyenda). | Media | Corregido. | `revision_mi_cuenta_1280px.png` |
| Mi cuenta | Cambiar la contraseña | Al enviar el formulario vacío, el mensaje de error es específico y aparece junto al campo, pero solo el primero que falla, no los tres a la vez. Decisión de diseño razonable, no es un defecto. | Baja | No aplica | — |
| Mi cuenta | Cambiar la contraseña | Los campos de contraseña no tienen un texto de "ejemplo": mostrar una contraseña de ejemplo sería contraproducente (invita a copiarla); ya hay una lista de reglas visible encima del formulario, que cumple el mismo propósito. Excepción razonable, no un defecto. | — | No aplica | — |

**Qué se comprobó:** el texto completo de la pantalla, el envío del formulario vacío, el escaneo
de accesibilidad (0 violaciones tras las correcciones), en 1280 px.
**Qué NO se comprobó:** el flujo completo de cambiar la contraseña con datos válidos (si funciona
de verdad), el cierre de las otras sesiones (ya cubierto por `PM-08`, no se repitió aquí), la
vista en 390 px de esta pantalla específica, y navegación con teclado.

---

## Resumen de hallazgos de esta ronda (detalle completo de cada uno en `evidencias/defectos.md`)

| Defecto | Dónde | Severidad (axe-core cuando aplica) | Estado |
|---|---|---|---|
| DEF-13 | Toda la app (botones con forma de enlace subrayados) | — | Corregido (Parte B) |
| DEF-14 | Mis actividades (Operario): sin paginación | Media | Corregido |
| DEF-15 | Todos los formularios: sin asterisco/ejemplos/mensaje por campo | Media | Corregido |
| DEF-16 | Toda la app: contraste de `--color-acento` como texto | Alta (`serious`) | Corregido |
| DEF-17 | Usuarios: selects "Rol"/"Área" sin etiqueta accesible | Alta (`critical`) | Corregido |
| DEF-18 | Botones primarios: contraste en estado `:hover` | Alta (`serious`) | Corregido |
| (menor) | `empty-table-header` en Panel/Usuarios | Baja (`minor`) | Anotado, no corregido |
| (menor) | Tabla "Usuarios" apilada en 390 px, sin rótulos de columna | Baja | Anotado, no corregido |

## Lo que queda sin verificar, dicho explícitamente (no se declara "terminado" sin esto)

- Navegación con teclado: verificada a fondo en Vendedor y Producción (con `Tab` real, no foco
  programático); no se repitió el mismo ejercicio en Diseño, Operario ni Administrador, aunque
  comparten los mismos componentes de formulario y botón.
- Contraste de color: medido con herramienta (axe-core) en las pantallas con formularios y en las
  principales de cada perfil; no se corrió en absolutamente todas las pantallas posibles (por
  ejemplo, los estados de cada `chip` por separado, uno por uno).
- No se probó con datos "de carga" reales (por ejemplo, 50 propuestas pendientes a la vez, un
  operario con 10 actividades en curso): todo lo medido fue con la cantidad de datos de ejemplo
  del entorno efímero, que es chica a propósito.
- Esta valoración es de quien hizo la revisión, no la del equipo: falta la prueba del equipo en su
  propia máquina para confirmar o corregir lo anotado aquí.
