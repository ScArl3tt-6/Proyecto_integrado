'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Lector mínimo de .env (sin dependencias nuevas): KEY=VALOR por línea, sin pisar variables ya definidas.
function cargarEnv(archivo = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const posicion = limpia.indexOf('=');
    if (posicion === -1) continue;
    const clave = limpia.slice(0, posicion).trim();
    const valor = limpia.slice(posicion + 1).trim();
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

module.exports = { cargarEnv };
