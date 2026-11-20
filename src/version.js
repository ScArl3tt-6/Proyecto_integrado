'use strict';
const { execSync } = require('node:child_process');

// Identifica la versión de código que de verdad está corriendo este proceso (no solo lo que hay
// en el disco): se calcula una sola vez al arrancar. Con git disponible, es el commit exacto; sin
// git (por ejemplo, un servidor ya empaquetado), al menos cambia en cada arranque, que es
// justamente el caso que causó la confusión del 19-11-2026 (un servidor viejo, sin reiniciar,
// atendiendo pantallas que ya esperaban el comportamiento nuevo).
function calcularVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return `arranque-${Date.now()}`;
  }
}

const VERSION = calcularVersion();

module.exports = { VERSION };
