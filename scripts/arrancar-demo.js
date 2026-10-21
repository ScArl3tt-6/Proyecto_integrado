'use strict';
// Arranque de demostración: genera .env si falta, levanta MongoDB local si hace falta
// y deja la API escuchando. No imprime ni genera contraseñas (eso lo hace sembrar-demo.js).
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { cargarEnv } = require('./cargarEnv');

function asegurarEnv() {
  const rutaEnv = path.join(__dirname, '..', '.env');
  if (fs.existsSync(rutaEnv)) return;
  const valores = {
    NODE_ENV: 'development',
    SST_PUERTO: '3000',
    SST_JWT_SECRETO: crypto.randomBytes(48).toString('hex'),
    SST_MONGO_URI: 'mongodb://127.0.0.1:27027',
    SST_MONGO_BASE: 'sst_kotoduo_demo',
    SST_PG_DIRECTORIO: './datos-demo/pg',
  };
  fs.writeFileSync(rutaEnv, `${Object.entries(valores).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, 'utf8');
  for (const [clave, valor] of Object.entries(valores)) if (!(clave in process.env)) process.env[clave] = valor;
  console.log('Se generó .env con un secreto nuevo (no se sube al repositorio).');
}

function puertoAbierto(puerto, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: puerto, host });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

async function asegurarMongo(uri) {
  const url = new URL(uri);
  const puerto = Number(url.port || 27017);
  if (await puertoAbierto(puerto, url.hostname)) {
    console.log(`MongoDB ya está escuchando en el puerto ${puerto}.`);
    return;
  }
  console.log(`Iniciando MongoDB local en el puerto ${puerto}...`);
  const dbpath = path.join(__dirname, '..', 'datos-demo', 'mongo');
  fs.mkdirSync(dbpath, { recursive: true });
  const proceso = spawn('mongod', ['--port', String(puerto), '--dbpath', dbpath, '--bind_ip', '127.0.0.1'], {
    detached: true, stdio: 'ignore',
  });
  proceso.on('error', () => {
    console.error('No se encontró "mongod" en el PATH. Instala MongoDB 8 o indica un servidor ya activo con SST_MONGO_URI.');
  });
  proceso.unref();
  for (let intento = 0; intento < 20; intento += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await puertoAbierto(puerto, url.hostname)) return;
  }
  console.warn('MongoDB no respondió a tiempo; revisa que "mongod" esté disponible.');
}

async function principal() {
  cargarEnv();
  asegurarEnv();
  cargarEnv();
  await asegurarMongo(process.env.SST_MONGO_URI);
  console.log(`Abre http://localhost:${process.env.SST_PUERTO || 3000} en el navegador.`);
  require('../src/servidor');
}

principal().catch((err) => {
  console.error('No fue posible iniciar la demostración:', err.message);
  process.exit(1);
});
