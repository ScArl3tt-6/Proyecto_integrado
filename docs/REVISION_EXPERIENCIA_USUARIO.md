# Revisión de experiencia de usuario (Parte C)

Metodología: navegador real (Playwright, headless) contra `scripts/entorno-efimero.js` (base de
datos propia y desechable, nunca la real), en 1280 px (escritorio) y 390 px (celular). Cada
hallazgo se registra como `DEF-nn` en `evidencias/defectos.md`, sin borrarlo aunque se corrija.
Esta valoración es de quien hizo la revisión (Claude), no reemplaza la prueba del equipo: al
final de cada perfil se dice explícitamente qué se comprobó y qué no.

**Estado al cierre de esta sesión: 1 de 5 perfiles con recorrido completo (Operario). Los otros
cuatro (Administrador, Producción, Diseño, Vendedor) y la pantalla "Mi cuenta" completa quedan
pendientes — ver "Lo que falta" al final de cada sección.**

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
| Mis actividades | Ver qué etapa le toca hoy | Ninguno. 1 paso (iniciar sesión; es la pantalla de inicio del rol). Título claro, una tarjeta por trabajo, la etapa actual destacada visualmente, indica la siguiente etapa. | — | — | `revision_operario_actividades_1280px.png`, `..._390px.png` |
| Mis actividades | Marcar una etapa como completada | Ninguno. 2 clics (botón + confirmar). El botón ocupa todo el ancho en celular, 56 px de alto (más del mínimo de 44 px). El mensaje de confirmación es específico: nombra la etapa actual y la siguiente, o avisa que el trabajo queda Terminado si es la última. | — | — | `revision_operario_confirmar_390px.png` |
| Mis actividades | Ver materiales y medidas | Ninguno. 1 clic, se expande en la misma tarjeta (no navega a otra pantalla), con un estado "Cargando…" visible y un mensaje claro cuando no hay materiales registrados. | — | — | `revision_operario_materiales_390px.png` |
| Mis actividades | (general) | La lista no tiene paginación ni contador, aunque el servidor ya la admite (`GET /api/trabajos/mis-actividades` soporta `pagina`/`limite`, igual que el resto de la API). Con pocas etapas en curso no se nota, pero un operario con muchas actividades a la vez no tendría forma de ver "la página 2". | Media | No aplicada todavía (queda para la continuación de la Parte C/B) | — |
| Mis actividades | (general) | Sin scroll horizontal en 390 px; menú de navegación inferior visible y usable en celular (confirma lo que ya describía `PM-07`). | — | — | (mismas capturas de arriba) |

**Qué se comprobó:** las 3 tareas completas, en 1280 px y 390 px, con navegador real, incluyendo
el texto exacto de la confirmación, el tamaño real del botón principal, ausencia de errores de
consola y ausencia de scroll horizontal.
**Qué NO se comprobó:** navegación con teclado (tab/enter) todavía no se probó en este perfil;
contraste de color no se midió con una herramienta (solo revisión visual); un operario con más de
una etapa en curso al mismo tiempo (los datos de prueba solo tenían una).
**Valoración:** buena para las 3 tareas principales; el único punto real es la falta de
paginación/contador si la lista crece, anotado como DEF-14.

---

## "Mi cuenta" (pantalla común a los 5 perfiles) — revisión parcial

| Pantalla | Tarea | Problema detectado | Gravedad | Corrección aplicada | Captura |
|---|---|---|---|---|---|
| Mi cuenta | Cambiar la contraseña | Ningún campo tiene asterisco de obligatorio ni existe una leyenda "* obligatorio", aunque los tres campos (actual, nueva, repetir) son obligatorios. | Media | No aplicada todavía | `revision_mi_cuenta_1280px.png` |
| Mi cuenta | Cambiar la contraseña | Al enviar el formulario vacío, el mensaje de error es específico y aparece junto al campo ("La contraseña nueva debe tener al menos 12 caracteres."), pero solo se muestra el primer campo que falla, no los tres al mismo tiempo. Es una decisión de diseño razonable (no abruma con tres errores a la vez), no se marca como defecto. | Baja | No aplica | — |
| Mi cuenta | Cambiar la contraseña | Los campos de contraseña no tienen un texto de ejemplo, pero mostrar un "ejemplo" de contraseña sería contraproducente (induciría a copiarlo); en su lugar ya hay una lista de reglas visible encima del formulario. Se considera una excepción razonable a "todo campo con ejemplo", no un defecto. | — | No aplica | — |

**Qué se comprobó:** el texto completo de la pantalla, el envío del formulario vacío y su mensaje
de error, en 1280 px.
**Qué NO se comprobó:** el flujo completo de cambiar la contraseña con datos válidos, el cierre de
las otras sesiones (ya cubierto por `PM-08`, no se repitió aquí), la vista en 390 px de esta
pantalla específica, teclado, contraste.

---

## DEF-14 — "Mis actividades" (Operario) no tiene paginación ni contador en la lista

- **Encontrado en:** Parte C, revisión de Operario.
- **Causa:** `web/js/pantallas/operario.js` nunca llama a la API con `pagina`/`limite` ni muestra
  un paginador, aunque `GET /api/trabajos/mis-actividades` ya los admite en el servidor
  (`esquemaPaginacion` en `src/modulos/trabajos/rutasTrabajos.js`).
- **Estado:** Pendiente de corregir (anotado, no corregido en esta sesión por tiempo; es el mismo
  patrón que ya se corrigió en la bandeja de Producción en la Parte B — reutilizar
  `paginador()` de `web/js/componentes.js`).

## DEF-15 — Ningún formulario de la aplicación marca los campos obligatorios con un asterisco ni tiene la leyenda "* obligatorio"

- **Encontrado en:** Parte C, revisión de "Mi cuenta"; es consistente con lo visto en todas las
  demás pantallas con formularios revisadas hasta ahora en esta sesión (Nueva solicitud, Enviar
  propuesta, Registrar material).
- **Causa:** es una convención que nunca se aplicó en ninguna pantalla, no un error puntual de una
  sola pantalla.
- **Estado:** Pendiente de corregir. Por el tamaño (afecta a todos los formularios de la
  aplicación), se deja para abordar de una sola vez en la continuación de la Parte C, no parcheado
  formulario por formulario.

## Lo que falta de la Parte C (pendiente, dicho explícitamente, no se da por terminado)

- Recorrido completo (1280 px y 390 px, las 3 tareas, la tabla de criterios) de: **Administrador**,
  **Producción**, **Diseño** y **Vendedor**.
- Revisión completa de "Mi cuenta" en 390 px y de su flujo de cambio de contraseña con datos
  válidos.
- Navegación con teclado y medición de contraste con una herramienta, en todos los perfiles.
- Decidir e implementar la corrección de DEF-14 y DEF-15 (o, si el equipo prefiere, agruparlas con
  el resto de la Parte B/C cuando se complete el recorrido de los 4 perfiles restantes).
