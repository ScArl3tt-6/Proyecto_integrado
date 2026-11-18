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

function rutasAutenticacion({ autenticacion, entorno, autenticar, verificarCsrf }) {
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

  r.post('/logout', autenticar, verificarCsrf, async (req, res) => {
    await autenticacion.cerrarSesion(req.usuario);
    res.clearCookie(COOKIE_ACCESO).clearCookie(COOKIE_RENOVACION, { path: '/api/auth' }).clearCookie(COOKIE_CSRF);
    return res.status(204).end();
  });

  r.get('/sesion', autenticar, (req, res) => res.json({ id: req.usuario.id, rol: req.usuario.rol, idArea: req.usuario.idArea }));
  return r;
}

module.exports = { rutasAutenticacion };
