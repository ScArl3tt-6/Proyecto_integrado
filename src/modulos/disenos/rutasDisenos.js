'use strict';
const express = require('express');
const { z } = require('zod');
const { autorizar, validar } = require('../../middleware/seguridad');

const esquemaArchivo = z.strictObject({
  nombre: z.string().min(1).max(100),
  tipoMime: z.string().max(50),
  tamanoBytes: z.number().int().positive(),
  cabeceraBase64: z.base64().max(64),
});
const esquemaPropuesta = z.strictObject({
  archivos: z.array(esquemaArchivo).min(1).max(10),
  especificaciones: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.array(z.string().max(60)).max(20)])).optional(),
  comentario: z.string().trim().max(500).optional(),
});
const esquemaDecision = z.strictObject({
  decision: z.enum(['APROBADO', 'RECHAZADO']),
  motivo: z.string().trim().min(5).max(300).optional(),
}).refine((d) => d.decision === 'APROBADO' || d.motivo, { path: ['motivo'], message: 'El rechazo requiere motivo' });

function rutasDisenos({ disenos }) {
  const r = express.Router();

  r.post('/trabajos/:codigo', autorizar('DISENO_ENVIAR'),
    validar(z.strictObject({ codigo: z.string().regex(/^KT-\d{4}-\d{4}$/) }), 'params'), validar(esquemaPropuesta),
    async (req, res) => {
      res.status(201).json(await disenos.enviarPropuesta(req.usuario, req.datos.params.codigo, req.datos.body));
    });

  r.post('/:idDiseno/decision', autorizar('DISENO_APROBAR'),
    validar(z.strictObject({ idDiseno: z.coerce.number().int().positive() }), 'params'), validar(esquemaDecision),
    async (req, res) => {
      res.json(await disenos.decidir(req.usuario, req.datos.params.idDiseno, req.datos.body));
    });

  r.get('/pendientes', autorizar('DISENO_APROBAR'), async (req, res) => {
    res.json(await disenos.pendientes());
  });

  r.get('/:idDiseno', autorizar('DISENO_VER'),
    validar(z.strictObject({ idDiseno: z.coerce.number().int().positive() }), 'params'),
    async (req, res) => {
      res.json(await disenos.detalle(req.datos.params.idDiseno));
    });

  return r;
}

module.exports = { rutasDisenos };
