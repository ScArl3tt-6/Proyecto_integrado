'use strict';
const express = require('express');
const { z } = require('zod');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { validar, COOKIE_ACCESO, COOKIE_CSRF } = require('../../middleware/seguridad');

const COOKIE_RENOVACION = 'sst_renovacion';

const esquemaLogin = z.strictObject({
  correo: z.email().max(120),
  contrasena: z.string().min(1).max(128),
});
const esquemaCambioContrasena = z.strictObject({
  actual: z.string().min(1).max(128),
  nueva: z.string().min(1).max(128),
});
const esquemaRestablecer = z.strictObject({
  token: z.string().min(1).max(200),
  nueva: z.string().min(1).max(128),
});
const esquemaVerificarMfa = z.strictObject({
  desafio: z.string().min(1).max(2000),
  codigo: z.string().regex(/^\d{6}$/, 'Debe tener 6 dígitos'),
});
const esquemaCodigoMfa = z.strictObject({ codigo: z.string().regex(/^\d{6}$/, 'Debe tener 6 dígitos') });
const esquemaDesactivarMfa = z.strictObject({ contrasena: z.string().min(1).max(128) });

function rutasAutenticacion({ autenticacion, entorno, autenticar, verificarCsrf, usuarios }) {
  const r = express.Router();
  // Límites: por IP y correo (fuerza bruta sobre una cuenta) y por IP con umbral alto, porque los
  // operarios de planta comparten la misma IP pública al iniciar el turno (incidencia INC-02)
  const mensaje = { error: 'Demasiados intentos, espere unos minutos' };
  const limitePorCuenta = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: mensaje,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.correo || '').toLowerCase().slice(0, 120)}`,
  });
  const limitePorIp = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-7', legacyHeaders: false, message: mensaje });
  // El token ya es impracticable de adivinar (32 bytes al azar); el límite es solo contra el abuso del endpoint
  const limiteRestablecer = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: mensaje });
  // El código de 6 dígitos sí es adivinable por fuerza bruta si no hay límite (1 en un millón por intento):
  // por desafío (no por IP sola, para no bloquear a todo una oficina compartiendo salida a internet)
  const limiteMfa = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: mensaje,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.desafio || '').slice(0, 40)}`,
  });
  // Cambio de contraseña: se limita por usuario para que una sesión robada no permita adivinar la contraseña actual
  const limiteCambio = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: mensaje,
    keyGenerator: (req) => `usuario:${req.usuario.id}`,
  });
  const opcionesCookie = { httpOnly: true, secure: entorno.produccion, sameSite: 'strict', path: '/' };

  function entregarCookies(res, { tokenAcceso, tokenRenovacion, csrf }) {
    res.cookie(COOKIE_ACCESO, tokenAcceso, { ...opcionesCookie, maxAge: entorno.minutosAcceso * 60 * 1000 });
    res.cookie(COOKIE_RENOVACION, tokenRenovacion, { ...opcionesCookie, path: '/api/auth', maxAge: entorno.horasSesion * 3600 * 1000 });
    if (csrf) res.cookie(COOKIE_CSRF, csrf, { ...opcionesCookie, httpOnly: false });
  }

  r.post('/login', limitePorIp, limitePorCuenta, validar(esquemaLogin), async (req, res) => {
    const { correo, contrasena } = req.datos.body;
    const resultado = await autenticacion.iniciarSesion({ correo, contrasena, ip: req.ip });
    if (!resultado.ok) return res.status(401).json({ error: 'Credenciales inválidas o cuenta bloqueada temporalmente' });
    if (resultado.requiereMfa) return res.json({ requiereMfa: true, desafio: resultado.desafio });
    entregarCookies(res, resultado);
    return res.json({ rol: resultado.rol, csrf: resultado.csrf });
  });

  // Segundo paso cuando la cuenta tiene verificación en dos pasos: todavía sin sesión, solo con
  // el "desafío" que entregó /login al validar la contraseña.
  r.post('/login/verificar', limitePorIp, limiteMfa, validar(esquemaVerificarMfa), async (req, res) => {
    const resultado = await autenticacion.completarIngresoMfa({ ...req.datos.body, ip: req.ip });
    if (resultado.motivo === 'BLOQUEADO') {
      return res.status(401).json({ error: 'Tu cuenta quedó bloqueada temporalmente por varios códigos incorrectos seguidos. Intenta de nuevo en unos minutos.' });
    }
    if (!resultado.ok) {
      return res.status(401).json({ error: 'Código incorrecto o vencido, o la verificación caducó. Vuelve a ingresar tu correo y contraseña.' });
    }
    entregarCookies(res, resultado);
    return res.json({ rol: resultado.rol, csrf: resultado.csrf });
  });

  // Renueva el token de acceso con el token de renovación (rotación: el anterior deja de servir)
  r.post('/renovar', limitePorIp, verificarCsrf, async (req, res) => {
    const token = req.cookies?.sst_renovacion;
    const resultado = token ? await autenticacion.renovarSesion({ tokenRenovacion: token, ip: req.ip }) : { ok: false };
    if (!resultado.ok) {
      res.clearCookie(COOKIE_ACCESO).clearCookie(COOKIE_RENOVACION, { path: '/api/auth' });
      return res.status(401).json({ error: 'Sesión no válida' });
    }
    entregarCookies(res, resultado);
    return res.status(204).end();
  });

  r.post('/cambiar-contrasena', autenticar, verificarCsrf, limiteCambio, validar(esquemaCambioContrasena), async (req, res) => {
    await autenticacion.cambiarContrasena(req.usuario, req.datos.body);
    return res.status(204).end();
  });

  // Sin sesión: quien lo usa todavía no puede ingresar. El enlace (con el token) lo generó
  // Administración desde Usuarios. No se distingue "no existe" de "venció" o "ya se usó".
  r.post('/restablecer', limitePorIp, limiteRestablecer, validar(esquemaRestablecer), async (req, res) => {
    const resultado = await autenticacion.restablecerContrasena({ ...req.datos.body, ip: req.ip });
    if (!resultado.ok) return res.status(400).json({ error: 'Este enlace ya no es válido: venció, ya se usó o no existe.', motivo: 'TOKEN_INVALIDO' });
    return res.status(204).end();
  });

  // Activación de MFA: generar el secreto no la activa todavía, hace falta confirmar con un código real
  r.post('/mfa/iniciar', autenticar, verificarCsrf, async (req, res) => {
    res.status(201).json(await autenticacion.iniciarMfa(req.usuario));
  });

  r.post('/mfa/confirmar', autenticar, verificarCsrf, validar(esquemaCodigoMfa), async (req, res) => {
    await autenticacion.confirmarMfa(req.usuario, req.datos.body.codigo);
    return res.status(204).end();
  });

  r.post('/mfa/cancelar', autenticar, verificarCsrf, async (req, res) => {
    await autenticacion.cancelarMfa(req.usuario);
    return res.status(204).end();
  });

  r.post('/mfa/desactivar', autenticar, verificarCsrf, validar(esquemaDesactivarMfa), async (req, res) => {
    await autenticacion.desactivarMfaPropio(req.usuario, req.datos.body.contrasena);
    return res.status(204).end();
  });

  r.post('/logout', autenticar, verificarCsrf, async (req, res) => {
    await autenticacion.cerrarSesion(req.usuario);
    res.clearCookie(COOKIE_ACCESO).clearCookie(COOKIE_RENOVACION, { path: '/api/auth' }).clearCookie(COOKIE_CSRF);
    return res.status(204).end();
  });

  r.get('/sesion', autenticar, async (req, res) => {
    const perfil = await usuarios.obtenerPerfilPropio(req.usuario.id);
    res.json({
      id: req.usuario.id, rol: req.usuario.rol, idArea: req.usuario.idArea, mfaHabilitado: req.usuario.mfaHabilitado,
      nombre: perfil?.nombre || null, correo: perfil?.correo || null, area: perfil?.area || null,
    });
  });
  return r;
}

module.exports = { rutasAutenticacion };
