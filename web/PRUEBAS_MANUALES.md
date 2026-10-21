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

## Pasos detallados

### PM-01 — Ingreso con credenciales incorrectas
1. Ve a `#/ingreso`. Escribe un correo que no existe (`nadie@kotoduo.test`) y cualquier contraseña. Ingresar.
2. Repite con un correo real de `.demo-credenciales.txt` pero con la contraseña cambiada.
3. **Esperado:** en ambos casos aparece el mismo aviso: «Correo o contraseña incorrectos. Si fallas 5 veces, tu cuenta se bloquea 15 minutos por seguridad.». Nada en la pantalla ni en la pestaña de Red del navegador distingue un caso del otro.
4. Tras el segundo intento fallido con el mismo correo debe aparecer además «¿Olvidaste tu contraseña? Pídele a Administración que revise tu cuenta.».

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
