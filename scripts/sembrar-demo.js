'use strict';
// Siembra de datos de demostración (no se ejecuta en producción). Crea las seis cuentas del caso
// y seis trabajos de ejemplo a través de los servicios (no con SQL directo), para que la bitácora
// quede coherente con el uso real del sistema.
const { cargarEnv } = require('./cargarEnv');
cargarEnv();

if (process.env.NODE_ENV === 'production') {
  console.error('La siembra de demostración no se ejecuta en producción.');
  process.exit(1);
}

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { cargarEntorno } = require('../src/config/entorno');
const { crearBaseRelacional } = require('../src/db/postgres');
const { crearBaseDocumental } = require('../src/db/mongo');
const { crearApp } = require('../src/app');
const { validarContrasena } = require('../src/dominio/politicaContrasena');

const PALABRAS = [
  'hilo', 'tela', 'rosa', 'cafe', 'mesa', 'lana', 'pino', 'cerro', 'rio', 'campo',
  'taller', 'turno', 'telar', 'hoja', 'piedra', 'nube', 'viento', 'bosque', 'arena', 'puente',
  'faro', 'vidrio', 'cobre', 'lienzo', 'aguja', 'carrete', 'matriz', 'molde', 'trama', 'plancha',
  'rollo', 'bobina', 'tinta', 'resina', 'esponja', 'cepillo', 'rodillo', 'marco', 'taco', 'borde',
];

function generarFrase({ correo, nombre }) {
  let contrasena;
  do {
    const elegidas = new Set();
    while (elegidas.size < 4) elegidas.add(PALABRAS[crypto.randomInt(PALABRAS.length)]);
    contrasena = [...elegidas].join(' ');
  } while (!validarContrasena(contrasena, { correo, nombre }).valida);
  return contrasena;
}

const CABECERA_PDF = Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1').toString('base64');

function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function crearCuenta(servicios, { nombre, correo, rol, area }) {
  const contrasena = generarFrase({ correo, nombre });
  const { idUsuario } = await servicios.usuarios.crear(null, { nombre, correo, contrasena, rol, area });
  return { idUsuario, nombre, correo, contrasena, rol };
}

async function principal() {
  const entorno = cargarEntorno();
  const pg = await crearBaseRelacional(entorno.pgDirectorio);
  const { cliente, db: mongoDb } = await crearBaseDocumental(entorno.mongoUri, entorno.mongoBase);
  const { servicios } = crearApp({ entorno, pg, mongoDb });

  const { rows: areas } = await pg.query('SELECT id_area, nombre FROM area');
  const idArea = (nombre) => areas.find((a) => a.nombre === nombre)?.id_area ?? null;

  const cuentas = {};
  cuentas.koto = await crearCuenta(servicios, { nombre: 'Koto', correo: 'koto@kotoduo.test', rol: 'ADMINISTRADOR', area: 'Administración' });
  cuentas.marcela = await crearCuenta(servicios, { nombre: 'Marcela Fuentes', correo: 'marcela@kotoduo.test', rol: 'PRODUCCION', area: undefined });
  cuentas.valentina = await crearCuenta(servicios, { nombre: 'Valentina Rojas', correo: 'valentina@kotoduo.test', rol: 'DISENO', area: 'Diseño' });
  cuentas.jorge = await crearCuenta(servicios, { nombre: 'Jorge Saavedra', correo: 'jorge@kotoduo.test', rol: 'VENDEDOR', area: 'Ventas' });
  cuentas.luis = await crearCuenta(servicios, { nombre: 'Luis Cárdenas', correo: 'luis@kotoduo.test', rol: 'OPERARIO', area: 'Bordado' });
  cuentas.camila = await crearCuenta(servicios, { nombre: 'Camila Soto', correo: 'camila@kotoduo.test', rol: 'OPERARIO', area: 'Sublimación' });

  const jorge = { id: cuentas.jorge.idUsuario, rol: 'VENDEDOR' };
  const valentina = { id: cuentas.valentina.idUsuario, rol: 'DISENO' };
  const marcela = { id: cuentas.marcela.idUsuario, rol: 'PRODUCCION' };
  const luis = { id: cuentas.luis.idUsuario, rol: 'OPERARIO', idArea: idArea('Bordado') };

  const archivo = (nombre) => ({ nombre, tipoMime: 'application/pdf', tamanoBytes: 250000, cabeceraBase64: CABECERA_PDF });

  async function aprobar(codigo) {
    await servicios.trabajos.tomarParaDiseno(valentina, codigo);
    const { idDiseno } = await servicios.disenos.enviarPropuesta(valentina, codigo, { archivos: [archivo(`${codigo}.pdf`)] });
    await servicios.disenos.decidir(marcela, idDiseno, { decision: 'APROBADO' });
  }

  // 1) Atrasado: queda solicitado con la fecha comprometida ya pasada
  const { codigo: atrasado } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Poleras bordadas para evento de aniversario', cantidad: 40, fechaCompromiso: fechaEnDias(-5),
  });

  // 2) Esperando aprobación: la propuesta ya se envió, falta la decisión de Producción
  const { codigo: pendiente } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 2, descripcion: 'Tazones sublimados para egreso de curso', cantidad: 80, fechaCompromiso: fechaEnDias(10),
  });
  await servicios.trabajos.tomarParaDiseno(valentina, pendiente);
  await servicios.disenos.enviarPropuesta(valentina, pendiente, { archivos: [archivo(`${pendiente}.pdf`)] });

  // 3) Rechazado con motivo: vuelve a diseño con el motivo visible en la bandeja
  const { codigo: rechazado } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 3, descripcion: 'Letrero luminoso fachada local centro', cantidad: 1, fechaCompromiso: fechaEnDias(18),
  });
  await servicios.trabajos.tomarParaDiseno(valentina, rechazado);
  const { idDiseno: idDisenoRechazado } = await servicios.disenos.enviarPropuesta(valentina, rechazado, { archivos: [archivo(`${rechazado}.pdf`)] });
  await servicios.disenos.decidir(marcela, idDisenoRechazado, { decision: 'RECHAZADO', motivo: 'El tamaño del letrero supera el ancho permitido por la fachada' });

  // 4) Detenido: aprobado y en producción, pero detenido por falta de materiales
  const { codigo: detenido } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 4, descripcion: 'Placas grabadas para premiación regional', cantidad: 25, fechaCompromiso: fechaEnDias(14),
  });
  await aprobar(detenido);
  await servicios.trabajos.detener(marcela, detenido, 'Falta materia prima para el grabado');

  // 5) En producción en Bordado: aprobado, con la primera etapa en curso para que Luis la vea
  const { codigo: enProduccion } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Chalecos bordados para turno de planta', cantidad: 35, fechaCompromiso: fechaEnDias(9),
  });
  await aprobar(enProduccion);

  // 6) Terminado: recorre todas las etapas de bordado hasta el cierre
  const { codigo: terminado } = await servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Poleras bordadas para taller interno', cantidad: 20, fechaCompromiso: fechaEnDias(-1),
  });
  await aprobar(terminado);
  await servicios.trabajos.completarEtapa(luis, terminado, 1);
  await servicios.trabajos.completarEtapa(luis, terminado, 2);
  await servicios.trabajos.completarEtapa(luis, terminado, 3);

  const lineas = [
    'Credenciales de demostración de SST Kotoduo',
    'Se generan de nuevo en cada "npm run demo:sembrar"; no son fijas ni se suben al repositorio.',
    '',
    ...Object.values(cuentas).map((c) => `${c.rol.padEnd(14)} ${c.correo.padEnd(24)} ${c.contrasena}`),
    '',
    `Trabajos de ejemplo: ${atrasado} (atrasado), ${pendiente} (esperando aprobación), ${rechazado} (rechazado con motivo),`,
    `                     ${detenido} (detenido), ${enProduccion} (en producción, Bordado), ${terminado} (terminado).`,
    '',
  ];
  fs.writeFileSync(path.join(__dirname, '..', '.demo-credenciales.txt'), lineas.join('\n'), 'utf8');
  console.log('Cuentas y trabajos de demostración creados.');
  console.log('Las credenciales quedaron en .demo-credenciales.txt (no se muestran aquí ni se suben al repositorio).');

  await cliente.close();
  await pg.close();
}

principal().catch((err) => {
  console.error('No fue posible sembrar los datos de demostración:', err.message);
  process.exit(1);
});
