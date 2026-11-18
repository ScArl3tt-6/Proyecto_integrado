'use strict';
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { tienePermiso } = require('../dominio/permisos');

const COOKIE_ACCESO = 'sst_acceso';
const COOKIE_CSRF = 'sst_csrf';

// Autenticación: valida el token de acceso y que la sesión siga vigente (permite revocación inmediata)
function autenticar({ entorno, pg }) {
  return async (req, res, next) => {
    const token = req.cookies?.sst_acceso;
    if (!token) return res.status(401).json({ error: 'Debe iniciar sesión' });
    try {
      const datos = jwt.verify(token, entorno.secretoJwt, { algorithms: ['HS256'], issuer: 'sst-kotoduo' });
      const { rows } = await pg.query(
        `SELECT s.revocada, s.expira_en, u.activo, r.nombre AS rol, u.id_area
           FROM sesion s JOIN usuario u ON u.id_usuario = s.id_usuario JOIN rol r ON r.id_rol = u.id_rol
          WHERE s.id_sesion = $1 AND s.id_usuario = $2`,
        [datos.sid, Number(datos.sub)],
      );
      const sesion = rows[0];
      if (!sesion || sesion.revocada || !sesion.activo || new Date(sesion.expira_en) < new Date()) {
        return res.status(401).json({ error: 'Sesión no válida' });
      }
      // El rol y el área se toman de la base, no del token, para que un cambio de perfil rija de inmediato
      req.usuario = { id: Number(datos.sub), sid: datos.sid, rol: sesion.rol, idArea: sesion.id_area };
      return next();
    } catch {
      return res.status(401).json({ error: 'Sesión no válida' });
    }
  };
}

// Autorización por permiso (RBAC). Denegación por defecto.
function autorizar(permiso) {
  return (req, res, next) => {
    if (!req.usuario || !tienePermiso(req.usuario.rol, permiso)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }
    return next();
  };
}

// Autorización cuando el acceso a la ruta es válido para más de un permiso (el alcance de los datos
// lo filtra después el servicio según el rol). Denegación por defecto.
function autorizarAlguno(...permisos) {
  return (req, res, next) => {
    if (!req.usuario || !permisos.some((p) => tienePermiso(req.usuario.rol, p))) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }
    return next();
  };
}

// Protección CSRF por doble envío: el valor de la cookie debe coincidir con la cabecera X-CSRF-Token
function verificarCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.sst_csrf || '';
  const cabecera = req.get('x-csrf-token') || '';
  const a = Buffer.from(cookie);
  const b = Buffer.from(cabecera);
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Solicitud no válida' });
  }
  return next();
}

// Validación de entradas con esquemas estrictos (zod). Los campos no declarados se rechazan.
function validar(esquema, origen = 'body') {
  return (req, res, next) => {
    // origen es un valor fijo del código (body, params o query), nunca proviene del usuario
    // eslint-disable-next-line security/detect-object-injection
    const resultado = esquema.safeParse(req[origen]);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((i) => i.path.join('.') || '(general)');
      // "unrecognized_keys" aparece cuando el cuerpo trae campos que el esquema no conoce: la
      // causa real casi siempre es una página con JavaScript desactualizado (de antes de un cambio
      // en la API), no un error de quien llena el formulario. Encontrado como DEF-11.
      const paginaDesactualizada = resultado.error.issues.some((i) => i.code === 'unrecognized_keys');
      const error = paginaDesactualizada
        ? 'Datos de entrada inválidos. Si la aplicación se actualizó hace poco, recarga esta página (Ctrl+F5) e inténtalo de nuevo.'
        : 'Datos de entrada inválidos';
      return res.status(400).json({ error, campos: [...new Set(campos)] });
    }
    req.datos = { ...(req.datos || {}), [origen]: resultado.data };
    return next();
  };
}

// Manejo centralizado de errores: el detalle queda en el registro interno, al usuario solo un identificador
function manejarErrores(registro = console) {
  return (err, req, res, next) => {
    if (err.name === 'ErrorNegocio') return res.status(err.estadoHttp).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato JSON inválido' });
    const idIncidente = crypto.randomUUID();
    registro.error({ idIncidente, ruta: req.path, mensaje: err.message });
    return res.status(500).json({ error: 'Error interno', idIncidente });
  };
}

module.exports = { autenticar, autorizar, autorizarAlguno, verificarCsrf, validar, manejarErrores, COOKIE_ACCESO, COOKIE_CSRF };
