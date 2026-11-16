'use strict';
// Crea, usando la excepción de localhost de MongoDB (solo funciona si la base todavía no tiene
// ningún usuario), tres cuentas: "sst_admin" (administración, para Compass), "sst_app" (readWrite
// SOLO sobre sst_kotoduo, la usa la aplicación) y "sst_pruebas" (readWrite sobre cualquier base,
// la usa la suite automática para crear y borrar una base temporal por cada ejecución). Es
// idempotente: si SST_MONGO_URI ya funciona, no hace nada.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

const HOST = process.env.SST_MONGO_HOST || '127.0.0.1';
const PUERTO = process.env.SST_MONGO_PUERTO || '27027';
const BASE = process.env.SST_MONGO_BASE || 'sst_kotoduo';
const RUTA_ENV = path.join(__dirname, '..', '..', '.env');
const RUTA_CREDENCIALES_ADMIN = path.join(__dirname, '..', '..', '.mongo-admin-credenciales.txt');

function generarContrasena() {
  return crypto.randomBytes(24).toString('base64url');
}

function actualizarEnv(valores) {
  const lineasExistentes = fs.existsSync(RUTA_ENV) ? fs.readFileSync(RUTA_ENV, 'utf8').split('\n') : [];
  const claves = new Set(Object.keys(valores));
  const restantes = lineasExistentes.filter((linea) => !claves.has(linea.split('=')[0]?.trim()));
  while (restantes.length && restantes[restantes.length - 1].trim() === '') restantes.pop();
  const nuevas = Object.entries(valores).map(([clave, valor]) => `${clave}=${valor}`);
  fs.writeFileSync(RUTA_ENV, [...restantes, ...nuevas, ''].join('\n'), 'utf8');
}

async function yaConfigurado() {
  if (!process.env.SST_MONGO_URI) return false;
  // Si la URI no trae usuario, no sirve como prueba de que ya hay credenciales reales: mientras
  // no exista ningún usuario, la "excepción de localhost" deja conectarse igual sin autenticar,
  // así que un ping exitoso con esa URI no demuestra nada (falso positivo detectado al probarlo).
  let tieneUsuario;
  try { tieneUsuario = Boolean(new URL(process.env.SST_MONGO_URI).username); } catch { return false; }
  if (!tieneUsuario) return false;
  try {
    const cliente = new MongoClient(process.env.SST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await cliente.connect();
    await cliente.db(BASE).command({ ping: 1 });
    await cliente.close();
    return true;
  } catch {
    return false;
  }
}

async function crearUsuarios() {
  const contrasenaAdmin = generarContrasena();
  const contrasenaApp = generarContrasena();
  const contrasenaPruebas = generarContrasena();

  // La excepción de localhost solo permite UNA operación sin autenticar: se cierra apenas existe
  // el primer usuario. Por eso los siguientes createUser ya van autenticados como sst_admin.
  const sinAuth = new MongoClient(`mongodb://${HOST}:${PUERTO}/admin`, { serverSelectionTimeoutMS: 3000 });
  await sinAuth.connect();
  await sinAuth.db('admin').command({ createUser: 'sst_admin', pwd: contrasenaAdmin, roles: [{ role: 'root', db: 'admin' }] });
  console.log('  usuario administrador "sst_admin" creado (rol root, solo para inspección con Compass).');
  await sinAuth.close();

  const comoAdmin = new MongoClient(
    `mongodb://sst_admin:${encodeURIComponent(contrasenaAdmin)}@${HOST}:${PUERTO}/admin?authSource=admin`,
    { serverSelectionTimeoutMS: 3000 },
  );
  await comoAdmin.connect();
  await comoAdmin.db(BASE).command({ createUser: 'sst_app', pwd: contrasenaApp, roles: [{ role: 'readWrite', db: BASE }] });
  console.log(`  usuario "sst_app" creado con readWrite solo sobre "${BASE}".`);
  // sst_pruebas necesita crear, leer/escribir y BORRAR una base distinta por cada ejecución de la
  // suite (sst_prueba_xxxx): readWriteAnyDatabase no alcanza porque no incluye dropDatabase, así
  // que se agrega dbAdminAnyDatabase (verificado al probarlo: sin este rol, dropDatabase falla).
  await comoAdmin.db('admin').command({
    createUser: 'sst_pruebas', pwd: contrasenaPruebas,
    roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }, { role: 'dbAdminAnyDatabase', db: 'admin' }],
  });
  console.log('  usuario "sst_pruebas" creado con readWrite + dbAdmin sobre cualquier base (para la suite automática).');
  await comoAdmin.close();

  const uriApp = `mongodb://sst_app:${encodeURIComponent(contrasenaApp)}@${HOST}:${PUERTO}/${BASE}?authSource=${BASE}`;
  const uriPruebas = `mongodb://sst_pruebas:${encodeURIComponent(contrasenaPruebas)}@${HOST}:${PUERTO}/admin?authSource=admin`;
  actualizarEnv({ SST_MONGO_URI: uriApp, SST_MONGO_BASE: BASE, SST_MONGO_PRUEBAS_URI: uriPruebas });

  const uriAdmin = `mongodb://sst_admin:${encodeURIComponent(contrasenaAdmin)}@${HOST}:${PUERTO}/admin?authSource=admin`;
  fs.writeFileSync(RUTA_CREDENCIALES_ADMIN, [
    'Credenciales del usuario administrador de MongoDB (sst_kotoduo).',
    'Se generan una sola vez, al crear los usuarios. Úsalas en MongoDB Compass; no se suben al repositorio.',
    '',
    'Usuario: sst_admin',
    `Contraseña: ${contrasenaAdmin}`,
    `URI completa: ${uriAdmin}`,
    '',
  ].join('\n'), 'utf8');
  console.log('  credenciales del administrador guardadas en .mongo-admin-credenciales.txt (no se muestran aquí).');
}

async function principal() {
  if (await yaConfigurado()) {
    console.log('MongoDB ya tiene usuarios configurados (SST_MONGO_URI funciona); no se crea nada nuevo.');
    return;
  }
  console.log('Creando usuarios de MongoDB con la excepción de localhost...');
  try {
    await crearUsuarios();
    console.log('Listo.');
  } catch (err) {
    if (/requires authentication|already exists/i.test(err.message)) {
      throw new Error('MongoDB ya tiene usuarios pero SST_MONGO_URI no es válida o no está en .env. Revísala a mano.');
    }
    throw err;
  }
}

module.exports = { principal, yaConfigurado };

if (require.main === module) {
  principal().catch((err) => { console.error('No fue posible crear los usuarios de MongoDB:', err.message); process.exit(1); });
}
