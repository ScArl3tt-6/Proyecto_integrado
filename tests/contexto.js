'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const request = require('supertest');
const { Client } = require('pg');
const { crearBaseRelacional } = require('../src/db/postgres');
const { crearBaseDocumental } = require('../src/db/mongo');
const { crearApp } = require('../src/app');
const { cargarEnv } = require('../scripts/cargarEnv');

cargarEnv();

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en .env. Ejecuta "npm run db:crear" y "npm run mongo:iniciar" antes de correr las pruebas.`);
  return valor;
}

// Base PostgreSQL real y temporal (sst_prueba_xxxx), creada con el rol sst_pruebas (CREATEDB, sin
// superusuario) y destruida al terminar la suite. La contraseña del superusuario postgres nunca
// se necesita para esto.
async function crearBasePruebaPostgres() {
  const urlPruebas = requerida('SST_PG_PRUEBAS_URL');
  const nombreBase = `sst_prueba_${crypto.randomBytes(4).toString('hex')}`;

  const administracion = new Client({ connectionString: urlPruebas });
  await administracion.connect();
  await administracion.query(`CREATE DATABASE ${nombreBase}`);
  await administracion.end();

  const urlBasePrueba = new URL(urlPruebas);
  urlBasePrueba.pathname = `/${nombreBase}`;

  const clienteEsquema = new Client({ connectionString: urlBasePrueba.toString() });
  await clienteEsquema.connect();
  await clienteEsquema.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'esquema.sql'), 'utf8'));
  await clienteEsquema.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'semilla.sql'), 'utf8'));
  await clienteEsquema.end();

  async function destruir() {
    const administracion2 = new Client({ connectionString: urlPruebas });
    await administracion2.connect();
    await administracion2.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
    await administracion2.end();
  }

  return { url: urlBasePrueba.toString(), destruir };
}

// Contexto aislado por suite: PostgreSQL y MongoDB reales y propios, eliminados al terminar.
async function crearContexto({ envolverMongo, entornoExtra = {} } = {}) {
  const entorno = {
    puerto: 0, produccion: false, secretoJwt: crypto.randomBytes(48).toString('hex'),
    minutosAcceso: 15, horasSesion: 8, intentosMaximos: 5, minutosBloqueo: 15, minutosInactividad: 30, minutosRestablecimiento: 30, minutosDesafioMfa: 5,
    limiteGeneral: 100000, // sin límite general en las pruebas, salvo que una prueba lo fije
    urlBase: 'http://localhost:3000', // para los enlaces de primer acceso/restablecimiento; una prueba puede sobrescribirlo
    ...entornoExtra,
  };

  const basePruebaPg = await crearBasePruebaPostgres();
  const pgReal = await crearBaseRelacional(basePruebaPg.url);
  // Los servicios solo conocen pg.close(): se envuelve para que además borre la base temporal.
  const pg = { ...pgReal, close: async () => { await pgReal.close(); await basePruebaPg.destruir(); } };

  const nombreBaseMongo = `sst_prueba_${crypto.randomBytes(4).toString('hex')}`;
  const { cliente, db } = await crearBaseDocumental(requerida('SST_MONGO_PRUEBAS_URI'), nombreBaseMongo);
  const mongoDb = envolverMongo ? envolverMongo(db) : db;
  const registro = { error: () => {} };
  const { app, servicios } = crearApp({ entorno, pg, mongoDb, registro });

  // Usuarios de prueba del caso (contraseñas generadas en cada ejecución)
  const usuarios = {};
  const definiciones = [
    ['koto', 'Koto', 'ADMINISTRADOR', 'Administración'],
    ['marcela', 'Marcela Fuentes', 'PRODUCCION', null],
    ['valentina', 'Valentina Rojas', 'DISENO', 'Diseño'],
    ['jorge', 'Jorge Saavedra', 'VENDEDOR', 'Ventas'],
    ['luis', 'Luis Cárdenas', 'OPERARIO', 'Bordado'],
    ['camila', 'Camila Soto', 'OPERARIO', 'Sublimación'],
  ];
  for (const [clave, nombre, rol, area] of definiciones) {
    const correo = `${clave}@kotoduo.test`;
    const contrasena = `Prueba-${crypto.randomBytes(9).toString('base64url')}`;
    const { idUsuario } = await servicios.usuarios.crear(null, { nombre, correo, contrasena, rol, area });
    usuarios[clave] = { idUsuario, correo, contrasena, rol };
  }

  async function iniciarSesion(clave) {
    const agente = request.agent(app);
    const { correo, contrasena } = usuarios[clave];
    const res = await agente.post('/api/auth/login').send({ correo, contrasena });
    if (res.status !== 200) throw new Error(`No fue posible iniciar sesión como ${clave}: ${res.status}`);
    const csrf = res.body.csrf;
    return {
      agente,
      csrf,
      cookies: res.headers['set-cookie'], // cookies originales de la respuesta, para probar la renovación
      get: (url) => agente.get(url),
      post: (url, cuerpo) => agente.post(url).set('X-CSRF-Token', csrf).send(cuerpo),
      patch: (url, cuerpo) => agente.patch(url).set('X-CSRF-Token', csrf).send(cuerpo),
    };
  }

  async function cerrar() {
    await db.dropDatabase();
    await cliente.close();
    await pg.close();
  }

  return { app, pg, mongoDb: db, servicios, usuarios, iniciarSesion, cerrar };
}

// Cabeceras reales (primeros bytes) de archivos válidos, codificadas en base64
const CABECERAS = {
  pdf: Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1').toString('base64'),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">').toString('base64'),
};

function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

module.exports = { crearContexto, CABECERAS, fechaEnDias };
