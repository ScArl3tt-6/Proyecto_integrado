'use strict';
// Script idempotente: crea la base sst_kotoduo y los roles de aplicación con privilegios mínimos.
// Se ejecuta con `npm run db:crear`. Pide la contraseña del superusuario postgres por consola oculta
// (o usa PGPASSWORD si ya está definida) y NO la guarda en ningún lado: desde esta ejecución en
// adelante, la aplicación usa sst_app, los scripts de esquema usan sst_propietario y las pruebas
// automáticas usan sst_pruebas, así que esa contraseña no se vuelve a pedir nunca más.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');
const { obtenerContrasenaAdmin } = require('./entradaOculta');

cargarEnv();

const HOST = process.env.SST_PG_HOST || '127.0.0.1';
const PUERTO = Number(process.env.SST_PG_PUERTO || 5432);
const BASE = process.env.SST_PG_BASE || 'sst_kotoduo';
const RUTA_ENV = path.join(__dirname, '..', '..', '.env');

// Privilegios mínimos por tabla: solo lo que src/modulos ejecuta hoy (verificado con grep sobre
// INSERT/UPDATE/DELETE). Ninguna tabla tiene DELETE porque el código nunca borra filas: los trabajos,
// sesiones y usuarios se marcan con un estado en vez de eliminarse.
const SOLO_LECTURA = ['rol', 'area', 'tipo_trabajo', 'etapa_plantilla', 'material'];
// trabajo_material pasó a lectura y escritura en la Fase 1: Producción registra materiales (RF-08).
const LECTURA_ESCRITURA = ['usuario', 'sesion', 'trabajo', 'etapa_trabajo', 'diseno', 'trabajo_material'];
const SOLO_INSERCION = ['aprobacion_diseno']; // nunca se actualiza: una decisión es definitiva (UNIQUE + CP-10)
const SECUENCIAS_APP = [
  'usuario_id_usuario_seq', 'trabajo_id_trabajo_seq', 'etapa_trabajo_id_etapa_trabajo_seq',
  'diseno_id_diseno_seq', 'aprobacion_diseno_id_aprobacion_seq',
];

function generarContrasena() {
  return crypto.randomBytes(24).toString('base64url');
}

function urlPg(usuario, contrasena, baseDatos) {
  return `postgresql://${usuario}:${encodeURIComponent(contrasena)}@${HOST}:${PUERTO}/${baseDatos}`;
}

async function conectar(baseDatos, usuario, contrasena) {
  const cliente = new Client({ host: HOST, port: PUERTO, user: usuario, password: contrasena, database: baseDatos });
  await cliente.connect();
  return cliente;
}

async function existeRol(cliente, nombre) {
  const { rows } = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [nombre]);
  return rows.length > 0;
}

// Devuelve la contraseña generada solo si el rol se creó recién; null si ya existía (no se toca).
async function asegurarRol(cliente, nombre, atributosSql) {
  if (await existeRol(cliente, nombre)) {
    console.log(`  rol "${nombre}" ya existía, no se modifica.`);
    return null;
  }
  const contrasena = generarContrasena();
  await cliente.query(`CREATE ROLE ${nombre} WITH LOGIN PASSWORD '${contrasena}' ${atributosSql}`);
  console.log(`  rol "${nombre}" creado.`);
  return contrasena;
}

async function existeBase(cliente, nombre) {
  const { rows } = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
  return rows.length > 0;
}

// Reemplaza (o agrega) las claves indicadas en .env, conservando todo lo demás tal cual estaba.
function actualizarEnv(valores) {
  const lineasExistentes = fs.existsSync(RUTA_ENV) ? fs.readFileSync(RUTA_ENV, 'utf8').split('\n') : [];
  const claves = new Set(Object.keys(valores));
  const restantes = lineasExistentes.filter((linea) => !claves.has(linea.split('=')[0]?.trim()));
  while (restantes.length && restantes[restantes.length - 1].trim() === '') restantes.pop();
  const nuevas = Object.entries(valores).map(([clave, valor]) => `${clave}=${valor}`);
  fs.writeFileSync(RUTA_ENV, [...restantes, ...nuevas, ''].join('\n'), 'utf8');
}

async function principal() {
  const contrasenaAdmin = await obtenerContrasenaAdmin();

  console.log(`Conectando como superusuario a PostgreSQL en ${HOST}:${PUERTO}...`);
  const admin = await conectar('postgres', 'postgres', contrasenaAdmin);
  console.log('Conectado. Revisando roles...');

  const nuevas = {};
  nuevas.propietario = await asegurarRol(admin, 'sst_propietario', 'NOSUPERUSER NOCREATEDB NOCREATEROLE');
  nuevas.app = await asegurarRol(admin, 'sst_app', 'NOSUPERUSER NOCREATEDB NOCREATEROLE');
  nuevas.pruebas = await asegurarRol(admin, 'sst_pruebas', 'NOSUPERUSER CREATEDB NOCREATEROLE');

  let baseRecienCreada = false;
  if (!(await existeBase(admin, BASE))) {
    await admin.query(`CREATE DATABASE ${BASE} OWNER sst_propietario`);
    baseRecienCreada = true;
    console.log(`  base de datos "${BASE}" creada (dueña: sst_propietario).`);
  } else {
    console.log(`  base de datos "${BASE}" ya existía, no se recrea.`);
  }
  await admin.end();

  // El esquema "public" de una base nueva no queda de propiedad de quien la crea (cambio de
  // PostgreSQL 15): sin este paso, sst_propietario no podría crear tablas en su propia base.
  if (baseRecienCreada) {
    const adminEnBase = await conectar(BASE, 'postgres', contrasenaAdmin);
    await adminEnBase.query('ALTER SCHEMA public OWNER TO sst_propietario');
    await adminEnBase.end();
    console.log('  esquema "public" traspasado a sst_propietario.');
  }

  // Si el rol ya existía, su contraseña no se volvió a pedir: se reutiliza la que ya estaba en .env.
  cargarEnv();
  const contrasenaPropietario = nuevas.propietario || extraerContrasena(process.env.SST_PG_PROPIETARIO_URL);
  const contrasenaApp = nuevas.app || extraerContrasena(process.env.SST_PG_URL);
  const contrasenaPruebas = nuevas.pruebas || extraerContrasena(process.env.SST_PG_PRUEBAS_URL);
  for (const [rol, contrasena, variable] of [
    ['sst_propietario', contrasenaPropietario, 'SST_PG_PROPIETARIO_URL'],
    ['sst_app', contrasenaApp, 'SST_PG_URL'],
    ['sst_pruebas', contrasenaPruebas, 'SST_PG_PRUEBAS_URL'],
  ]) {
    if (!contrasena) throw new Error(`El rol "${rol}" ya existía en PostgreSQL pero no encontré ${variable} en .env para recuperar su contraseña. Bórralo manualmente (DROP ROLE ${rol};) y vuelve a ejecutar este script.`);
  }

  console.log('Aplicando el esquema (si hace falta) y los permisos mínimos de sst_app...');
  const propietario = await conectar(BASE, 'sst_propietario', contrasenaPropietario);
  const { rows: existeTabla } = await propietario.query("SELECT to_regclass('public.trabajo') AS t");
  if (!existeTabla[0].t) {
    await propietario.query(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'esquema.sql'), 'utf8'));
    await propietario.query(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'semilla.sql'), 'utf8'));
    console.log('  esquema y semilla aplicados.');
  } else {
    console.log('  el esquema ya estaba aplicado, no se repite.');
  }

  await propietario.query(`GRANT CONNECT ON DATABASE ${BASE} TO sst_app, sst_propietario`);
  await propietario.query('GRANT USAGE ON SCHEMA public TO sst_app');
  await propietario.query(`GRANT SELECT ON ${SOLO_LECTURA.join(', ')} TO sst_app`);
  await propietario.query(`GRANT SELECT, INSERT, UPDATE ON ${LECTURA_ESCRITURA.join(', ')} TO sst_app`);
  await propietario.query(`GRANT SELECT, INSERT ON ${SOLO_INSERCION.join(', ')} TO sst_app`);
  await propietario.query(`GRANT USAGE, SELECT ON SEQUENCE ${SECUENCIAS_APP.join(', ')} TO sst_app`);
  // Para que una tabla nueva (de una futura migración) también quede accesible sin repetir este script a mano.
  await propietario.query('ALTER DEFAULT PRIVILEGES FOR ROLE sst_propietario IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO sst_app');
  await propietario.end();
  console.log('  permisos de sst_app aplicados.');

  actualizarEnv({
    SST_PG_URL: urlPg('sst_app', contrasenaApp, BASE),
    SST_PG_PROPIETARIO_URL: urlPg('sst_propietario', contrasenaPropietario, BASE),
    // sst_pruebas se conecta a la base de mantenimiento "postgres" porque necesita crear y borrar
    // bases temporales (sst_prueba_xxxx) para cada suite; no tiene ni necesita permisos en sst_kotoduo.
    SST_PG_PRUEBAS_URL: urlPg('sst_pruebas', contrasenaPruebas, 'postgres'),
  });
  console.log('\nListo. SST_PG_URL, SST_PG_PROPIETARIO_URL y SST_PG_PRUEBAS_URL quedaron en .env.');
  console.log('La contraseña del superusuario postgres no se guardó y no se vuelve a pedir.');
}

function extraerContrasena(url) {
  if (!url) return null;
  try { return decodeURIComponent(new URL(url).password); } catch { return null; }
}

principal().catch((err) => {
  console.error('No fue posible preparar la base de datos:', err.message);
  process.exit(1);
});
