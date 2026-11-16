'use strict';
// Arranque de demostración: completa el secreto JWT en .env si falta, y deja la API escuchando.
// Supone que ya se ejecutaron "npm run db:crear" (PostgreSQL) y "npm run mongo:iniciar" (MongoDB):
// no inventa credenciales de base de datos, porque hacerlo ocultaría que falta ese paso.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { cargarEnv } = require('./cargarEnv');

function asegurarSecretoJwt() {
  cargarEnv();
  if (process.env.SST_JWT_SECRETO) return;
  const rutaEnv = path.join(__dirname, '..', '.env');
  const lineasPrevias = fs.existsSync(rutaEnv) ? fs.readFileSync(rutaEnv, 'utf8').split('\n').filter((l) => l.trim()) : [];
  const secreto = crypto.randomBytes(48).toString('hex');
  const basicas = lineasPrevias.length ? [] : ['NODE_ENV=development', 'SST_PUERTO=3000'];
  fs.writeFileSync(rutaEnv, [...lineasPrevias, ...basicas, `SST_JWT_SECRETO=${secreto}`, ''].join('\n'), 'utf8');
  process.env.SST_JWT_SECRETO = secreto;
  console.log('Se agregó SST_JWT_SECRETO a .env (no se sube al repositorio).');
}

function requerirPreparacion() {
  const faltan = ['SST_PG_URL', 'SST_MONGO_URI'].filter((variable) => !process.env[variable]);
  if (!faltan.length) return;
  console.error(`Falta ${faltan.join(' y ')} en .env.`);
  if (faltan.includes('SST_PG_URL')) console.error('  Ejecuta primero: npm run db:crear');
  if (faltan.includes('SST_MONGO_URI')) console.error('  Ejecuta primero: npm run mongo:iniciar');
  process.exit(1);
}

async function principal() {
  asegurarSecretoJwt();
  cargarEnv();
  requerirPreparacion();
  console.log(`Abre http://localhost:${process.env.SST_PUERTO || 3000} en el navegador.`);
  require('../src/servidor');
}

principal().catch((err) => {
  console.error('No fue posible iniciar la demostración:', err.message);
  process.exit(1);
});
