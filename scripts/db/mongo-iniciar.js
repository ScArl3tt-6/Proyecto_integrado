'use strict';
// Arranca MongoDB local con autenticación (--auth) si todavía no está corriendo en el puerto
// configurado, y deja listos los usuarios sst_admin y sst_app (ver mongo-crear-usuarios.js).
// Busca el ejecutable "mongod" en el PATH y en las rutas típicas de instalación en Windows.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { cargarEnv } = require('../cargarEnv');
const { principal: crearUsuarios } = require('./mongo-crear-usuarios');

cargarEnv();

const HOST = process.env.SST_MONGO_HOST || '127.0.0.1';
const PUERTO = Number(process.env.SST_MONGO_PUERTO || 27027);
const DBPATH = path.join(__dirname, '..', '..', 'datos', 'mongo');

function puertoAbierto(puerto, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: puerto, host });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

function buscarMongod() {
  const base = 'C:\\Program Files\\MongoDB\\Server';
  if (fs.existsSync(base)) {
    const versiones = fs.readdirSync(base).sort().reverse();
    for (const version of versiones) {
      const ruta = path.join(base, version, 'bin', 'mongod.exe');
      if (fs.existsSync(ruta)) return ruta;
    }
  }
  return 'mongod'; // se confía en el PATH
}

async function principal() {
  if (await puertoAbierto(PUERTO, HOST)) {
    console.log(`MongoDB ya está escuchando en ${HOST}:${PUERTO}.`);
  } else {
    const mongod = buscarMongod();
    fs.mkdirSync(DBPATH, { recursive: true });
    console.log(`Iniciando MongoDB ("${mongod}") en ${HOST}:${PUERTO}, con autenticación...`);
    const proceso = spawn(mongod, ['--port', String(PUERTO), '--dbpath', DBPATH, '--bind_ip', HOST, '--auth'], {
      detached: true, stdio: 'ignore',
    });
    let fallo = null;
    proceso.on('error', (err) => { fallo = err; });
    proceso.unref();

    let listo = false;
    for (let intento = 0; intento < 30 && !fallo; intento += 1) {
      await new Promise((r) => setTimeout(r, 500));
      if (await puertoAbierto(PUERTO, HOST)) { listo = true; break; }
    }
    if (fallo) throw new Error(`No se encontró "mongod" (probé "${mongod}"). Instala MongoDB 8 o agrégalo al PATH.`);
    if (!listo) throw new Error('MongoDB no respondió a tiempo al iniciar.');
    console.log('MongoDB iniciado.');
  }

  await crearUsuarios();
}

principal().catch((err) => { console.error('No fue posible iniciar MongoDB:', err.message); process.exit(1); });
