'use strict';
const readline = require('node:readline');

// Pide un dato por consola sin mostrarlo en pantalla (ni como texto ni como asteriscos), usando
// solo el módulo nativo readline: se escribe el mensaje aparte y luego se silencia todo lo que
// readline intentaría reflejar en pantalla mientras la persona escribe.
function preguntarOculto(mensaje) {
  return new Promise((resolve) => {
    process.stdout.write(mensaje);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question('', (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta);
    });
  });
}

// PGPASSWORD es la convención estándar de las herramientas de PostgreSQL (psql la usa igual);
// si ya está definida (por ejemplo por quien ejecuta el script), se reutiliza y no se pregunta de nuevo.
async function obtenerContrasenaAdmin(mensaje = 'Contraseña del superusuario postgres (no se muestra en pantalla): ') {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const valor = await preguntarOculto(mensaje);
  if (!valor) throw new Error('No se ingresó ninguna contraseña.');
  return valor;
}

module.exports = { preguntarOculto, obtenerContrasenaAdmin };
