# SST Kotoduo — contexto permanente para Claude Code

> Este archivo se copia a la raíz del repositorio (`sst-kotoduo/CLAUDE.md`). Claude Code lo lee solo al abrir la carpeta.
> Todo el trabajo, los mensajes, los commits y la documentación van **en español**.

## 1. Qué es este proyecto

Sistema de Seguimiento y Trazabilidad de Trabajos Productivos (SST) para **Kotoduo**, productora publicitaria de Temuco (uniformes, bordado, sublimación, letreros, grabado, impresión). El problema: los trabajadores no saben en qué etapa está cada trabajo ni qué actividad sigue, y dependen de las personas que coordinan (Koto, Berny, Bianca, René) y de una planilla Excel.

Es un trabajo académico (asignatura Proyecto Integrado, INACAP Temuco, sección IEC-N4-C2). Se evalúa con la **Evaluación Sumativa 3 (ES3)**: aplicación **funcionando** (no maqueta), informe de 13 secciones y demostración en vivo de 10 minutos ante varios docentes el **viernes 27 de noviembre de 2026**. Las integrantes son tres estudiantes; cada una debe poder explicar y defender cualquier parte del sistema.

## 2. Qué se califica (rúbrica ES3, 100 puntos) — nivel buscado: Destacado en todo

| Indicador | Pts | Lo que se espera (nivel Destacado) |
|---|---|---|
| 3.1.1.1 Interfaz ↔ necesidades del negocio | 5 | 100 % de los procesos requeridos operables en pantalla, diseño intuitivo y atractivo |
| 3.1.1.2 Lineamientos estéticos y funcionales | 5 | Consistencia total y originalidad, sin sacrificar usabilidad |
| 3.1.2.3 Estructura de la base de datos | 5 | Relaciones correctas, índices y modelos eficientes para cada tipo de dato |
| 3.1.2.4 Optimización y normalización | 5 | Normalización avanzada y optimización medible |
| 3.1.3.5 Patrones de seguridad | 5 | Múltiples patrones avanzados y protección contra vulnerabilidades conocidas |
| 3.1.3.6 Colaboración en equipo | 5 | Documentación y contribuciones verificables |
| 3.1.4.7 Configuración del entorno | 10 | Funcional, eficiente y documentada paso a paso |
| 3.1.4.8 Documentación de la implementación | 5 | Completa; permite repetir y mantener |
| 3.1.5.9 Cobertura del plan de pruebas | 10 | 100 % de casos de uso y escenarios, con borde y estrés |
| 3.1.5.10 Ejecución del protocolo de pruebas | 10 | Se sigue el protocolo y se documenta exhaustivamente lo observado |
| 3.1.5.11 Validación de resultados | 10 | Análisis completo y recomendaciones |
| 3.1.6.12 Esperado vs obtenido | 10 | Discrepancias con causas, análisis detallado |
| 3.1.6.13 Recomendaciones | 5 | Precisas, atadas a hallazgos, orientadas a mejora continua |
| 3.1.6.14 Respuesta a preguntas | 5 | Respuestas claras y fundamentadas (se evalúa en vivo) |
| 3.1.6.15 Informe final | 5 | Sigue la plantilla de 13 secciones |

La guía del docente advierte: una captura aislada no demuestra nada; una interfaz que muestra «Guardado» pero no recupera el dato no está demostrada; ocultar un botón no es autorización; un resultado esperado copiado como «obtenido» es un error grave; no se deben borrar los fallos tras corregirlos.

## 3. Estado de partida (verificado el 13-11-2026)

- Node.js 24 + Express 5 (CommonJS). Front-end en `web/` (HTML, CSS y JS sin build ni dependencias), servido por la misma API. 10 pantallas, 5 perfiles.
- Base estructurada: hoy **PGlite** (PostgreSQL embebido). Base documental: **MongoDB 8.3 real** en `mongodb://127.0.0.1:27027`.
- 45 pruebas Jest aprobadas (CP-01…CP-46 salvo CP-33), cobertura de líneas 98,15 %. ESLint con `eslint-plugin-security` sin avisos. Prueba de carga con autocannon (CP-33).
- Controles ya implementados: Argon2id, JWT de 15 min con sesión revocable y renovación rotativa, CSRF de doble envío, RBAC verificado en servidor con regla de área para operarios, validación estricta con Zod, bloqueo tras 5 intentos fallidos (15 min), límites de tasa por cuenta e IP, mensaje único de error al ingresar, cabeceras Helmet/CSP/HSTS, `Cache-Control: no-store`, bitácora solo por inserción, lista blanca de archivos.
- **Brechas conocidas (a resolver):**
  1. Los materiales (RF-08) solo se **consultan**: ningún endpoint ni pantalla los registra.
  2. Los archivos de diseño **no se guardan**: solo se recibe la cabecera en base64 para validar la firma y el SHA-256 se calcula sobre esa cabecera, no sobre el archivo. Producción aprueba diseños que nunca puede ver.
  3. MFA, recuperación de contraseña y cierre por inactividad están planificados pero no implementados (la pantalla de ingreso dice «Próximamente»).
  4. PostgreSQL embebido no se puede inspeccionar con pgAdmin.
  5. Las pruebas manuales PM-01…PM-08 nunca se ejecutaron.
  6. Paleta rosada que no corresponde a la marca.
  7. El repositorio de GitHub tiene un solo commit de una sola autora.
- Documentos de referencia ya entregados (no los modifiques): Informe 1 (diagnóstico) e Informe 2 (diseño). El Informe 2 es el «diseño aprobado»: cualquier desvío se registra en `docs/CAMBIOS_RESPECTO_AL_DISENO.md`.

## 4. Reglas no negociables

1. **Nada inventado.** Los resultados de pruebas y mediciones salen solo de ejecuciones reales. Guarda las salidas literales en `evidencias/AAAA-MM-DD_HH-mm/`. Si algo falla, regístralo en `evidencias/defectos.md` (DEF-nn) sin borrarlo; después de corregir, agrega la nueva ejecución. Nunca marques «Aprobado» sin ejecutar. Si algo no se pudo comprobar, escribe «No ejecutado» y por qué.
2. **Sin secretos en el repositorio.** `.env`, credenciales de demostración y datos locales están en `.gitignore`. Solo se versiona `.env.example` con valores ficticios. Antes de cada commit revisa `git diff --staged` buscando claves, tokens o contraseñas. No imprimas contraseñas en consola ni en logs.
3. **Seguridad primero.** Mantén todos los controles existentes. Consultas siempre parametrizadas (`$1`, `$2`); entradas validadas con esquemas estrictos de lista blanca; permisos verificados en el servidor; mensajes de error genéricos hacia el usuario; eventos relevantes a la bitácora. Nunca expongas hashes, secretos TOTP ni trazas internas en respuestas.
4. **Calidad.** `npm run lint` con 0 errores y 0 avisos; `npm run pruebas` en verde; cobertura de líneas ≥ 90 % (hoy 98 %, no bajar de ahí sin justificarlo). Cada funcionalidad nueva trae sus pruebas (normal, alternativo/error y borde).
5. **Coherencia con el diseño.** Respeta la arquitectura (monolito modular: `src/modulos/*`, `src/dominio`, `src/middleware`, `src/db`) y el vocabulario del Informe 2 (perfiles, estados, entidades, CP-xx). Todo desvío va en `docs/CAMBIOS_RESPECTO_AL_DISENO.md` con: qué cambió, por qué, impacto y fecha.
6. **Front-end sin dependencias ni CDN.** La CSP exige `script-src 'self'`: sin scripts ni estilos en línea, sin fuentes remotas. Si necesitas ampliar la CSP (por ejemplo `img-src data:` para el QR), hazlo al mínimo y documéntalo.
7. **Git.** Trabaja siempre en una rama `feature/...` o `fix/...`, nunca en `main`. Commits pequeños con mensaje en español («Agrega …», «Corrige …»). No hagas `push` ni reescribas historial: lo hace la persona. No toques `.git` de otra forma.
8. **Estilo.** Lee el código vecino antes de escribir. CommonJS con `'use strict'`, identificadores de dominio en español (como ya existen), sin comentarios que expliquen lo obvio.
9. **Cierre de cada tarea.** Informa: qué cambió (archivos), cómo verificarlo (comandos exactos), qué evidencia quedó guardada y qué queda pendiente o limitado. Si una instrucción es ambigua o implica cambiar el alcance, **pregunta antes de decidir**.
10. **Explica como si hablaras con una estudiante.** Las integrantes deben entender cada cambio. Al terminar cada fase, entrega un resumen de «qué hace, por qué se hizo así y cómo se lo explicarías a un profesor».

## 5. Comandos habituales (se irán ampliando)

```
npm install
npm run lint
npm run pruebas
npm run demo:sembrar     # solo con el servidor apagado
npm run demo
```

## 6. Modo de trabajo del equipo

1. **Sesiones conjuntas.** Las tres integrantes trabajan juntas en cada sesión con Claude Code; las fases no se reparten para avanzar cada una por su cuenta en paralelo.
2. **Push y revisión.** El `push` a GitHub lo hace siempre Catalina Quezada desde su propia cuenta. Las solicitudes de incorporación (Pull Requests) las revisa una integrante distinta de quien las creó.
3. **Autoría honesta.** Cada commit lleva una línea `Co-authored-by: Nombre <correo>` por cada integrante que participó en esa sesión. Antes de crear un commit, pregunta quiénes participaron hoy y pide sus correos exactos — nunca los inventes ni los reutilices de una sesión anterior sin confirmar.
4. **Bitácora de sesiones.** Al cerrar cada sesión de trabajo, agrega una entrada nueva a `docs/BITACORA_DE_SESIONES.md` con: fecha, integrantes participantes, objetivo de la sesión, qué se hizo, commits o Pull Requests generados, decisiones tomadas y pendientes para la próxima vez.
5. **Logo.** El logo completo (emblema + texto «kotoduo») se usa solo sobre fondo oscuro (cabecera azul-950, pantalla de ingreso, ícono de arranque de la PWA). Sobre fondo claro se usa solo el emblema circular, sin el texto, hasta que Kotoduo entregue una versión con el texto en color oscuro.
6. **Ante la duda, pregunta.** Si no está claro qué integrante escribe un mensaje, o para quién es una instrucción, o a quién corresponde un dato sensible (correo, contraseña, token), pregunta antes de asumir o de usarlo.
