'use strict';
const express = require('express');
const { z } = require('zod');
const { autorizar, validar } = require('../../middleware/seguridad');

const roles = z.enum(['ADMINISTRADOR', 'PRODUCCION', 'DISENO', 'VENDEDOR', 'OPERARIO']);
const areas = z.enum(['Ventas', 'Diseño', 'Bordado', 'Sublimación', 'Letreros', 'Grabado', 'Impresión gran formato', 'Administración']);

// Sin "contrasena": Administración no la fija (ni la conoce). La cuenta se crea con un enlace de
// primer acceso, igual que un restablecimiento (punto 7 de la revisión del equipo, 19-11-2026).
const esquemaNuevo = z.strictObject({
  nombre: z.string().trim().min(3).max(80),
  correo: z.email().max(120),
  rol: roles,
  area: areas.optional(),
});
const esquemaPerfil = z.strictObject({ rol: roles, area: areas.optional() });

function rutasUsuarios({ usuarios }) {
  const r = express.Router();
  r.use(autorizar('USUARIO_GESTIONAR'));

  r.get('/', async (req, res) => {
    res.json(await usuarios.listar());
  });

  r.post('/', validar(esquemaNuevo), async (req, res) => {
    res.status(201).json(await usuarios.crear(req.usuario, req.datos.body));
  });

  r.patch('/:id/perfil', validar(z.strictObject({ id: z.coerce.number().int().positive() }), 'params'), validar(esquemaPerfil),
    async (req, res) => {
      res.json(await usuarios.cambiarPerfil(req.usuario, req.datos.params.id, req.datos.body));
    });

  r.patch('/:id/estado', validar(z.strictObject({ id: z.coerce.number().int().positive() }), 'params'), validar(z.strictObject({ activo: z.boolean() })),
    async (req, res) => {
      res.json(await usuarios.cambiarEstado(req.usuario, req.datos.params.id, req.datos.body.activo));
    });

  r.post('/:id/restablecimiento', validar(z.strictObject({ id: z.coerce.number().int().positive() }), 'params'),
    async (req, res) => {
      res.status(201).json(await usuarios.generarEnlaceRestablecimiento(req.usuario, req.datos.params.id));
    });

  // Vía de recuperación si la persona perdió el acceso a su aplicación de autenticación (Funcionalidad 5)
  r.post('/:id/mfa/desactivar', validar(z.strictObject({ id: z.coerce.number().int().positive() }), 'params'),
    async (req, res) => {
      await usuarios.desactivarMfa(req.usuario, req.datos.params.id);
      return res.status(204).end();
    });

  return r;
}

function rutasAuditoria({ bitacora }) {
  const r = express.Router();
  // Montada antes que "/trabajos/:codigo" no hace falta aquí (son rutas distintas), pero si
  // alguna vez calzaran, esta debe ir primero para que "/recientes" no se intente leer como código.
  r.get('/recientes', autorizar('AUDITORIA_VER'),
    validar(z.strictObject({ limite: z.coerce.number().int().min(1).max(100).default(30) }), 'query'),
    async (req, res) => res.json(await bitacora.consultarRecientes(req.datos.query.limite)));
  r.get('/trabajos/:codigo', autorizar('AUDITORIA_VER'),
    validar(z.strictObject({ codigo: z.string().regex(/^KT-\d{4}-\d{4}$/) }), 'params'),
    async (req, res) => res.json(await bitacora.consultarPorTrabajo(req.datos.params.codigo)));

  // Punto 5 de la revisión del equipo (19-11-2026): novedades para Vendedor y Diseño. Paginado
  // ("Cargar más") agregado en la segunda vuelta del punto 3 (20-11-2026).
  r.get('/novedades', autorizar('NOVEDADES_VER'),
    validar(z.strictObject({ pagina: z.coerce.number().int().min(1).max(500).default(1), limite: z.coerce.number().int().min(1).max(50).default(20) }), 'query'),
    async (req, res) => res.json(await bitacora.consultarNovedades(req.usuario, req.datos.query)));
  r.post('/novedades/vistas', autorizar('NOVEDADES_VER'), async (req, res) => {
    await bitacora.marcarNovedadesVistas(req.usuario);
    return res.status(204).end();
  });
  return r;
}

module.exports = { rutasUsuarios, rutasAuditoria };
