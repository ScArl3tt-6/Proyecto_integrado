'use strict';
// Vacía las colecciones de MongoDB usadas por la demostración (propuestas, bitácora y los
// archivos de GridFS), sin borrar los usuarios ni los roles. Se usa junto con
// "npm run db:reiniciar -- --si" + "npm run db:crear" + "npm run demo:sembrar" para dejar la
// base de demostración completamente limpia antes de presentarla. Usa las credenciales de
// sst_app (SST_MONGO_URI): no hace falta sst_admin, porque readWrite ya alcanza para borrar
// documentos de las colecciones de la propia base de la aplicación.
const { MongoClient } = require('mongodb');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

if (process.env.NODE_ENV === 'production') {
  console.error('mongo:limpiar-demo no se ejecuta en producción.');
  process.exit(1);
}
if (!process.argv.includes('--si')) {
  console.error('Esto borra TODAS las propuestas de diseño, los archivos reales en GridFS y la');
  console.error('bitácora de eventos (no borra usuarios ni roles). Si estás segura:');
  console.error('  npm run mongo:limpiar-demo -- --si');
  process.exit(1);
}

async function principal() {
  if (!process.env.SST_MONGO_URI) throw new Error('Falta SST_MONGO_URI en .env. Ejecuta primero "npm run mongo:iniciar".');
  const base = process.env.SST_MONGO_BASE || 'sst_kotoduo';
  const cliente = new MongoClient(process.env.SST_MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  await cliente.connect();
  const db = cliente.db(base);

  for (const coleccion of ['propuestas_diseno', 'bitacora_eventos', 'disenos.files', 'disenos.chunks']) {
    const existe = await db.listCollections({ name: coleccion }, { nameOnly: true }).hasNext();
    if (!existe) { console.log(`  "${coleccion}" no existe todavía, nada que limpiar.`); continue; }
    const { deletedCount } = await db.collection(coleccion).deleteMany({});
    console.log(`  "${coleccion}": ${deletedCount} documento(s) borrados.`);
  }
  await cliente.close();
  console.log('Listo. Las colecciones de la demostración quedaron vacías.');
}

principal().catch((err) => { console.error('No fue posible limpiar MongoDB:', err.message); process.exit(1); });
