# Pruebas manuales del prototipo SST Kotoduo

Guion para ejecutar a mano sobre `http://localhost:3000` (ver `README.md` para levantar la
demostración). Usa las cuentas y los códigos de `.demo-credenciales.txt`, generado por
`npm run demo:sembrar`. Registra el resultado (Aprobado / Falla) y una nota si algo no calzó.

| ID | Qué se verifica | Resultado |
|---|---|---|
| PM-01 | Ingreso con correo inexistente y con clave errónea: mensaje único, sin revelar si la cuenta existe | |
| PM-02 | Cinco intentos fallidos: aviso del bloqueo y de la espera; botón deshabilitado con cuenta regresiva en el 429 | |
| PM-03 | Sesión expirada o revocada (cerrarla desde otra pestaña o desde Usuarios): la pantalla vuelve al ingreso con aviso | |
| PM-04 | Cada perfil ve solo las opciones de su rol; escribir a mano la ruta de otro rol no deja entrar | |
| PM-05 | Flujo completo: solicitud → tomar → propuesta → rechazo con motivo → nueva versión → aprobación → etapas hasta terminar | |
| PM-06 | Formularios con campos vacíos, textos largos, caracteres especiales y `<script>`: se muestran como texto y los errores aparecen junto al campo | |
| PM-07 | Uso en celular (390 px): botones, lectura y la pantalla del operario | |
| PM-08 | Cambio de contraseña y cierre de las otras sesiones | |
| PM-09 | Producción registra materiales de un trabajo; otros perfiles solo los consultan | |
| PM-10 | Diseño adjunta el archivo real de una propuesta y Producción puede verlo/descargarlo antes de decidir | |
| PM-11 | Cierre de sesión por inactividad real: sin usar el sistema durante el límite, la próxima acción vuelve a Ingreso con el aviso correcto | |
| PM-12 | Restablecimiento de contraseña: Administración genera el enlace y la persona lo usa, sin sesión, para crear una contraseña nueva | |
| PM-13 | Verificación en dos pasos (MFA): activar con un código real, ingresar con el segundo paso, y desactivarla (propia y desde Administración) | |
| PM-14 | Administración crea una cuenta nueva desde "Usuarios": aparece en el listado, puede ingresar con lo que se le entregó, y un correo repetido se rechaza con un aviso claro | |
| PM-15 | "Comenzar etapa": dos operarios del área ven la misma actividad; solo uno puede tomarla, el otro la ve "En curso por &lt;nombre&gt;"; solo quien la tomó puede completarla | |
| PM-16 | Bitácora: texto humano (no códigos), nombre y rol de quién hizo cada cosa, detalle útil, últimos eventos visibles sin buscar, y elegir un trabajo de una lista con búsqueda | |
| PM-17 | Si el servidor queda desactualizado respecto a la pantalla, aparece un aviso amable para recargar, sin interrumpir lo que se estaba haciendo | |
| PM-18 | "Liberar etapa": quien la tomó puede soltarla; Producción y Administración también pueden soltar la de otra persona; un operario ajeno no puede | |
| PM-19 | Saludo personalizado ("Hola, &lt;nombre&gt;") en el encabezado y en "Mi cuenta" (con rol, área y correo), sin desbordes en celular | |
| PM-20 | Historial humano dentro del detalle de un trabajo, visible según el rol (Vendedor, Diseño, Producción, Operario); etapa actual/siguiente en lenguaje claro; falta de materiales destacada | |
| PM-21 | Aprobar/rechazar una propuesta: la pantalla dice a quién corresponde, el diálogo dice la consecuencia (etapa que sigue, o a qué estado vuelve y quién lo retoma), y tras confirmar se ve el resultado en el detalle del trabajo | |
| PM-22 | Novedades (Vendedor y Diseño): contador en el menú y lista cuando una solicitud propia se aprueba, se rechaza o termina; baja a 0 al visitarla; Diseño se entera incluso de propuestas que ya no puede ver en detalle | |
| PM-23 | Vista previa de un PDF o imagen de una propuesta, dentro de la misma pantalla de "Decidir propuesta" (sin el ícono de contenido bloqueado) | |
| PM-24 | La URL base de los enlaces de primer acceso/restablecimiento es configurable (`SST_URL_BASE`), no queda fija en "localhost" | |
| PM-25 | "Mis solicitudes" (Vendedor): línea de tiempo de etapas, motivo del atraso, y etapa actual/siguiente en lenguaje claro, en cada tarjeta | |

## Pasos detallados

### PM-01 — Ingreso con credenciales incorrectas
1. Ve a `#/ingreso`. Escribe un correo que no existe (`nadie@kotoduo.test`) y cualquier contraseña. Ingresar.
2. Repite con un correo real de `.demo-credenciales.txt` pero con la contraseña cambiada.
3. **Esperado:** en ambos casos aparece el mismo aviso: «Correo o contraseña incorrectos. Si fallas 5 veces, tu cuenta se bloquea 15 minutos por seguridad.». Nada en la pantalla ni en la pestaña de Red del navegador distingue un caso del otro.
4. Tras el segundo intento fallido con el mismo correo debe aparecer además «¿Olvidaste tu contraseña? Una persona de Administración puede generarte un enlace para crear una nueva (pantalla "Usuarios" → "Generar enlace"). Ábrelo apenas te lo entregue: vence en 30 minutos y sirve una sola vez.».

### PM-02 — Bloqueo por intentos (429)
1. Con un correo de prueba, envía la contraseña incorrecta repetidamente (10 veces en 15 minutos agota el límite de intentos por cuenta).
2. **Esperado:** en algún punto la API responde 429 y la pantalla muestra «Demasiados intentos. Podrás volver a intentar en mm:ss.» con una cuenta regresiva que baja cada segundo; el botón «Ingresar» queda deshabilitado mientras dura y el foco se mueve al aviso. Al llegar a 00:00 el aviso desaparece y el botón se vuelve a habilitar.
3. Nota aparte: tras 5 intentos fallidos sobre una cuenta real, esa cuenta queda bloqueada 15 minutos aunque luego se escriba la contraseña correcta (sigue devolviendo el mismo mensaje único de PM-01, nunca dice «cuenta bloqueada»).

### PM-03 — Sesión expirada o revocada
1. Ingresa con cualquier cuenta y navega a una pantalla interna (por ejemplo «Mis actividades»).
2. En otra pestaña, ingresa como `koto` (Administrador), ve a Usuarios y desactiva la cuenta que usaste en el paso 1 (o cambia su rol).
3. Vuelve a la primera pestaña y haz clic en cualquier enlace del menú.
4. **Esperado:** la pantalla vuelve a `#/ingreso` con el aviso «Tu sesión expiró. Ingresa de nuevo.».
5. Reactiva la cuenta desde la segunda pestaña para seguir probando.

### PM-04 — Autorización por rol y rutas internas
1. Ingresa como `jorge` (Vendedor). Verifica que el menú solo muestra «Mis solicitudes» y «Nueva solicitud».
2. Sin cerrar sesión, escribe a mano en la barra de direcciones `http://localhost:3000/#/usuarios` (pantalla de Administración).
3. **Esperado:** aparece la pantalla «No tienes permiso», no la de Usuarios. La API también devuelve 403 si se mira la pestaña de Red.
4. Repite con `luis` (Operario) intentando `#/panel`, y con `valentina` (Diseño) intentando `#/aprobaciones`.

### PM-05 — Flujo completo de un trabajo
1. Como `jorge` (Vendedor): «Nueva solicitud», tipo Bordado, cualquier descripción y fecha futura. Anota el código `KT-...` que se genera.
2. Como `valentina` (Diseño): en «Bandeja de diseño», «Tomar solicitud» sobre ese código, luego «Enviar propuesta» con un archivo PDF o PNG real.
3. Como `marcela` (Producción): en «Aprobaciones», abre esa propuesta y «Rechazar» con un motivo. Verifica que vuelve a aparecer en la bandeja de Diseño con el motivo visible.
4. Como `valentina`: envía una segunda versión de la propuesta para el mismo código.
5. Como `marcela`: esta vez «Aprobar». El trabajo pasa a "En producción".
6. Como `luis` (Operario de Bordado): en «Mis actividades», completa cada etapa con el botón grande hasta que el trabajo deje de aparecer (queda Terminado).
7. Como `koto` (Administrador): confirma en «Panel general» que el código aparece en «Terminados», y en «Bitácora» que el historial muestra, en orden, la solicitud, la toma, cada envío de propuesta, el rechazo, la aprobación y las etapas completadas.

### PM-06 — Formularios con datos problemáticos
1. En «Nueva solicitud», intenta guardar con la descripción vacía y con una fecha anterior a hoy: el error aparece junto al campo, sin perder lo ya escrito.
2. Escribe en la descripción un texto con `<script>alert(1)</script>` y guarda. **Esperado:** se guarda como texto plano (se puede ver en el detalle del trabajo) y nunca se ejecuta ni se muestra como HTML.
3. En «Mi cuenta», intenta cambiar la contraseña con una nueva de menos de 12 caracteres: el error se muestra antes de llamar a la API.
4. En «Enviar propuesta» (Diseño), intenta adjuntar un archivo `.svg`: debe rechazarse con un mensaje claro, sin llegar a enviarse.

### PM-07 — Uso en celular (390 px)
1. Abre las herramientas de desarrollo del navegador y fija el ancho en 390 px (o usa un celular real).
2. Ingresa como `luis` (Operario). **Esperado:** la navegación aparece como barra inferior, el botón «Completar etapa» ocupa todo el ancho y es claramente más alto que un botón normal, y no hay scroll horizontal en ninguna pantalla.
3. Repite para «Nueva solicitud» (Vendedor) y «Panel general» (Administrador): la tabla del panel se convierte en tarjetas apiladas, no en una tabla angosta con scroll lateral.

### PM-08 — Cambio de contraseña y cierre de otras sesiones
1. Ingresa con la misma cuenta en dos navegadores o perfiles distintos (dos sesiones activas).
2. En uno de los dos, ve a «Mi cuenta» y cambia la contraseña (cumpliendo la política mostrada en pantalla).
3. **Esperado:** aparece «Listo. Cerramos tus otras sesiones por seguridad.»; en el otro navegador, la próxima acción devuelve a la pantalla de ingreso.
4. Verifica que con la contraseña antigua ya no se puede ingresar, y que con la nueva sí.

### PM-09 — Registrar materiales de un trabajo (RF-08)
1. Ingresa como `marcela` (Producción) y abre el detalle de un trabajo en producción (por ejemplo `KT-2026-0005`).
2. En la sección «Materiales», completa el formulario: elige un material del listado, escribe una cantidad y, si quieres, una medida (por ejemplo un color), y presiona «Registrar material».
3. **Esperado:** el material aparece de inmediato en la lista de arriba, con su unidad.
4. Vuelve a registrar el mismo material con otra cantidad u otra medida. **Esperado:** la lista sigue mostrando una sola fila para ese material, con los valores nuevos (no se duplica).
5. Intenta registrar con la cantidad en 0 o en blanco: el formulario muestra el error antes de llamar a la API.
6. Ingresa como `koto` (Administrador) o `luis` (Operario de esa área, desde «Mis actividades» → «Ver materiales y medidas») y confirma que ambos ven la lista de materiales, pero ninguno tiene el formulario para registrar uno nuevo.

### PM-10 — Ver el archivo real de una propuesta de diseño (RF-02 con GridFS)
1. Ingresa como `valentina` (Diseño), toma una solicitud y en «Enviar propuesta» adjunta un archivo PDF, PNG o JPG real (no de prueba vacío) junto con la técnica y las medidas.
2. Ingresa como `marcela` (Producción), ve a «Aprobaciones» → «Ver y decidir» sobre esa propuesta.
3. **Esperado:** junto al nombre, el tipo y el tamaño del archivo aparece un enlace «Ver archivo». Al hacer clic, se abre en una pestaña nueva y el navegador muestra el PDF o la imagen real que Diseño adjuntó (no un error ni una página en blanco).
4. Ingresa como `jorge` (Vendedor) o cualquier perfil sin el permiso `DISENO_VER` y confirma que no puede llegar a esa pantalla ni al enlace (403 si se intenta a mano por la API).

### PM-11 — Cierre de sesión por inactividad real (RNF, Funcionalidad 3)
1. Ingresa con cualquier cuenta y no toques nada (ni clics, ni teclado, ni scroll) durante 30 minutos reales.
2. Pasado ese tiempo, intenta cualquier acción (por ejemplo abrir un enlace del menú).
3. **Esperado:** la pantalla vuelve a `#/ingreso` con el aviso «Tu sesión se cerró por inactividad. Ingresa de nuevo.» (distinto del aviso genérico de PM-03). La sesión queda cerrada de verdad en el servidor, no solo en esta pestaña: si quedó abierta en otra pestaña o dispositivo, la siguiente acción ahí también la cierra.
4. Para no esperar 30 minutos reales al probar esto: lanza el entorno aislado con un límite corto, por ejemplo `SST_MINUTOS_INACTIVIDAD=0.2 node scripts/entorno-efimero.js` (12 segundos), nunca contra `npm run demo` ni la base real.
5. Nota aparte: usar el sistema con normalidad (ir cambiando de pantalla, registrar algo) antes de los 30 minutos no debe cerrar la sesión aunque pase mucho tiempo total desde el ingreso — cada acción real reinicia el conteo.

### PM-12 — Restablecimiento de contraseña por enlace (Funcionalidad 4)
1. Ingresa como `koto` (Administrador), ve a «Usuarios» y presiona «Generar enlace» en la fila de cualquier cuenta activa.
2. **Esperado:** se abre un diálogo con el enlace completo (se puede copiar con «Copiar enlace») y el aviso «Vence en 30 minutos y sirve una sola vez. Entrégaselo a [nombre] de forma segura…».
3. Copia el enlace y ábrelo en una ventana nueva (o en modo incógnito) **sin haber iniciado sesión**. **Esperado:** aparece «Crear una contraseña nueva» con las mismas reglas que en «Mi cuenta».
4. Escribe una contraseña nueva válida y repítela. **Esperado:** «Contraseña actualizada. Ya puedes ingresar con tu contraseña nueva.» y un botón «Ir a Ingresar».
5. Ingresa con la cuenta y la contraseña nueva: debe funcionar. Con la contraseña antigua ya no debe entrar.
6. Intenta abrir el mismo enlace otra vez y guardar otra contraseña. **Esperado:** «Este enlace ya no es válido: venció, ya se usó o no existe. Una persona de Administración puede generarte uno nuevo.».
7. Genera un enlace nuevo para la misma cuenta sin usar el anterior: el enlace viejo debe dejar de servir apenas se genera el nuevo.
8. Si la cuenta tenía otra sesión abierta en otro navegador, confirma que esa sesión también se cierra al completar el restablecimiento (igual que al cambiar la contraseña desde «Mi cuenta»).

### PM-13 — Verificación en dos pasos por TOTP (Funcionalidad 5)
1. Ingresa como `marcela` (Producción) o `koto` (Administrador) y ve a «Mi cuenta» → «Activar verificación en dos pasos».
2. **Esperado:** aparece un código QR y, debajo, la clave en texto para ingresarla a mano si no se puede escanear. Escanéalo con Google Authenticator, Authy o similar (o calcula el código a mano con la clave).
3. Escribe el código de 6 dígitos que muestra la aplicación y presiona «Confirmar y activar». **Esperado:** «Verificación en dos pasos activada.» y el estado pasa a mostrar el chip «Activada».
4. Cierra sesión e ingresa de nuevo con el mismo correo y contraseña. **Esperado:** después de la contraseña correcta aparece un segundo paso, «Escribe el código de 6 dígitos de tu aplicación de verificación», sin entrar todavía a ninguna pantalla interna.
5. Escribe un código incorrecto. **Esperado:** aviso claro de código incorrecto, sigue en el segundo paso (no vuelve a pedir la contraseña). Repetir 5 veces en total (contraseña + códigos) bloquea la cuenta 15 minutos, igual que con la contraseña (PM-02).
6. Escribe el código real de la aplicación. **Esperado:** entra con normalidad a la pantalla de inicio de su rol.
7. Intenta entrar con un correo o perfil que no tenga permiso de MFA (por ejemplo `jorge`, Vendedor): en «Mi cuenta» no debe aparecer la opción de activarlo.
8. Vuelve a «Mi cuenta» y presiona «Desactivar verificación en dos pasos»: pide la contraseña actual; con la incorrecta no desactiva, con la correcta sí, y el ingreso vuelve a ser directo (sin segundo paso).
9. Como `koto` (Administrador), activa el MFA de otra cuenta de prueba, ve a «Usuarios»: la fila debe mostrar el chip «2FA» y un botón «Desactivar 2FA» que no pide ninguna contraseña (para cubrir el caso de alguien que perdió su aplicación de autenticación). Tras usarlo, esa persona vuelve a ingresar directo.

**Confirmado por el equipo, 18-11-2026:** prueba real con un teléfono físico (no solo con una librería calculando el código). El bloqueo tras equivocarse y el ingreso con el segundo paso funcionaron como se esperaba.

### PM-14 — Crear una cuenta nueva desde "Usuarios" (primer acceso, punto 7 de la revisión del equipo, 19-11-2026)
1. Ingresa como `koto` (Administrador), ve a «Usuarios» y completa «Crear cuenta» con un nombre, un correo que no exista todavía y un rol. **Esperado:** el formulario NO pide ninguna contraseña — Administración no debe fijarla ni conocerla.
2. **Esperado:** «Cuenta creada. Copia el enlace de primer acceso que se abre a continuación y entrégaselo a la persona.», la cuenta aparece de inmediato en la lista de abajo con el rol y el área correctos, y se abre un diálogo "Enlace de primer acceso para &lt;nombre&gt;" con el enlace completo, un botón «Copiar enlace», y el aviso de que vence en un tiempo limitado y sirve una sola vez.
3. Copia el enlace y ábrelo en una ventana nueva (o incógnito) **sin haber iniciado sesión**. **Esperado:** se abre "Crear una contraseña nueva" (la misma pantalla que un restablecimiento).
4. Crea una contraseña válida. **Esperado:** confirmación, y puedes ingresar con el correo de la cuenta nueva y la contraseña QUE ACABAS DE ELEGIR (nunca una que haya escrito Administración).
5. Vuelve a crear una cuenta con el mismo correo que ya usaste. **Esperado:** aviso claro de que el correo ya está registrado, sin crear una segunda cuenta.
6. Revisa que la URL del enlace corresponda al dominio real de la aplicación (configurable con `SST_URL_BASE`), no a "localhost" si el servidor está desplegado en otro lugar.

**Confirmado, 19-11-2026:** verificado de punta a punta con un navegador real contra el entorno aislado: el formulario sin campo de contraseña, el diálogo con el enlace, abrir ese enlace sin sesión, crear la contraseña, e ingresar con ella. El enlace usó la URL base configurada del servidor (no "localhost:3000" por defecto), ver PM-24.

### PM-15 — "Comenzar etapa": reclamo y quién la está trabajando
1. Crea (o usa) dos cuentas Operario de la misma área (por ejemplo, Bordado) y abre sesión con cada una en una ventana distinta del navegador.
2. Con un trabajo en producción en esa etapa, ambas cuentas deben ver la misma actividad en «Mis actividades», sin responsable asignado, con un botón «Comenzar etapa».
3. Presiona «Comenzar etapa» en la primera ventana. **Esperado:** pasa a mostrar «Completar etapa» solo en esa ventana.
4. Refresca (o vuelve a entrar a) la segunda ventana. **Esperado:** ya no ve «Comenzar etapa»; ve «En curso por <nombre de la primera persona>», sin botón para completarla.
5. Si la segunda persona llega a presionar «Comenzar etapa» casi al mismo tiempo que la primera (dos clics simultáneos, por ejemplo abriendo la red lenta del navegador para alcanzar a hacer ambos clics), solo una de las dos debe quedar como responsable; la otra recibe un aviso de que la etapa ya no está disponible para tomar, sin error feo ni pantalla rota.
6. Con una tercera cuenta Operario recién creada (que nunca tomó esta etapa), intenta completarla llamando directamente a la pantalla de esa actividad: no debe poder completarla.
7. La persona que sí tomó la etapa la completa con normalidad; el trabajo avanza a la siguiente etapa como siempre.
8. Como `marcela` (Producción), confirma que puede completar una etapa que nadie ha tomado aún, sin necesidad de "Comenzar etapa" primero (atajo para el caso de que alguien olvide tomarla).

**Confirmado, 19-11-2026:** verificado también a nivel de API con dos solicitudes HTTP disparadas en paralelo (`Promise.all`) contra el mismo endpoint, repetido 3 veces sin fallas: siempre gana exactamente una.

**Confirmado por el equipo, 19-11-2026:** probado a mano con dos cuentas reales tras reiniciar el servidor (el intento anterior había corrido contra un servidor viejo, levantado antes de este cambio, de ahí la discrepancia). Con el servidor actualizado, el segundo operario ve "En curso por Luis Cárdenas" y las etapas completadas se reflejan en ambas cuentas. Ver punto A más abajo: a partir de ahora el propio sistema avisa cuando el servidor quedó desactualizado respecto a la pantalla, para que este tipo de confusión no se repita.

### PM-16 — Bitácora con texto humano y búsqueda de trabajo
1. Ingresa como `koto` (Administrador) y ve a «Bitácora». **Esperado:** sin escribir nada, ya se ven los últimos eventos de todos los trabajos (no una pantalla vacía pidiendo buscar primero).
2. Revisa esos eventos: no debe aparecer ningún código interno (`DISENO_APROBADO`, `TRABAJO_CREADO`, etc.); en su lugar, frases en español («Diseño aprobado», «Solicitud creada»...), la fecha en formato legible, y quién lo hizo (nombre y rol), no un identificador numérico.
3. En el campo de búsqueda escribe parte de un código o descripción de un trabajo (por ejemplo `KT-2026` o una palabra de la descripción). **Esperado:** aparece una lista para elegir (sin tener que memorizar el código exacto) y, al elegir uno, la bitácora se filtra a los eventos de ese trabajo solamente.
4. Escribe el código completo de un trabajo de una sola vez (pegarlo, o escribirlo muy rápido). **Esperado:** filtra igual, sin necesidad de elegirlo de la lista.
5. Con un trabajo filtrado, presiona «Ver los últimos eventos de todos». **Esperado:** vuelve a la vista general sin filtro.
6. Revisa un evento de "Etapa de producción tomada" o completada: el detalle debe nombrar la etapa con su nombre real (por ejemplo "Preparación de matriz de bordado"), no solo un número de orden.
7. Revisa un evento de un rechazo: el detalle debe mostrar «Motivo: …» con el texto completo, no solo "Diseño rechazado".

**Confirmado, 19-11-2026:** verificado en el entorno aislado con navegador real (Playwright): búsqueda progresiva, pegado del código completo, botón para quitar el filtro, ausencia de códigos internos, formato «Nombre · Rol», y el detalle de etapa y de motivo de rechazo, todos correctos.

### PM-17 — Aviso de versión nueva del servidor
1. Con la aplicación abierta y con sesión iniciada, en otra terminal detén el servidor y vuelve a levantarlo (por ejemplo, tras aplicar una corrección).
2. Sigue navegando con normalidad (sin recargar la página a mano). **Esperado:** en la primera acción que llame a la API después de que el servidor nuevo esté arriba, aparece un aviso fijo y discreto: «Hay una versión nueva. Recarga la página para ver los últimos cambios.» con un botón «Recargar».
3. Verifica que el aviso NO interrumpe nada: la pantalla donde estabas sigue funcionando con normalidad (se puede seguir escribiendo, navegando, etc.) mientras el aviso está visible.
4. Presiona «Recargar». **Esperado:** la página se recarga y, si la sesión sigue vigente, vuelve a la misma pantalla con normalidad.
5. Si el servidor NO cambió de versión durante toda la sesión, el aviso nunca debe aparecer (no es un aviso que salga "por las dudas" cada cierto tiempo).

**Confirmado, 19-11-2026:** verificado con un navegador real contra el entorno aislado, interceptando una respuesta para simular el cambio de versión (`X-SST-Version` distinta): el aviso aparece una sola vez, la pantalla sigue funcionando, y "Recargar" funciona. Esta corrección nace de una confusión real del equipo al probar PM-15 contra un servidor que no se había reiniciado (ver nota en PM-15).

### PM-18 — "Liberar etapa"
1. Como un operario que ya tomó una etapa (ver PM-15), en "Mis actividades" debe aparecer, junto a "Completar etapa", un botón "Liberar etapa".
2. Presiónalo y confirma en el diálogo. **Esperado:** la etapa queda disponible de nuevo: "Mis actividades" ahora muestra "Comenzar etapa" otra vez (para ti y para cualquier otro operario del área).
3. Intenta liberar una etapa que nadie ha tomado (por ejemplo, llamando a la acción cuando ya está libre): debe avisar con claridad que no hay nada que liberar, no un error confuso.
4. Con dos cuentas Operario del área: que una tome la etapa y la otra intente liberarla. **Esperado:** no puede (solo quien la tomó, o Producción, puede liberarla).
5. Como `marcela` (Producción), en el detalle de un trabajo con una etapa tomada por un operario, debe aparecer un botón "Liberar [nombre de la etapa]". Úsalo. **Esperado:** la etapa queda disponible de nuevo para cualquiera del área.
6. Revisa la Bitácora de ese trabajo: debe aparecer un evento "Etapa liberada (queda disponible para tomar de nuevo)".

**Confirmado, 19-11-2026:** verificado a nivel de API con tres escenarios (CP-81, CP-82, CP-83): nadie puede liberar una etapa sin tomar, un operario ajeno no puede liberar la de otro, y quien la tomó (o Producción) sí puede, quedando realmente disponible después. Verificado también con navegador real (pasos 1 a 6 de arriba): en esa verificación se encontró y corrigió DEF-28 (el botón no aparecía para Producción por un permiso que faltaba sincronizar en el cliente).

### PM-19 — Saludo personalizado
1. Ingresa con cualquier cuenta. **Esperado:** el encabezado, donde antes solo decía el rol (por ejemplo "Operario"), ahora dice «Hola, &lt;primer nombre&gt;» (por ejemplo «Hola, Luis»).
2. Ve a «Mi cuenta». **Esperado:** el título dice «Hola, &lt;nombre completo&gt;», y debajo se ve el Rol, el Área (si corresponde) y el Correo con claridad.
3. Con una cuenta sin área asignada (por ejemplo Producción), confirma que "Mi cuenta" simplemente no muestra la fila de Área, sin espacios en blanco raros ni errores.
4. A 390 px de ancho, confirma que ni el encabezado ni "Mi cuenta" producen scroll horizontal, incluso con un nombre o correo largos.

**Confirmado, 19-11-2026:** verificado con un navegador real a 1280 y 390 px.

### PM-20 — Historial humano en el detalle de un trabajo
1. Como `jorge` (Vendedor), entra al detalle de una de tus solicitudes. **Esperado:** bajo la descripción aparece una línea en lenguaje claro con la etapa actual y la siguiente (o "ya terminó", o "todavía no entra a producción"); más abajo, una sección "Historial" con eventos en texto humano (no códigos), con fecha, quién lo hizo y detalle útil — igual que la Bitácora de Administración, pero acotado a este trabajo.
2. Como `valentina` (Diseño), en «Bandeja de diseño» → "En diseño", debe aparecer un botón "Ver detalle e historial" junto a "Enviar propuesta". Úsalo: debe mostrar el mismo historial mientras el trabajo sigue en diseño.
3. Como `marcela` (Producción) o `koto` (Administración), en el detalle de cualquier trabajo el historial debe incluir también los eventos de diseño (propuesta enviada, aprobada o rechazada), que Operario no ve.
4. Como un operario (por ejemplo `luis`), en «Mis actividades» debe aparecer, junto a "Ver materiales y medidas", un botón "Ver historial". Úsalo: debe mostrar el historial de ESE trabajo, acotado (sin eventos de diseño), sin salir de "Mis actividades".
5. Intenta ver el historial de un trabajo de OTRA área o de otra persona vendedora (si puedes forzar la URL o la llamada): debe rechazarse igual que el resto del detalle.
6. En un trabajo ya en producción que todavía no tiene materiales registrados, la sección "Materiales" debe destacar esa falta con un aviso visible, no solo una línea de texto más.

**Confirmado, 19-11-2026:** verificado con navegador real en los cuatro roles con acceso (Vendedor, Diseño, Producción, Operario) contra el entorno aislado, y con 1 prueba automática (CP-84) que cubre los límites de alcance por rol.

### PM-21 — Aprobar/rechazar con trazabilidad completa
1. Como `marcela` (Producción), entra a «Aprobaciones» → «Ver y decidir» sobre cualquier propuesta pendiente. **Esperado:** bajo el título aparece «Solicitó: &lt;nombre&gt; (Vendedor) · Propuesta enviada por: &lt;nombre&gt; (Diseño)».
2. Presiona «Aprobar». **Esperado:** el diálogo dice la etapa que sigue y el área (por ejemplo: «Pasa a producción: empieza la etapa "Impresión en papel transfer" (área Sublimación), visible para esa área en "Mis actividades".»). Confírmalo.
3. **Esperado tras confirmar:** la pantalla va directo al detalle del trabajo (no a la lista de aprobaciones); ahí se ve de inmediato «Diseño aprobado» en el Historial y la nueva etapa actual en lenguaje claro.
4. Con otra propuesta pendiente, presiona «Rechazar», escribe (o elige) un motivo, y confirma ese primer paso. **Esperado:** aparece un segundo diálogo de confirmación que dice a quién se rechaza (quien envió la versión), que el trabajo de quien lo solicitó vuelve a "En diseño", quién puede retomarlo, y repite el motivo escrito.
5. Confirma el rechazo. **Esperado:** la pantalla va al detalle del trabajo; el Historial muestra «Diseño rechazado» con «Motivo: …» completo.

**Confirmado, 19-11-2026:** verificado con navegador real (aprobación y rechazo completos, revisando el texto exacto de ambos diálogos) y con prueba automática (CP-85).

### PM-22 — Novedades para Vendedor y Diseño
1. Como `marcela` (Producción), aprueba o rechaza una propuesta pendiente.
2. Como `jorge` (Vendedor, quien registró esa solicitud), ingresa o navega a cualquier pantalla. **Esperado:** en el menú, junto a "Novedades", aparece un número (el contador de novedades sin ver).
3. Entra a «Novedades». **Esperado:** aparece un resumen ("N novedades nuevas…") y, en la lista, el evento humano correspondiente ("Diseño aprobado" o "Diseño rechazado", con fecha y detalle), igual de legible que la Bitácora de Administración.
4. Navega a cualquier otra pantalla y vuelve a mirar el menú. **Esperado:** el número ya no aparece (se marcó como vista al abrir "Novedades").
5. Como `valentina` (Diseño, quien envió esa propuesta), entra a «Novedades». **Esperado:** ve el mismo aviso de aprobación o rechazo de SU propuesta (y de ninguna otra que no haya enviado ella).
6. Avanza un trabajo hasta que termine todas sus etapas de producción. **Esperado:** tanto Vendedor como Diseño ven en Novedades que ese trabajo terminó (Diseño, en particular, ya no puede ver el detalle de un trabajo terminado, así que esta es su única forma de saberlo).

**Confirmado, 19-11-2026:** verificado con 4 pruebas automáticas (CP-86 a CP-89: sin permiso para otros roles, contador correcto, aislamiento entre personas, aviso de término) y con navegador real (contador en el menú, lista, y que baja a 0 tras visitarla).

### PM-23 — Vista previa de PDF/imagen sin bloqueo (punto 6)
1. Como `valentina` (Diseño), envía una propuesta real con un archivo PDF (uno de verdad, no solo texto con la extensión .pdf).
2. Como `marcela` (Producción), entra a «Aprobaciones» → «Ver y decidir» sobre esa propuesta. **Esperado:** bajo "Ver archivo completo" aparece el PDF renderizado dentro de la misma pantalla, SIN el ícono de "contenido bloqueado" del navegador.
3. Repite con una propuesta que adjunte una imagen (PNG o JPG): también debe verse la vista previa, sin bloqueo.
4. Con las herramientas de desarrollador del navegador (pestaña Red), confirma que la respuesta de `/api/disenos/.../archivos/...` trae `Content-Security-Policy: frame-ancestors 'self'` (no `'none'`) y `X-Frame-Options: SAMEORIGIN` (no `DENY`).

**Confirmado, 19-11-2026 (parcial):** verificado con certeza a nivel de protocolo HTTP (prueba automática CP-52 extendida, y una llamada directa desde el navegador contra el servidor real: el encabezado cambió de `'none'` a `'self'`, que es la regla exacta que controla si el navegador bloquea el `<iframe>`). **No pude confirmar el paso 2 con una captura de pantalla** porque el navegador sin interfaz (headless) que uso para verificar no renderiza el PDF dentro del `<iframe>` de ninguna manera en esta automatización (se ve igual de vacío con el encabezado roto o corregido): es una limitación de automatizar este caso puntual, no de la corrección en sí. Pido que alguien del equipo haga el paso 2 y 3 a mano, con un navegador normal, para la confirmación visual final.

### PM-24 — URL base configurable de los enlaces
1. En `.env`, define `SST_URL_BASE=https://ejemplo-de-dominio-real.cl` (sin "/" al final) y reinicia el servidor.
2. Como Administración, genera un enlace de primer acceso (PM-14) o de restablecimiento (PM-12). **Esperado:** el enlace completo empieza con `https://ejemplo-de-dominio-real.cl/#/restablecer/…`, sin importar en qué URL tenga Administración abierto el navegador en ese momento (por ejemplo, podría estar usando un túnel o una IP interna distinta).
3. Sin definir `SST_URL_BASE` (quitarla de `.env` y reiniciar), genera otro enlace. **Esperado:** usa el valor por defecto `http://localhost:<SST_PUERTO>`.

**Confirmado, 19-11-2026:** verificado con prueba automática (CP-90, con una URL base distinta configurada en el entorno de prueba) y con navegador real contra el entorno aislado (que fija `SST_URL_BASE` a su propio puerto 3100): el enlace generado usó ese puerto, no el 3000 por defecto.

### PM-25 — "Mis solicitudes" con línea de tiempo (punto 9)
1. Como `jorge` (Vendedor), ve a «Mis solicitudes». **Esperado:** ya no es una lista plana: cada tarjeta con etapas de producción (trabajos en producción, detenidos o terminados) muestra la línea de tiempo completa (una fila por etapa, con su estado y quién la tiene, igual que en el detalle del trabajo).
2. En un trabajo "Atrasado", revisa la tarjeta. **Esperado:** aparece «Debía estar listo el &lt;fecha de compromiso&gt; y todavía no termina.», no solo el chip "Atrasado" sin contexto.
3. En un trabajo en producción, revisa la línea antes de la línea de tiempo. **Esperado:** dice en lenguaje claro la etapa actual (y quién la tiene, o que nadie la ha tomado) y cuál sigue, o que es la última etapa.
4. En un trabajo que aún no entra a producción (en diseño o esperando aprobación), confirma que dice "Todavía no entra a producción…", sin mostrar una línea de tiempo vacía.
5. A 390px de ancho, confirma que las tarjetas con línea de tiempo no producen scroll horizontal.
6. Confirma que "Novedades" sigue siendo accesible desde el menú (con su contador) sin que "Mis solicitudes" repita la misma lista.

**Confirmado, 19-11-2026:** verificado con prueba automática (CP-91: por defecto el listado no trae la línea de tiempo; con `conEtapas=true` la trae completa, con el mismo contenido que el detalle) y con navegador real a 1280 y 390px.
