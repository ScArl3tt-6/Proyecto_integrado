'use strict';
const express = require('express');
const { z } = require('zod');
const { autorizar, validar } = require('../../middleware/seguridad');

// 20 971 520 = 15 MB (TAMANO_MAXIMO en src/dominio/archivosDiseno.js) codificados en base64.
// El tamaño ya no lo declara el cliente: se mide del contenido real recibido (Fase 1, GridFS).
const esquemaArchivo = z.strictObject({
  nombre: z.string().min(1).max(100),
  tipoMime: z.string().max(50),
  contenidoBase64: z.base64().max(20_971_520),
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
// Lista de aprobaciones pendientes: contador, orden, búsqueda y paginación (DEF-12/Parte B).
const esquemaPendientes = z.strictObject({
  busqueda: z.string().trim().min(1).max(60).optional(),
  orden: z.enum(['fecha_compromiso', 'enviado_en']).default('fecha_compromiso'),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

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

  r.get('/pendientes', autorizar('DISENO_APROBAR'), validar(esquemaPendientes, 'query'), async (req, res) => {
    res.json(await disenos.pendientes(req.datos.query));
  });

  r.get('/:idDiseno', autorizar('DISENO_VER'),
    validar(z.strictObject({ idDiseno: z.coerce.number().int().positive() }), 'params'),
    async (req, res) => {
      res.json(await disenos.detalle(req.datos.params.idDiseno));
    });

  // Ver/descargar el archivo real de una propuesta (RF-02 con GridFS). GET no necesita token CSRF.
  r.get('/:idDiseno/archivos/:idArchivo', autorizar('DISENO_VER'),
    validar(z.strictObject({
      idDiseno: z.coerce.number().int().positive(),
      idArchivo: z.string().regex(/^[0-9a-f]{24}$/),
    }), 'params'),
    async (req, res, next) => {
      const { nombre, tipoMime, flujo } = await disenos.obtenerArchivo(req.datos.params.idDiseno, req.datos.params.idArchivo);
      res.set('Content-Type', tipoMime);
      res.set('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
      // Punto 6 de la revisión del equipo (19-11-2026): la vista previa (produccion.js la muestra
      // dentro de un <iframe> en la misma pantalla de decidir) quedaba bloqueada porque el helmet()
      // general de la aplicación (pensado para las páginas HTML, que nunca deben enmarcarse en
      // ningún sitio) también le aplicaba "frame-ancestors 'none'" a este archivo. Un PDF o una
      // imagen no son navegables ni ejecutan nada: no hay riesgo de "clickjacking" al enmarcarlos
      // desde el propio sitio, así que aquí se relaja solo a mismo origen, no a cualquiera.
      res.set('Content-Security-Policy', "frame-ancestors 'self'");
      res.set('X-Frame-Options', 'SAMEORIGIN');
      flujo.on('error', (err) => { if (!res.headersSent) next(err); else res.destroy(err); });
      flujo.pipe(res);
    });

  return r;
}

module.exports = { rutasDisenos };
