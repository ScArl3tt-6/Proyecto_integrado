# Textos de la aplicación — inventario y propuesta de revisión

Este documento es una **propuesta para que el equipo la revise y apruebe**, no una lista de
cambios ya aplicados al código. Ningún archivo de `web/js/` se tocó para generar esta tabla
(la única excepción, marcada como "Ya aplicado", es el texto de activación de MFA en 3 pasos de
"Mi cuenta", que el equipo ya pidió exactamente así en un mensaje anterior). Hasta que el equipo
no confirme qué columnas "Texto propuesto" usar, el código sigue mostrando el "Texto actual".

**Criterios aplicados a cada texto propuesto:** máximo dos líneas; lenguaje simple y cercano,
nunca jerga técnica; nunca culpa a la persona; dice qué pasó y qué hacer, en ese orden; misma voz
en toda la app; no presupone el rol de quien lee. Dos mensajes (marcados abajo) **no cambian de
fondo**, solo de tono, porque hoy deliberadamente no revelan si una cuenta existe (evitar
enumeración de usuarios, ver PM-01).

## Hallazgo principal: dos mensajes presuponen el rol de quien lee

Se buscó específicamente "Pídele a Administración" y variantes. Hay **dos** casos (no solo el que
ya se sabía), ambos con el mismo problema: se muestran en pantallas donde la persona podría ser
justamente de Administración y la pantalla no tiene forma de saberlo todavía:

1. Pantalla de Ingreso, pista tras 2 intentos fallidos (`ingreso.js`).
2. Pantalla de restablecimiento, cuando el enlace ya no es válido (`restablecer.js`).

Ambos se resuelven con el mismo cambio de fondo: de "Pídele a Administración que..." a "Una
persona de Administración puede...". Ver el detalle en sus tablas abajo.

## Hallazgo secundario: el verbo de instrucción no es consistente

La app mezcla "Ingresa tu correo." con "Escribe los 6 dígitos del código." para el mismo tipo de
instrucción (completar un campo). Se propone unificar en **"Escribe"** en todos los campos de
texto/número/correo/contraseña (ya es el verbo usado para los códigos de verificación), dejando
"Selecciona" para listas desplegables y "Adjunta" para archivos, que ya son consistentes.

## Patrones ya compartidos y consistentes (no requieren cambio de fondo)

Estos patrones se repiten igual, palabra por palabra, en varias pantallas — es la parte de la voz
que ya está bien lograda, documentada una sola vez en vez de repetida en cada tabla:

| Patrón | Texto exacto | Dónde se usa |
|---|---|---|
| Error de conexión al guardar/enviar | «No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.» | Ingreso (los dos pasos), Restablecer, Mi cuenta (cambiar contraseña y MFA) |
| Error de conexión al cargar una lista o un detalle | «No pudimos cargar \<lo que sea\>. Revisa tu conexión e inténtalo otra vez.» + botón «Reintentar» (`estadoError`, `componentes.js`) | Panel, Mis actividades, Mis solicitudes, Bandeja de diseño, Aprobaciones, Decidir propuesta, Detalle de trabajo, Usuarios, Bitácora |
| Error de conexión al confirmar una acción puntual | «No pudimos \<verbo\> \<la cosa\>. Inténtalo otra vez.» | Tomar solicitud, Completar etapa, Detener/Reanudar trabajo, Registrar material, Decidir propuesta, Actualizar estado de cuenta, Generar enlace, Desactivar MFA |
| Cuenta regresiva de bloqueo (429) | «Demasiados intentos. Podrás volver a intentar en mm:ss.» (`iniciarCuentaRegresiva`, `ui.js`) | Ingreso (los dos pasos), Mi cuenta (cambiar contraseña), Restablecer |
| Campo obligatorio vacío | mensaje corto junto al campo, ej. «Ingresa tu correo.» | Todos los formularios — ver el hallazgo del verbo arriba |

Esta tabla no se repite abajo: donde una pantalla solo usa estos patrones sin nada propio, se
anota "usa el patrón compartido" en vez de repetir la fila.

---

## Pantalla de Ingreso (`web/js/pantallas/ingreso.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Subtítulo | «Ingresa con tu cuenta de la empresa.» | «Escribe tu correo y tu contraseña para ingresar.» | Propuesto, pendiente de revisión |
| Correo vacío | «Ingresa tu correo.» | «Escribe tu correo.» | Propuesto, pendiente de revisión |
| Correo con formato inválido | «Ingresa un correo con formato válido.» | «Ese correo no tiene un formato válido.» | Propuesto, pendiente de revisión |
| Contraseña vacía | «Ingresa tu contraseña.» | «Escribe tu contraseña.» | Propuesto, pendiente de revisión |
| Credenciales incorrectas (401) | «Correo o contraseña incorrectos. Si fallas 5 veces, tu cuenta se bloquea 15 minutos por seguridad.» | «El correo o la contraseña no coinciden. Si fallas 5 veces, tu cuenta se bloqueará 15 minutos por seguridad.» | **No cambiar el fondo, solo tono** — mismo mensaje exacto para correo inexistente o contraseña errónea, a propósito (evita que alguien descubra qué correos existen) |
| Cuerpo con datos inválidos (400) | «Revisa el correo y la contraseña ingresados.» | «Revisa el correo y la contraseña que escribiste.» | Propuesto, pendiente de revisión |
| Pista tras 2 intentos fallidos | «¿Olvidaste tu contraseña? Pídele a Administración que te genere un enlace para crear una nueva (pantalla "Usuarios" → "Generar enlace"). Ábrelo apenas te lo entregue: vence en 30 minutos y sirve una sola vez.» | «¿Olvidaste tu contraseña? Una persona de Administración puede generarte un enlace para crear una nueva (en "Usuarios" → "Generar enlace"). Ábrelo pronto: vence en 30 minutos y sirve una sola vez.» | **Propuesto — corrige que presupone el rol** (ver hallazgo principal) |
| Segundo paso (MFA), instrucción | «Escribe el código de 6 dígitos que muestra la aplicación.» *(se muestra como "Escribe el código de 6 dígitos de tu aplicación de verificación." dentro de un párrafo)* | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |
| Código de MFA vacío o mal formado | «Escribe los 6 dígitos del código.» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |
| Código de MFA incorrecto o vencido (401, texto del propio servidor) | «Código incorrecto o vencido, o la verificación caducó. Vuelve a ingresar tu correo y contraseña.» | «Ese código no es correcto o ya venció. Abre tu aplicación, escribe el código actual de 6 dígitos y vuelve a intentarlo. Si pasó mucho tiempo, ingresa tu correo y contraseña de nuevo.» | Propuesto, pendiente de revisión (el texto actual es correcto pero denso; se separan las dos causas) |
| Cuenta bloqueada tras varios códigos (401) | «Tu cuenta quedó bloqueada temporalmente por varios códigos incorrectos seguidos. Intenta de nuevo en unos minutos.» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |
| Sesión cerrada por inactividad | «Tu sesión se cerró por inactividad. Ingresa de nuevo.» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |
| Sesión expirada/revocada (genérico) | «Tu sesión expiró. Ingresa de nuevo.» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |

---

## Pantalla de restablecimiento de contraseña (`web/js/pantallas/restablecer.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Título | «Crear una contraseña nueva» | Sin cambio | Propuesto, pendiente de revisión |
| Subtítulo / reglas | «Al menos 12 caracteres (se aceptan frases largas). Evita tu nombre, tu correo, «kotoduo», contraseñas comunes o secuencias.» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |
| Contraseña nueva muy corta | «La contraseña nueva debe tener al menos 12 caracteres.» | Sin cambio | Propuesto, pendiente de revisión |
| Las dos contraseñas no coinciden | «Las contraseñas nuevas no coinciden.» | Sin cambio | Propuesto, pendiente de revisión |
| Enlace vencido, usado o inexistente (400) | «Este enlace ya no es válido: venció, ya se usó o no existe. Pídele a Administración que te genere uno nuevo.» | «Este enlace ya no es válido: venció, ya se usó o no existe. Una persona de Administración puede generarte uno nuevo.» | **Propuesto — corrige que presupone el rol** (segundo caso del hallazgo principal) |
| Éxito | «Contraseña actualizada. Ya puedes ingresar con tu contraseña nueva.» + botón «Ir a Ingresar» | Sin cambio — ya cumple los criterios | Propuesto, pendiente de revisión |

---

## Mi cuenta (`web/js/pantallas/cuenta.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Reglas de contraseña | «Al menos 12 caracteres (se aceptan frases largas).» / «No uses tu nombre, tu correo ni «kotoduo».» / «Evita contraseñas comunes, repeticiones o secuencias.» / «Debe ser distinta de tu contraseña actual.» | Sin cambio | Propuesto, pendiente de revisión |
| Contraseña nueva muy corta / no coinciden / igual a la actual | (mismos 3 mensajes que en Restablecer, más «La nueva contraseña debe ser distinta de la actual.») | Sin cambio | Propuesto, pendiente de revisión |
| Contraseña actual incorrecta (401) | «La contraseña actual no es correcta.» | Sin cambio | Propuesto, pendiente de revisión |
| Éxito al cambiar contraseña | «Listo. Cerramos tus otras sesiones por seguridad.» | Sin cambio — ya explica qué pasó y por qué | Propuesto, pendiente de revisión |
| MFA: introducción (3 pasos) | — | «1. Instala una aplicación de verificación en tu teléfono, como Google Authenticator o Microsoft Authenticator. 2. Escanea el código QR que te mostramos a continuación (solo una vez). 3. Escribe el código de 6 dígitos que te muestre la aplicación para confirmarlo.» + «Una vez activada, te pediremos ese código cada vez que ingreses, además de tu contraseña.» | **Ya aplicado** (pedido explícitamente por el equipo en este mismo turno) |
| MFA: instrucción para escanear | «Escanea este código con Google Authenticator, Authy u otra aplicación de verificación.» | «Escanea este código QR con la aplicación que instalaste.» | **Ya aplicado** (se simplificó al mismo tiempo que el punto anterior, para no repetir los nombres de las apps dos veces) |
| MFA: clave manual | «¿No puedes escanearlo? Ingresa esta clave a mano en tu aplicación: [clave]» | «¿No puedes escanearlo? Escribe esta clave en tu aplicación: [clave]» | Propuesto, pendiente de revisión (ajuste menor por el verbo "Escribe") |
| MFA: código vacío o mal formado | «Escribe los 6 dígitos del código.» | Sin cambio | Propuesto, pendiente de revisión |
| MFA: código incorrecto al confirmar (texto del servidor) | «Código incorrecto o vencido. Genera uno nuevo desde tu aplicación y vuelve a intentarlo.» | «Ese código no es correcto o ya venció. Abre tu aplicación, escribe el código actual de 6 dígitos y vuelve a intentarlo.» | Propuesto, pendiente de revisión (mismo ajuste de tono que el de Ingreso) |
| MFA: no se pudo iniciar la activación | «No pudimos iniciar la activación.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| MFA: activada con éxito | «Verificación en dos pasos activada.» | Sin cambio | Propuesto, pendiente de revisión |
| MFA: pedir contraseña para desactivar | «Para desactivarla, confirma tu contraseña actual.» | Sin cambio | Propuesto, pendiente de revisión |
| MFA: contraseña vacía al desactivar | «Ingresa tu contraseña actual.» | «Escribe tu contraseña actual.» | Propuesto, pendiente de revisión (ajuste del verbo) |

---

## Usuarios y Bitácora (`web/js/pantallas/admin.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Ayuda al crear cuenta | «Mínimo 12 caracteres, sin el nombre, el correo ni «kotoduo». Entrégasela a la persona en mano; ella la cambia luego desde "Mi cuenta".» | Sin cambio | Propuesto, pendiente de revisión |
| Nombre muy corto | «El nombre debe tener al menos 3 caracteres.» | Sin cambio | Propuesto, pendiente de revisión |
| Correo vacío | «Ingresa un correo.» | «Escribe un correo.» | Propuesto, pendiente de revisión |
| Contraseña inicial muy corta | «La contraseña inicial debe tener al menos 12 caracteres.» | Sin cambio | Propuesto, pendiente de revisión |
| Cuenta creada con éxito | «Cuenta creada. Entrégale la contraseña inicial en mano; ella la cambiará desde "Mi cuenta".» | Sin cambio | Propuesto, pendiente de revisión |
| Lista de cuentas vacía | «No hay cuentas registradas.» | Sin cambio | Propuesto, pendiente de revisión |
| Diálogo cambiar rol/área, error de permiso (409) | «No puedes modificar tu propio perfil.» | Sin cambio | Propuesto, pendiente de revisión |
| Diálogo cambiar rol/área, otros errores | «No pudimos guardar los cambios.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| Confirmar desactivar/activar cuenta | «¿Desactivar / Activar la cuenta de \<nombre\>?» | Sin cambio | Propuesto, pendiente de revisión |
| Enlace de restablecimiento, ayuda | «Vence en \<minutos\> minutos y sirve una sola vez. Entrégaselo a \<nombre\> de forma segura (en persona o por un canal que ya uses con ella).» | Sin cambio | Propuesto, pendiente de revisión |
| No se pudo generar el enlace | «No pudimos generar el enlace. Inténtalo otra vez.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| Confirmar desactivar MFA de otra cuenta | «¿Desactivar la verificación en dos pasos de \<nombre\>? Útil si perdió el acceso a su aplicación de autenticación.» | Sin cambio | Propuesto, pendiente de revisión |
| No se pudo desactivar MFA | «No pudimos desactivar la verificación en dos pasos.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| Bitácora: código con formato inválido | «Ingresa un código con el formato KT-AAAA-NNNN.» | «Escribe un código con el formato KT-AAAA-NNNN.» | Propuesto, pendiente de revisión |
| Bitácora: sin eventos | «No hay eventos para ese código.» | Sin cambio | Propuesto, pendiente de revisión |

---

## Panel general (`web/js/pantallas/panel.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Grupo sin trabajos | «No hay trabajos en este grupo.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al cargar | usa el patrón compartido («No pudimos cargar el panel...») | — | Propuesto, pendiente de revisión |

## Mis actividades — Operario (`web/js/pantallas/operario.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Sin actividades (primera página) | «No tienes actividades en curso en tu área por ahora.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin más actividades (páginas siguientes) | «No hay más actividades.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin materiales registrados | «Este trabajo no tiene materiales registrados.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al cargar materiales de una actividad | «No pudimos cargar los materiales.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| Confirmar completar etapa (con siguiente etapa) | «¿Terminaste "\<etapa\>"? Sigue: "\<siguiente\>".» | Sin cambio | Propuesto, pendiente de revisión |
| Confirmar completar etapa (última) | «¿Terminaste "\<etapa\>"? Con esto el trabajo queda Terminado.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al completar etapa | usa el patrón compartido | — | Propuesto, pendiente de revisión |

## Mis solicitudes / Nueva solicitud — Vendedor (`web/js/pantallas/vendedor.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Sin solicitudes (primera página) | «Todavía no registras solicitudes.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin más solicitudes | «No hay más solicitudes.» | Sin cambio | Propuesto, pendiente de revisión |
| Aviso de privacidad del formulario | «Solo se registran datos del trabajo. No se piden datos de contacto ni de pago del cliente.» | Sin cambio | Propuesto, pendiente de revisión |
| Catálogo de tipos no cargó | «No pudimos cargar los tipos de trabajo. Recarga la página.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin tipo seleccionado | «Selecciona un tipo de trabajo.» | Sin cambio | Propuesto, pendiente de revisión |
| Descripción muy corta | «La descripción debe tener al menos 5 caracteres.» | Sin cambio | Propuesto, pendiente de revisión |
| Fecha comprometida anterior a hoy | «La fecha comprometida no puede ser anterior a hoy.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al registrar (otros) | usa el patrón compartido | — | Propuesto, pendiente de revisión |

## Bandeja de diseño / Enviar propuesta (`web/js/pantallas/diseno.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Sin solicitudes por tomar | «No hay solicitudes nuevas por tomar.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin trabajos en diseño | «No tienes trabajos en diseño en este momento.» | Sin cambio | Propuesto, pendiente de revisión |
| Motivo del rechazo (informativo) | «Motivo del rechazo: \<motivo\>» | Sin cambio | Propuesto, pendiente de revisión |
| Error al tomar una solicitud | usa el patrón compartido | — | Propuesto, pendiente de revisión |
| Sin archivo adjunto | «Adjunta al menos un archivo.» | Sin cambio | Propuesto, pendiente de revisión |
| Archivo SVG rechazado | «"\<nombre\>": No se aceptan archivos SVG.» | «"\<nombre\>" no se puede usar: los archivos SVG no están permitidos.» | Propuesto, pendiente de revisión (evita que la frase empiece con el nombre del archivo entre comillas, más fácil de leer) |
| Tipo de archivo no permitido | «"\<nombre\>": Solo se aceptan archivos PDF, PNG o JPG.» | «"\<nombre\>" no se puede usar: solo se aceptan PDF, PNG o JPG.» | Propuesto, pendiente de revisión |
| Archivo demasiado grande | «"\<nombre\>": El archivo supera los 15 MB permitidos.» | «"\<nombre\>" no se puede usar: supera los 15 MB permitidos.» | Propuesto, pendiente de revisión |
| Éxito al enviar propuesta | «Versión \<n\> enviada.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al enviar (otros) | usa el patrón compartido | — | Propuesto, pendiente de revisión |

## Aprobaciones / Decidir propuesta (`web/js/pantallas/produccion.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Contador de pendientes | «\<n\> propuesta(s) pendiente(s) de decisión» | Sin cambio | Propuesto, pendiente de revisión |
| Sin resultados de búsqueda | «No hay propuestas pendientes que coincidan con la búsqueda.» | Sin cambio | Propuesto, pendiente de revisión |
| Sin propuestas pendientes | «No hay propuestas esperando decisión.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al tomar una solicitud / decidir (otros) | usa el patrón compartido | — | Propuesto, pendiente de revisión |
| Versión ya decidida | «Esta versión ya tiene una decisión registrada (\<estado\>).» | Sin cambio | Propuesto, pendiente de revisión |
| Decisión ya registrada (409 al confirmar) | «Esta versión ya tiene una decisión registrada.» | Sin cambio | Propuesto, pendiente de revisión |
| Confirmar aprobar | «¿Aprobar la versión \<n\> de \<código\>?» | Sin cambio | Propuesto, pendiente de revisión |

## Detalle de trabajo (`web/js/pantallas/detalleTrabajo.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Sin permiso para ver el trabajo (403) | «No tienes permiso para ver este trabajo.» | Sin cambio | Propuesto, pendiente de revisión |
| Código no encontrado (404) | «No encontramos ese código de trabajo.» | Sin cambio | Propuesto, pendiente de revisión |
| Motivo del último rechazo (informativo) | «Motivo del último rechazo: \<motivo\>» | Sin cambio | Propuesto, pendiente de revisión |
| Sin materiales registrados | «Este trabajo no tiene materiales registrados.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al cargar materiales | «No pudimos cargar los materiales.» | Sin cambio — usa el patrón compartido | Propuesto, pendiente de revisión |
| Sin material seleccionado | «Selecciona un material.» | Sin cambio | Propuesto, pendiente de revisión |
| Cantidad inválida | «La cantidad debe ser mayor que cero.» | Sin cambio | Propuesto, pendiente de revisión |
| Catálogo de materiales no cargó | «No pudimos cargar el catálogo de materiales. Recarga la página.» | Sin cambio | Propuesto, pendiente de revisión |
| Error al registrar material / detener / reanudar | usa el patrón compartido | — | Propuesto, pendiente de revisión |

## Pantallas sin sesión válida (`web/js/pantallas/errores.js`)

| Situación | Texto actual | Texto propuesto | Estado |
|---|---|---|---|
| Sin permiso (403, ruta completa) | «No tienes permiso para esta acción.» | Sin cambio | Propuesto, pendiente de revisión |
| Ruta no encontrada | «Esa dirección no existe o cambió.» | Sin cambio | Propuesto, pendiente de revisión |

---

## Resumen

- **Pantallas revisadas:** 11 (Ingreso, Restablecer contraseña, Mi cuenta, Usuarios/Bitácora,
  Panel general, Mis actividades, Mis solicitudes/Nueva solicitud, Bandeja de diseño/Enviar
  propuesta, Aprobaciones/Decidir propuesta, Detalle de trabajo, páginas de error), más los
  patrones compartidos de `ui.js`/`componentes.js`.
- **Mensajes catalogados:** aproximadamente 95 (incluyendo los que comparten patrón y no se
  repitieron en cada tabla).
- **Mensajes que presuponen el rol:** 2 en total (los dos listados en el hallazgo principal); no
  se encontró ningún otro con el mismo problema en el resto de la aplicación.
- **Pendiente:** que el equipo marque qué filas aprueba antes de pedir que se edite el código —
  ningún archivo de `web/js/` cambió para producir este documento.
