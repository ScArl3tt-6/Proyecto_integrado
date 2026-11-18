'use strict';
// Al cambiar el $jsonSchema de "propuestas_diseno" en src/db/mongo.js (ESQUEMA_PROPUESTA), una base
// que ya tenía la colección creada se queda con el validador viejo: crearBaseDocumental solo aplica
// el validador la primera vez, al crear la colección (ver ese archivo). sst_app (el rol de la
// aplicación) no puede corregirlo solo: collMod exige un rol de administración (dbAdmin o superior),
// que sst_app no tiene por diseño (mínimo privilegio). Este script, ejecutado a mano con
// "npm run mongo:actualizar-validador", usa sst_admin (ver .mongo-admin-credenciales.txt) para
// aplicar el validador vigente a una base que ya existe. Es idempotente: no hace nada si la
// colección todavía no existe (crearBaseDocumental la creará ya con el validador correcto) ni si el
// validador ya está al día.
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { cargarEnv } = require('../cargarEnv');
const { ESQUEMA_PROPUESTA } = require('../../src/db/mongo');

cargarEnv();

const BASE = process.env.SST_MONGO_BASE || 'sst_kotoduo';
const RUTA_CREDENCIALES_ADMIN = path.join(__dirname, '..', '..', '.mongo-admin-credenciales.txt');

function leerUriAdmin() {
  if (!fs.existsSync(RUTA_CREDENCIALES_ADMIN)) {
    throw new Error('No encontré .mongo-admin-credenciales.txt. Ejecuta primero "npm run mongo:iniciar".');
  }
  const texto = fs.readFileSync(RUTA_CREDENCIALES_ADMIN, 'utf8');
  const linea = texto.split('\n').find((l) => l.startsWith('URI completa:'));
  if (!linea) throw new Error('No encontré la línea "URI completa:" en .mongo-admin-credenciales.txt.');
  return linea.replace('URI completa:', '').trim();
}

async function principal() {
  const cliente = new MongoClient(leerUriAdmin(), { serverSelectionTimeoutMS: 3000 });
  await cliente.connect();
  const db = cliente.db(BASE);
  const existe = await db.listCollections({ name: 'propuestas_diseno' }, { nameOnly: true }).hasNext();
  if (!existe) {
    console.log(`La colección "propuestas_diseno" todavía no existe en "${BASE}"; no hay nada que actualizar.`);
  } else {
    await db.command({ collMod: 'propuestas_diseno', validator: { $jsonSchema: ESQUEMA_PROPUESTA }, validationLevel: 'strict' });
    console.log(`Listo: el validador de "propuestas_diseno" en "${BASE}" quedó igual al definido hoy en src/db/mongo.js.`);
  }
  await cliente.close();
}

principal().catch((err) => { console.error('No fue posible actualizar el validador:', err.message); process.exit(1); });
