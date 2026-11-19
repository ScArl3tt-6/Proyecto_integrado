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

### PM-14 — Crear una cuenta nueva desde "Usuarios"
1. Ingresa como `koto` (Administrador), ve a «Usuarios» y completa «Crear cuenta» con un nombre, un correo que no exista todavía, un rol, y una contraseña inicial de 12 o más caracteres.
2. **Esperado:** «Cuenta creada. Entrégale la contraseña inicial en mano; ella la cambiará desde "Mi cuenta".» y la cuenta nueva aparece de inmediato en la lista de abajo, con el rol y el área correctos.
3. Cierra sesión e ingresa con el correo y la contraseña que acabas de crear. **Esperado:** entra con normalidad a la pantalla de inicio del rol asignado.
4. Vuelve a crear una cuenta con el mismo correo que ya usaste. **Esperado:** aviso claro de que el correo ya está registrado, sin crear una segunda cuenta.
5. Intenta crear una cuenta con una contraseña de menos de 12 caracteres o con el nombre repetido dentro de la contraseña: el error aparece junto al campo antes de llamar a la API (ver PM-06).

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

### PM-16 — Bitácora con texto humano y búsqueda de trabajo
1. Ingresa como `koto` (Administrador) y ve a «Bitácora». **Esperado:** sin escribir nada, ya se ven los últimos eventos de todos los trabajos (no una pantalla vacía pidiendo buscar primero).
2. Revisa esos eventos: no debe aparecer ningún código interno (`DISENO_APROBADO`, `TRABAJO_CREADO`, etc.); en su lugar, frases en español («Diseño aprobado», «Solicitud creada»...), la fecha en formato legible, y quién lo hizo (nombre y rol), no un identificador numérico.
3. En el campo de búsqueda escribe parte de un código o descripción de un trabajo (por ejemplo `KT-2026` o una palabra de la descripción). **Esperado:** aparece una lista para elegir (sin tener que memorizar el código exacto) y, al elegir uno, la bitácora se filtra a los eventos de ese trabajo solamente.
4. Escribe el código completo de un trabajo de una sola vez (pegarlo, o escribirlo muy rápido). **Esperado:** filtra igual, sin necesidad de elegirlo de la lista.
5. Con un trabajo filtrado, presiona «Ver los últimos eventos de todos». **Esperado:** vuelve a la vista general sin filtro.
6. Revisa un evento de "Etapa de producción tomada" o completada: el detalle debe nombrar la etapa con su nombre real (por ejemplo "Preparación de matriz de bordado"), no solo un número de orden.
7. Revisa un evento de un rechazo: el detalle debe mostrar «Motivo: …» con el texto completo, no solo "Diseño rechazado".

**Confirmado, 19-11-2026:** verificado en el entorno aislado con navegador real (Playwright): búsqueda progresiva, pegado del código completo, botón para quitar el filtro, ausencia de códigos internos, formato «Nombre · Rol», y el detalle de etapa y de motivo de rechazo, todos correctos.
