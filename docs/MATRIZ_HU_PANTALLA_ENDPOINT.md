# Matriz de trazabilidad HU — Pantalla — Endpoint (Funcionalidad 6)

**Nota sobre la columna "HU / Requisito":** esta sesión de Claude Code no tenía cargado el
Informe 2 original del proyecto (el documento que define la numeración oficial de historias de
usuario). Donde el código ya tenía una referencia real a un requisito (comentarios `HU-NN / RF-NN`
en `src/modulos/*`), se usa tal cual aparece ahí. Donde no existe esa referencia en el código (las
funcionalidades de seguridad agregadas después: cierre por inactividad, restablecimiento de
contraseña, MFA, y algunas rutas de infraestructura de autenticación), la columna describe el
requisito en palabras en vez de inventar un número de HU. El equipo debería cotejar esta tabla
contra su copia del Informe 2 y completar la numeración que falte.

Construida leyendo directamente `web/js/router.js` (pantallas reales), `src/dominio/permisos.js`
(matriz RBAC), los cinco archivos `src/modulos/*/rutas*.js` (endpoints reales, método, ruta y
permiso) y qué pantalla llama a qué endpoint (`grep` de `api.get/post/patch` en cada archivo de
`web/js/pantallas/`), no de memoria.

Estado: **Implementada** (endpoint real + al menos una prueba automática real que lo ejercita),
**Parcial** (existe pero falta alguna pieza — se explica cuál), **Pendiente** (no existe nada).

---

## Ingreso — `#/ingreso` (pública)

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Ingreso con correo y contraseña | `POST /api/auth/login` | público | CP-08, CP-17, CP-18, CP-23, CP-24 | PM-01, PM-02 | Implementada |
| Segundo paso de verificación en dos pasos (Funcionalidad 5) | `POST /api/auth/login/verificar` | público (requiere el "desafío" de `/login`) | CP-66 a CP-72 | PM-13 | Implementada |
| Sesión vigente al cargar cualquier pantalla | `GET /api/auth/sesion` | cualquier sesión válida | CP-19 | — (se ejercita en cada PM) | Implementada |

## Restablecer contraseña — `#/restablecer/:token` (pública, Funcionalidad 4)

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Generar el enlace (desde Usuarios, ver más abajo) | `POST /api/usuarios/:id/restablecimiento` | `USUARIO_GESTIONAR` | CP-62, CP-64 | PM-12 | Implementada |
| Crear la contraseña nueva con el enlace, sin sesión | `POST /api/auth/restablecer` | público (token de un solo uso) | CP-62, CP-63, CP-65 | PM-12 | Implementada |

## Mis solicitudes / Nueva solicitud — `#/mis-solicitudes`, `#/nueva-solicitud`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| HU-01 / RF-01: registrar solicitud (solo datos productivos) | `POST /api/trabajos` | `TRABAJO_CREAR` | CP-08, CP-24 | PM-05, PM-06 | Implementada |
| Listar las solicitudes propias, con filtro de estado y paginación | `GET /api/trabajos` | `TRABAJO_VER_PROPIOS` (también `TRABAJO_VER_DISENO`/`TRABAJO_VER_TODOS` según rol) | CP-35, CP-36, CP-39, CP-58 | PM-04 | Implementada |
| Catálogo de tipos de trabajo (para el selector) | `GET /api/catalogos` | cualquier sesión válida | CP-34 | PM-05 | Implementada |

## Detalle de trabajo — `#/trabajos/:codigo`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Ver el detalle de un trabajo (alcance según el rol) | `GET /api/trabajos/:codigo` | `TRABAJO_VER_PROPIOS` / `TRABAJO_VER_DISENO` / `TRABAJO_VER_TODOS` | CP-38 | PM-05 | Implementada |
| RF-08: ver materiales registrados | `GET /api/trabajos/:codigo/materiales` | `MATERIAL_VER` | CP-31, CP-49 | PM-09 | Implementada |
| RF-08: Producción registra un material, cantidad y medida | `POST /api/trabajos/:codigo/materiales` | `MATERIAL_REGISTRAR` | CP-49, CP-50, CP-51 | PM-09 | Implementada |
| Detener un trabajo en producción, con motivo | `POST /api/trabajos/:codigo/detener` | `TRABAJO_DETENER` | CP-40, CP-42, CP-43 | PM-05 (flujo general) | Implementada |
| Reanudar un trabajo detenido | `POST /api/trabajos/:codigo/reanudar` | `TRABAJO_DETENER` | CP-40 | PM-05 (flujo general) | Implementada |
| Catálogo de materiales (para el selector) | `GET /api/catalogos` | cualquier sesión válida | CP-34 | PM-09 | Implementada |

## Bandeja de diseño / Enviar propuesta — `#/bandeja-diseno`, `#/disenos/:codigo/enviar`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Tomar una solicitud para diseñarla | `POST /api/trabajos/:codigo/tomar-diseno` | `DISENO_ENVIAR` | CP-09 | PM-05 | Implementada |
| Listar trabajos por tomar / en diseño | `GET /api/trabajos` | `TRABAJO_VER_DISENO` | CP-36, CP-58 | PM-05 | Implementada |
| HU-02 / RF-02: enviar la propuesta (archivo real en GridFS) | `POST /api/disenos/trabajos/:codigo` | `DISENO_ENVIAR` | CP-09, CP-16, CP-55, CP-56 | PM-05, PM-06, PM-10 | Implementada |

## Aprobaciones / Decidir propuesta — `#/aprobaciones`, `#/disenos/:idDiseno`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Listar propuestas pendientes (contador, búsqueda, orden, paginación — DEF-12/Parte B) | `GET /api/disenos/pendientes` | `DISENO_APROBAR` | CP-44, CP-57, CP-59 | PM-10 | Implementada |
| Ver el detalle de una propuesta antes de decidir | `GET /api/disenos/:idDiseno` | `DISENO_VER` | CP-15 | PM-10 | Implementada |
| Ver/descargar el archivo real de la propuesta (GridFS) | `GET /api/disenos/:idDiseno/archivos/:idArchivo` | `DISENO_VER` | CP-52, CP-53, CP-54 | PM-10 | Implementada |
| HU-03 / RF-03: aprobar o rechazar con motivo | `POST /api/disenos/:idDiseno/decision` | `DISENO_APROBAR` | CP-10 | PM-05 | Implementada |

## Mis actividades — `#/mis-actividades`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| HU-04 / RF-04: ver la actividad vigente y la siguiente del área | `GET /api/trabajos/mis-actividades` | `TRABAJO_VER_AREA` | CP-11 | PM-07 | Implementada |
| HU-05 / RF-05: completar la etapa vigente | `POST /api/trabajos/:codigo/etapas/:orden/completar` | `ETAPA_AVANZAR` | CP-12, CP-22 | PM-05, PM-07 | Implementada |
| Ver materiales del trabajo (solo lectura para Operario) | `GET /api/trabajos/:codigo/materiales` | `MATERIAL_VER` | CP-31 | PM-09 | Implementada |

## Panel general — `#/panel`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| HU-06 / RF-06: panel agrupado por estado, área responsable y atrasos | `GET /api/panel` | `PANEL_VER` | CP-13 | PM-05 | Implementada |

## Usuarios — `#/usuarios`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Listar cuentas (sin hash, con bloqueo y último acceso) | `GET /api/usuarios` | `USUARIO_GESTIONAR` | CP-45 | PM-04 | Implementada |
| Crear una cuenta nueva | `POST /api/usuarios` | `USUARIO_GESTIONAR` | CP-73 | PM-14 | Implementada — CP-73 y PM-14 se agregaron al construir esta matriz, al notar que faltaban. |
| HU-07 / RF-07: cambiar rol o área (revoca sesiones) | `PATCH /api/usuarios/:id/perfil` | `USUARIO_GESTIONAR` | CP-14 | PM-04 | Implementada |
| Activar/desactivar una cuenta | `PATCH /api/usuarios/:id/estado` | `USUARIO_GESTIONAR` | CP-29 | PM-03 | Implementada |
| Generar enlace de restablecimiento (Funcionalidad 4) | `POST /api/usuarios/:id/restablecimiento` | `USUARIO_GESTIONAR` | CP-62, CP-64 | PM-12 | Implementada |
| Desactivar el MFA de otra cuenta (Funcionalidad 5, recuperación) | `POST /api/usuarios/:id/mfa/desactivar` | `USUARIO_GESTIONAR` | CP-69 | PM-13 | Implementada |

## Bitácora — `#/bitacora`

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Consultar el historial de eventos de un trabajo | `GET /api/auditoria/trabajos/:codigo` | `AUDITORIA_VER` | CP-15 | PM-05 (paso final del flujo completo) | Implementada |

## Mi cuenta — `#/mi-cuenta` (cualquier sesión válida, sin permiso propio)

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Cambiar la propia contraseña (exige la actual, revoca otras sesiones) | `POST /api/auth/cambiar-contrasena` | sesión propia | CP-30 | PM-08 | Implementada |
| Cerrar la sesión actual | `POST /api/auth/logout` | sesión propia | CP-28 | PM-03 | Implementada |
| Activar MFA: generar secreto + código QR (Funcionalidad 5) | `POST /api/auth/mfa/iniciar` | sesión propia, solo `ADMINISTRADOR`/`PRODUCCION` | CP-66, CP-70, CP-71 | PM-13 | Implementada |
| Confirmar la activación con un código real | `POST /api/auth/mfa/confirmar` | sesión propia | CP-66 | PM-13 | Implementada |
| Cancelar una activación sin terminar | `POST /api/auth/mfa/cancelar` | sesión propia | CP-71 | PM-13 | Implementada |
| Desactivar el MFA propio (exige la contraseña) | `POST /api/auth/mfa/desactivar` | sesión propia | CP-69 | PM-13 | Implementada |

## Transversal (no es una pantalla, pero corre en cada navegación)

| HU / Requisito | Endpoint | Permiso | CP | PM | Estado |
|---|---|---|---|---|---|
| Renovar el token de acceso sin volver a pedir la contraseña | `POST /api/auth/renovar` | token de renovación (cookie), CSRF | CP-28 | — | Implementada |
| Cierre de sesión por inactividad real (Funcionalidad 3) | se aplica dentro del middleware `autenticar` en cada ruta protegida, no es un endpoint propio | — | CP-60, CP-61 | PM-11 | Implementada |

---

## Resumen

- **Pantallas reales:** 14 (`#/ingreso`, `#/restablecer/:token`, y las 12 de la tabla `RUTAS` de `web/js/router.js`).
- **Endpoints reales catalogados:** 35 (11 en `/api/auth`, incluido `GET /sesion`; 10 en `/api/trabajos`; 5 en `/api/disenos`; 6 en `/api/usuarios`; 1 en `/api/auditoria`; 1 en `/api/catalogos`; 1 en `/api/panel`).
- **Estado:** 35 Implementada, 0 Parcial, 0 Pendiente. (`POST /api/usuarios`, crear cuenta, era el
  único caso Parcial al construir esta matriz — sin prueba automática contra la ruta HTTP real ni
  PM dedicado; se cerró agregando CP-73 y PM-14 en el mismo momento en que se encontró el hueco.)
- **Endpoints sin pantalla propia:** ninguno — los 35 se llaman desde al menos una pantalla real o son infraestructura transversal (`/auth/renovar`, el cierre por inactividad), documentados en la sección "Transversal".
- **Pantallas que llaman a un endpoint inexistente:** ninguna encontrada — se verificó cada llamada `api.get/post/patch` de `web/js/pantallas/*.js` contra la lista real de rutas de `src/modulos/*/rutas*.js`.
