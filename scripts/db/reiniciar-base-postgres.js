'use strict';
// Reinicia por completo la base de desarrollo: borra sst_kotoduo y los tres roles de la aplicación,
// para volver a crearlos desde cero con `npm run db:crear`. Es destructivo e irreversible, solo
// para desarrollo, y por eso exige el indicador --si.
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');
const { obtenerContrasenaAdmin } = require('./entradaOculta');

cargarEnv();

if (process.env.NODE_ENV === 'production') {
  console.error('db:reiniciar no se ejecuta en producción.');
  process.exit(1);
}
if (!process.argv.includes('--si')) {
  console.error('Esto borra la base "sst_kotoduo" y los roles sst_app, sst_propietario y sst_pruebas. Si estás segura:');
  console.error('  npm run db:reiniciar -- --si');
  process.exit(1);
}

const HOST = process.env.SST_PG_HOST || '127.0.0.1';
const PUERTO = Number(process.env.SST_PG_PUERTO || 5432);
const BASE = process.env.SST_PG_BASE || 'sst_kotoduo';

async function principal() {
  const contrasenaAdmin = await obtenerContrasenaAdmin();
  const admin = new Client({ host: HOST, port: PUERTO, user: 'postgres', password: contrasenaAdmin, database: 'postgres' });
  await admin.connect();

  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [BASE]);
  await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
  console.log(`Base "${BASE}" eliminada.`);
  for (const rol of ['sst_app', 'sst_propietario', 'sst_pruebas']) {
    await admin.query(`DROP ROLE IF EXISTS ${rol}`);
    console.log(`Rol "${rol}" eliminado.`);
  }
  await admin.end();
  console.log('Listo. Ejecuta "npm run db:crear" para volver a crear todo desde cero (y actualizar .env).');
}

principal().catch((err) => {
  console.error('No fue posible reiniciar la base de datos:', err.message);
  process.exit(1);
});
