# Resumen para estudiar — Funcionalidades 3, 4 y 5

Pensado para explicarle esto a alguien que no vio el código (un profesor, por ejemplo): qué hace
cada funcionalidad, por qué se diseñó así y no de otra forma, y las preguntas más probables con su
respuesta corta. El detalle técnico completo está en `docs/PLAN_FASES.md` y
`docs/CAMBIOS_RESPECTO_AL_DISENO.md`; esto es la versión para tenerla clara de memoria.

---

## Funcionalidad 3 — Cierre de sesión por inactividad

**Qué hace:** si una cuenta no hace ninguna acción real durante 30 minutos, el servidor cierra la
sesión solo. La próxima vez que esa persona intente hacer algo, la manda de vuelta a la pantalla de
ingreso con el aviso «Tu sesión se cerró por inactividad. Ingresa de nuevo.».

**Por qué se hizo así:**
- Ya existía un temporizador en el navegador que avisaba de la inactividad, pero era solo
  apariencia: no cerraba nada en el servidor. Si alguien dejaba el navegador abierto y el propio
  código seguía renovando el token de acceso en segundo plano (cosa que hace automáticamente, sin
  que la persona haga nada), la sesión real podía seguir viva hasta 8 horas sin que hubiera una
  sola acción humana de por medio. Eso es un hueco de seguridad real: una sesión abandonada en un
  computador compartido queda viva mucho más tiempo del que parece.
- La solución: una columna nueva (`sesion.ultima_actividad`) que se actualiza cada vez que la
  cuenta hace algo de verdad (abrir una lista, guardar un formulario, etc.), **pero no** cuando el
  navegador renueva el token solo. Si pasan más de 30 minutos entre una acción real y la siguiente,
  el servidor revoca la sesión ahí mismo.

**Preguntas probables:**
- *¿Por qué 30 minutos y no 15 o 60?* Es un número razonable para esta aplicación (no maneja datos
  médicos ni financieros que pidan algo más estricto); queda en una sola constante
  (`entorno.minutosInactividad`) fácil de cambiar si el equipo decide otro valor.
- *¿Por qué no bastaba el temporizador del navegador que ya existía?* Porque alguien con
  herramientas de desarrollador puede desactivar JavaScript del cliente o simplemente ignorar ese
  aviso; la única forma de que la regla sea real es que la aplique el servidor, no el navegador de
  quien la usa.
- *¿Qué pasa si cierro el navegador sin salir?* Lo mismo: en algún momento pasan 30 minutos sin
  actividad real y la sesión queda revocada en el servidor, aunque nadie haya tocado "Salir".

---

## Funcionalidad 4 — Restablecimiento de contraseña por enlace

**Qué hace:** si alguien olvida su contraseña, no puede recuperarla sola (no hay correo en este
prototipo). Una persona de Administración entra a "Usuarios", presiona "Generar enlace" en la
cuenta de esa persona, y le entrega ese enlace por el medio que ya usen (en persona, chat, etc.). La
persona abre el enlace sin necesitar iniciar sesión y ahí crea una contraseña nueva. El enlace vence
en 30 minutos y sirve una sola vez.

**Por qué se hizo así:**
- Sin servidor de correo, no se puede mandar un enlace "a la cuenta de la persona" de forma
  automática y verificada; por eso lo genera una persona de confianza (Administración) y se
  entrega por fuera del sistema, igual que ya se hace con la contraseña inicial al crear una
  cuenta.
- El enlace no es el token en sí mismo guardado en la base: se guarda solo su **hash** (como una
  huella digital de un solo sentido), igual que las sesiones. Así, aunque alguien leyera la base de
  datos, no podría reconstruir el enlace real.
- Al usarlo, se revocan todas las sesiones activas de esa cuenta y se le quita cualquier bloqueo
  por intentos fallidos: tiene sentido, porque si alguien necesitó este camino es porque
  probablemente ya intentó entrar mal varias veces antes.

**Preguntas probables:**
- *¿Por qué no se manda un correo?* Porque este prototipo no tiene servidor de correo configurado;
  se optó por un camino manual y auditado en vez de simular un envío de correo que no sería real.
- *¿Qué pasa si Administración es quien pierde el acceso?* Es una pregunta real que el equipo hizo
  y que está documentada (no resuelta con código todavía) en `docs/CAMBIOS_RESPECTO_AL_DISENO.md`:
  la respuesta corta es "mantener más de una cuenta Administración" para el caso común, y un script
  de emergencia que solo se puede ejecutar con acceso directo al servidor para el caso extremo.
- *¿Por qué vence en 30 minutos y no queda disponible siempre?* Para que, si alguien más llega a
  ver el enlace por error (una captura de pantalla vieja, por ejemplo), ya no sirva para nada.

---

## Funcionalidad 5 — Verificación en dos pasos (MFA por TOTP)

**Qué hace:** Administración y Producción pueden activar, desde "Mi cuenta", un segundo paso al
ingresar: además de la contraseña, deben escribir un código de 6 dígitos que cambia cada 30
segundos, generado por una aplicación en su teléfono (Google Authenticator, por ejemplo). Se activa
escaneando un código QR una sola vez.

**Por qué se hizo así:**
- TOTP (Time-based One-Time Password) es el mismo mecanismo que usan la mayoría de las cuentas con
  verificación en dos pasos (Google, GitHub, bancos). No hay que inventar nada nuevo: existe un
  estándar (RFC 6238) que cualquier aplicación de autenticación ya sabe leer, por eso basta un
  código QR en vez de tener que construir una aplicación propia.
- El "secreto" que genera los códigos se guarda **sin cifrar** en la base de datos. Esto suena raro
  al principio, pero es necesario: a diferencia de una contraseña (que solo hay que comparar, nunca
  recuperar), el servidor necesita poder volver a calcular el código cada vez que alguien ingresa,
  así que tiene que poder leer el secreto real, no solo una huella de un sentido. La protección acá
  es el control de acceso a la base de datos, igual que para la contraseña ya hasheada.
- Solo para Administración y Producción: son los dos roles con las acciones más sensibles (manejar
  cuentas de todo el equipo, y aprobar o rechazar diseños). Por ahora es opcional, no obligatorio
  (ver más abajo).
- Un código de 6 dígitos solo vale una vez: si alguien lo usa (para entrar o para activar el MFA),
  ese mismo código ya no sirve una segunda vez, aunque todavía esté "vigente" según el reloj. Esto
  evita que, si alguien llegara a ver el código por encima del hombro de la persona, pueda
  reutilizarlo después.

**Preguntas probables:**
- *¿Por qué el secreto no está cifrado si es tan sensible?* Porque hay que poder recalcular el
  código en cada ingreso, no solo compararlo; cifrarlo solo movería el problema a dónde guardar la
  clave de cifrado, sin agregar protección real en este prototipo (no hay una bóveda de llaves
  separada de la base de datos).
- *¿Qué pasa si alguien pierde el teléfono?* Puede desactivarlo él mismo confirmando su contraseña,
  o Administración puede desactivarlo por esa persona sin pedirle nada (por eso existe ese botón:
  es la vía de recuperación para este caso exacto).
- *¿Cómo se probó que el cálculo del código es correcto, y no algo "que parece funcionar"?* Se
  comprobó contra los 18 casos de prueba oficiales que publica el mismo estándar (RFC 6238,
  Apéndice B) y, por separado, contra dos formas de calcular el mismo código escritas de manera
  independiente (una propia, hecha solo con las herramientas de criptografía de Node, y una
  librería de otro autor distinto a la que usa la aplicación): las tres coinciden siempre. Además,
  el equipo lo probó con un teléfono real, no solo con un script.
- *¿Es obligatorio hoy?* No, es opcional para quien quiera activarlo. Si el informe del proyecto
  exige que sea obligatorio para Administración y Producción, es una discrepancia conocida y
  reportada (no corregida todavía): la forma más simple de exigirlo sería no dejar usar el sistema
  con normalidad hasta que esos dos roles lo configuren en su primer ingreso.
