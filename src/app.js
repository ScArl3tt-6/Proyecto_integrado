'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const { autenticar, autorizar, verificarCsrf, manejarErrores } = require('./middleware/seguridad');
const { crearServicioBitacora } = require('./modulos/auditoria/servicioBitacora');
const { crearServicioAutenticacion } = require('./modulos/auth/servicioAutenticacion');
const { crearServicioTrabajos } = require('./modulos/trabajos/servicioTrabajos');
const { crearServicioDisenos } = require('./modulos/disenos/servicioDisenos');
const { crearServicioPanel } = require('./modulos/panel/servicioPanel');
const { crearServicioUsuarios } = require('./modulos/usuarios/servicioUsuarios');
const { crearServicioCatalogos } = require('./modulos/catalogos/servicioCatalogos');
const { rutasAutenticacion } = require('./modulos/auth/rutasAutenticacion');
const { rutasTrabajos } = require('./modulos/trabajos/rutasTrabajos');
const { rutasDisenos } = require('./modulos/disenos/rutasDisenos');
const { rutasUsuarios, rutasAuditoria } = require('./modulos/usuarios/rutasUsuarios');
const { rutasCatalogos } = require('./modulos/catalogos/rutasCatalogos');

function crearApp({ entorno, pg, mongoDb, registro = console }) {
  const bitacora = crearServicioBitacora(mongoDb);
  const autenticacion = crearServicioAutenticacion({ pg, entorno, bitacora });
  const servicios = {
    bitacora,
    autenticacion,
    trabajos: crearServicioTrabajos({ pg, bitacora }),
    disenos: crearServicioDisenos({ pg, mongoDb, bitacora }),
    panel: crearServicioPanel({ pg }),
    usuarios: crearServicioUsuarios({ pg, bitacora, autenticacion }),
    catalogos: crearServicioCatalogos({ pg }),
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de Nginx
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  }));
  // Las respuestas de la API contienen datos de sesión y de trabajos: no deben quedar en cachés del navegador ni de intermediarios
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Límite general por IP y minuto, contra abuso y denegación de servicio (el inicio de sesión tiene límites propios)
  app.use('/api', rateLimit({
    windowMs: 60 * 1000, limit: entorno.limiteGeneral, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intente nuevamente en un minuto' },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const sesion = autenticar({ entorno, pg });
  app.use('/api/auth', rutasAutenticacion({ autenticacion, entorno, autenticar: sesion, verificarCsrf }));
  app.use('/api/trabajos', sesion, verificarCsrf, rutasTrabajos(servicios));
  app.use('/api/disenos', sesion, verificarCsrf, rutasDisenos(servicios));
  app.use('/api/usuarios', sesion, verificarCsrf, rutasUsuarios(servicios));
  app.use('/api/auditoria', sesion, rutasAuditoria(servicios));
  app.use('/api/catalogos', sesion, rutasCatalogos(servicios));
  app.get('/api/panel', sesion, autorizar('PANEL_VER'), async (req, res) => res.json(await servicios.panel.resumen()));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

  // El estático se monta después de las rutas de /api: una petición a /api que no calzó arriba
  // ya respondió y nunca llega aquí, así que el archivo de respaldo jamás compite con la API.
  app.use(express.static(path.join(__dirname, '..', 'web')));
  app.use((req, res) => res.status(404).type('text/plain').send('Página no encontrada'));

  app.use(manejarErrores(registro));
  return { app, servicios };
}

module.exports = { crearApp };
