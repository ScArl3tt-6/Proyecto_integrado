'use strict';
const express = require('express');
const { z } = require('zod');
const { autorizar, autorizarAlguno, validar } = require('../../middleware/seguridad');

const codigoTrabajo = z.string().regex(/^KT-\d{4}-\d{4}$/);
const estados = z.enum(['SOLICITADO', 'EN_DISENO', 'PENDIENTE_APROBACION', 'EN_PRODUCCION', 'DETENIDO', 'TERMINADO']);
const areas = z.enum(['Ventas', 'Diseño', 'Bordado', 'Sublimación', 'Letreros', 'Grabado', 'Impresión gran formato', 'Administración']);

// strictObject: cualquier campo no declarado (por ejemplo, teléfono del cliente o monto) se rechaza
const esquemaSolicitud = z.strictObject({
  idTipo: z.number().int().positive(),
  descripcion: z.string().trim().min(5).max(300),
  cantidad: z.number().int().min(1).max(100000),
  fechaCompromiso: z.iso.date(),
});
const esquemaPaginacion = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(500).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
const esquemaListado = z.strictObject({
  estado: estados.optional(),
  area: areas.optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
const esquemaMotivo = z.strictObject({ motivo: z.string().trim().min(5).max(300) });
const esquemaParamsTrabajo =z.strictObject({ codigo: codigoTrabajo });
const esquemaParamsEtapa = z.strictObject({ codigo: codigoTrabajo, orden: z.coerce.number().int().min(1).max(20) });
const PERMISOS_VER_TRABAJOS = ['TRABAJO_VER_PROPIOS', 'TRABAJO_VER_DISENO', 'TRABAJO_VER_TODOS'];

function rutasTrabajos({ trabajos }) {
  const r = express.Router();

  r.post('/', autorizar('TRABAJO_CREAR'), validar(esquemaSolicitud), async (req, res) => {
    res.status(201).json(await trabajos.registrarSolicitud(req.usuario, req.datos.body));
  });

  r.get('/mis-actividades', autorizar('TRABAJO_VER_AREA'), validar(esquemaPaginacion, 'query'), async (req, res) => {
    res.json(await trabajos.actividadesDeMiArea(req.usuario, req.datos.query));
  });

  r.get('/', autorizarAlguno(...PERMISOS_VER_TRABAJOS), validar(esquemaListado, 'query'), async (req, res) => {
    res.json(await trabajos.listar(req.usuario, req.datos.query));
  });

  r.get('/:codigo', autorizarAlguno(...PERMISOS_VER_TRABAJOS), validar(esquemaParamsTrabajo, 'params'), async (req, res) => {
    res.json(await trabajos.detalle(req.usuario, req.datos.params.codigo));
  });

  r.post('/:codigo/detener', autorizar('TRABAJO_DETENER'), validar(esquemaParamsTrabajo, 'params'), validar(esquemaMotivo), async (req, res) => {
    res.json(await trabajos.detener(req.usuario, req.datos.params.codigo, req.datos.body.motivo));
  });

  r.post('/:codigo/reanudar', autorizar('TRABAJO_DETENER'), validar(esquemaParamsTrabajo, 'params'), async (req, res) => {
    res.json(await trabajos.reanudar(req.usuario, req.datos.params.codigo));
  });

  r.post('/:codigo/tomar-diseno', autorizar('DISENO_ENVIAR'), validar(esquemaParamsTrabajo, 'params'), async (req, res) => {
    res.json(await trabajos.tomarParaDiseno(req.usuario, req.datos.params.codigo));
  });

  r.post('/:codigo/etapas/:orden/completar', autorizar('ETAPA_AVANZAR'), validar(esquemaParamsEtapa, 'params'), async (req, res) => {
    const { codigo, orden } = req.datos.params;
    res.json(await trabajos.completarEtapa(req.usuario, codigo, orden));
  });

  r.get('/:codigo/materiales', autorizar('MATERIAL_VER'), validar(esquemaParamsTrabajo, 'params'), async (req, res) => {
    res.json(await trabajos.materiales(req.usuario, req.datos.params.codigo));
  });

  return r;
}

module.exports = { rutasTrabajos, esquemaSolicitud };
