'use strict';
// Verifica que el entorno esté listo: versiones, conexión con el rol de aplicación a ambas bases,
// que ese rol NO tenga privilegios de esquema (mínimo privilegio) y un ciclo real de escritura,
// lectura y limpieza con un registro marcado DEMO. Es la evidencia del indicador 3.1.4.7.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { Client } = require('pg');
const { MongoClient } = require('mongodb');
const { cargarEnv } = require('./cargarEnv');

cargarEnv();

const resultados = [];
function registrar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle });
  console.log(`[${ok ? ' OK ' : 'FALLA'}] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function version(comando) {
  try { return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]; } catch { return null; }
}

function verificarVersiones() {
  registrar('Versión de Node.js', true, process.version);
  const pg = version('psql --version') || version('"C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe" --version');
  registrar('psql disponible', Boolean(pg), pg || 'no está en el PATH (no es obligatorio: la app usa el driver "pg", no psql)');
  const mongod = version('mongod --version');
  registrar('mongod disponible', Boolean(mongod), mongod || 'no está en el PATH');
}

async function verificarPostgres() {
  if (!process.env.SST_PG_URL) { registrar('PostgreSQL: SST_PG_URL en .env', false, 'ejecuta "npm run db:crear"'); return; }
  const appCliente = new Client({ connectionString: process.env.SST_PG_URL });
  try {
    await appCliente.connect();
    const { rows } = await appCliente.query('SELECT version() AS v');
    registrar('PostgreSQL: conexión con sst_app', true, rows[0].v.split(',')[0]);
  } catch (err) {
    registrar('PostgreSQL: conexión con sst_app', false, err.message);
    return;
  }

  let bloqueoCreate = false;
  try { await appCliente.query('CREATE TABLE prueba_privilegio_demo (id INT)'); await appCliente.query('DROP TABLE prueba_privilegio_demo'); } catch { bloqueoCreate = true; }
  registrar('PostgreSQL: sst_app NO puede CREATE TABLE (mínimo privilegio)', bloqueoCreate);

  let bloqueoDrop = false;
  try { await appCliente.query('DROP TABLE trabajo'); } catch { bloqueoDrop = true; }
  registrar('PostgreSQL: sst_app NO puede DROP TABLE (mínimo privilegio)', bloqueoDrop);

  // Escritura y lectura con sst_app (su uso real); la limpieza la hace sst_propietario, porque
  // sst_app no tiene DELETE en ninguna tabla (el código de la aplicación tampoco borra filas).
  const correoDemo = `verificacion-demo-${Date.now()}@kotoduo.test`;
  let escrituraLecturaOk = false;
  try {
    await appCliente.query(
      "INSERT INTO usuario (nombre, correo, hash_contrasena, id_rol) VALUES ('DEMO verificar-entorno', $1, 'x', (SELECT id_rol FROM rol WHERE nombre = 'VENDEDOR'))",
      [correoDemo],
    );
    const { rows: leido } = await appCliente.query('SELECT nombre FROM usuario WHERE correo = $1', [correoDemo]);
    escrituraLecturaOk = leido[0]?.nombre === 'DEMO verificar-entorno';
  } catch (err) {
    registrar('PostgreSQL: escritura y lectura con sst_app (registro DEMO)', false, err.message);
  }
  if (escrituraLecturaOk) registrar('PostgreSQL: escritura y lectura con sst_app (registro DEMO)', true);
  await appCliente.end();

  if (process.env.SST_PG_PROPIETARIO_URL) {
    const propietario = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
    try {
      await propietario.connect();
      await propietario.query('DELETE FROM usuario WHERE correo = $1', [correoDemo]);
      registrar('PostgreSQL: limpieza del registro DEMO (con sst_propietario)', true);
    } catch (err) {
      registrar('PostgreSQL: limpieza del registro DEMO (con sst_propietario)', false, err.message);
    } finally {
      await propietario.end();
    }
  }
}

// Columnas que src/db/esquema.sql declara por tabla. Es la misma fuente que usa una base nueva
// (crear-base-postgres.js) o efímera (entorno-efimero.js): si una base YA existía antes de agregar
// una columna, se queda atrás hasta que alguien corra a mano el "scripts/db/agregar-*.js"
// correspondiente (ver DEF-40: "novedades_vistas_en" faltaba en la base real porque esquema.sql se
// actualizó pero nadie corrió "npm run db:agregar-novedades-vistas" contra ella). Esta verificación
// detecta ese desvío automáticamente, en vez de descubrirlo cuando una pantalla ya falla en producción.
const PALABRA_RESTRICCION = /^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i;

function dividirPorComaDeNivel0(texto) {
  const partes = [];
  let actual = '';
  let profundidad = 0;
  for (const c of texto) {
    if (c === '(') profundidad++;
    else if (c === ')') profundidad--;
    if (c === ',' && profundidad === 0) { partes.push(actual); actual = ''; }
    else actual += c;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

function columnasEsperadasPorTabla() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'esquema.sql'), 'utf8').replace(/--.*$/gm, '');
  const tablas = {};
  const re = /CREATE TABLE\s+(\w+)\s*\(/gi;
  let coincidencia;
  while ((coincidencia = re.exec(sql))) {
    let profundidad = 0;
    let i = coincidencia.index + coincidencia[0].length - 1;
    for (; i < sql.length; i++) {
      if (sql[i] === '(') profundidad++;
      else if (sql[i] === ')') { profundidad--; if (profundidad === 0) break; }
    }
    const cuerpo = sql.slice(coincidencia.index + coincidencia[0].length, i);
    tablas[coincidencia[1]] = dividirPorComaDeNivel0(cuerpo)
      .map((seg) => seg.trim())
      .filter((seg) => seg && !PALABRA_RESTRICCION.test(seg))
      .map((seg) => seg.split(/\s+/)[0]);
  }
  return tablas;
}

async function verificarEsquema() {
  if (!process.env.SST_PG_URL) return; // ya se reportó más arriba en verificarPostgres()
  const esperadas = columnasEsperadasPorTabla();
  const cliente = new Client({ connectionString: process.env.SST_PG_URL });
  try {
    await cliente.connect();
    const faltantes = [];
    for (const [tabla, columnas] of Object.entries(esperadas)) {
      const { rows } = await cliente.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
        ['public', tabla],
      );
      const existentes = new Set(rows.map((r) => r.column_name));
      for (const columna of columnas) {
        if (!existentes.has(columna)) faltantes.push(`${tabla}.${columna}`);
      }
    }
    registrar(
      'PostgreSQL: columnas de esquema.sql presentes en esta base',
      faltantes.length === 0,
      faltantes.length ? `faltan ${faltantes.join(', ')} — revisa si corresponde ejecutar algún "npm run db:agregar-*"` : '',
    );
  } catch (err) {
    registrar('PostgreSQL: columnas de esquema.sql presentes en esta base', false, err.message);
  } finally {
    await cliente.end();
  }
}

async function verificarMongo() {
  if (!process.env.SST_MONGO_URI) { registrar('MongoDB: SST_MONGO_URI en .env', false, 'ejecuta "npm run mongo:iniciar"'); return; }
  const cliente = new MongoClient(process.env.SST_MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  try {
    await cliente.connect();
    const base = process.env.SST_MONGO_BASE || 'sst_kotoduo';
    await cliente.db(base).command({ ping: 1 });
    registrar('MongoDB: conexión con sst_app', true);

    let bloqueoDrop = false;
    try { await cliente.db(base).dropDatabase(); } catch { bloqueoDrop = true; }
    registrar('MongoDB: sst_app NO puede dropDatabase (mínimo privilegio)', bloqueoDrop);

    const marca = `verificacion-demo-${Date.now()}`;
    await cliente.db(base).collection('bitacora_eventos').insertOne({ tipo: 'DEMO_VERIFICACION', entidad: { tipo: 'demo', codigo: marca }, fecha: new Date() });
    const leido = await cliente.db(base).collection('bitacora_eventos').findOne({ 'entidad.codigo': marca });
    registrar('MongoDB: escritura y lectura con sst_app (documento DEMO)', leido?.tipo === 'DEMO_VERIFICACION');
    await cliente.db(base).collection('bitacora_eventos').deleteOne({ 'entidad.codigo': marca });
    registrar('MongoDB: limpieza del documento DEMO', true);
  } catch (err) {
    registrar('MongoDB: conexión con sst_app', false, err.message);
  } finally {
    await cliente.close();
  }
}

async function principal() {
  console.log('=== Verificación del entorno SST Kotoduo ===\n');
  verificarVersiones();
  await verificarPostgres();
  await verificarEsquema();
  await verificarMongo();

  console.log('\n=== Resumen ===');
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`${resultados.length - fallas.length} de ${resultados.length} verificaciones en OK.`);
  if (fallas.length) {
    console.log('Fallas:');
    fallas.forEach((f) => console.log(`  - ${f.nombre}${f.detalle ? `: ${f.detalle}` : ''}`));
    process.exitCode = 1;
  }
}

principal().catch((err) => { console.error('No fue posible completar la verificación:', err.message); process.exit(1); });
