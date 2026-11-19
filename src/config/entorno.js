'use strict';

// Los secretos se leen solo desde variables de entorno; nunca se escriben en el código.
function requerida(nombre) {
  // nombre es una constante del código, no una entrada del usuario
  // eslint-disable-next-line security/detect-object-injection
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

function cargarEntorno() {
  const secretoJwt = requerida('SST_JWT_SECRETO');
  if (secretoJwt.length < 32) throw new Error('SST_JWT_SECRETO debe tener al menos 32 caracteres');
  const puerto = Number(process.env.SST_PUERTO || 3000);
  return Object.freeze({
    puerto,
    produccion: process.env.NODE_ENV === 'production',
    secretoJwt,
    // Para enlaces que se entregan a otra persona (primer acceso, restablecimiento): dónde vive de
    // verdad la aplicación para quien lo recibe, no de dónde Administración mira la pantalla al
    // generarlo (localhost en desarrollo nunca sirve para nadie más). Punto 7 de la revisión del
    // equipo, 19-11-2026.
    urlBase: (process.env.SST_URL_BASE || `http://localhost:${puerto}`).replace(/\/+$/, ''),
    mongoUri: requerida('SST_MONGO_URI'),
    mongoBase: process.env.SST_MONGO_BASE || 'sst_kotoduo',
    pgUrl: requerida('SST_PG_URL'),
    minutosAcceso: 15,
    horasSesion: 8,
    minutosInactividad: 30, // sin ninguna solicitud autenticada real en este tiempo, la sesión se cierra sola
    minutosRestablecimiento: 30, // vigencia del enlace de restablecimiento de contraseña generado por Administración
    minutosDesafioMfa: 5, // tiempo para escribir el código de verificación en dos pasos tras la contraseña correcta
    limiteGeneral: Number(process.env.SST_LIMITE_GENERAL || 600), // solicitudes por minuto y por IP
    intentosMaximos: 5,
    minutosBloqueo: 15,
  });
}

module.exports = { cargarEntorno };
