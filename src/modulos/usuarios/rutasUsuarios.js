'use strict';
const express = require('express');
const { z } = require('zod');
const { autorizar, validar } = require('../../middleware/seguridad');

const roles = z.enum(['ADMINISTRADOR', 'PRODUCCION', 'DISENO', 'VENDEDOR', 'OPERARIO']);
const areas = z.enum(['Ventas', 'Diseño', 'Bordado', 'Sublimación', 'Letreros', 'Grabado', 'Impresión gran formato', 'Administración']);

const esquemaNuevo = z.strictObject({
  nombre: z.string().trim().min(3).max(80),
  correo: z.email().max(120),
  contrasena: z.string().max(128),
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

  return r;
}

function rutasAuditoria({ bitacora }) {
  const r = express.Router();
  r.get('/trabajos/:codigo', autorizar('AUDITORIA_VER'),
    validar(z.strictObject({ codigo: z.string().regex(/^KT-\d{4}-\d{4}$/) }), 'params'),
    async (req, res) => res.json(await bitacora.consultarPorTrabajo(req.datos.params.codigo)));
  return r;
}

module.exports = { rutasUsuarios, rutasAuditoria };
