'use strict';

// Validación de archivos de propuestas de diseño (lista blanca + firma real del archivo).
// SVG se excluye porque puede contener scripts embebidos (riesgo de XSS).
const TAMANO_MAXIMO = 15 * 1024 * 1024; // 15 MB
const FIRMAS = new Map(Object.entries({
  'application/pdf': { extension: ['pdf'], firma: [0x25, 0x50, 0x44, 0x46] },
  'image/png': { extension: ['png'], firma: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { extension: ['jpg', 'jpeg'], firma: [0xff, 0xd8, 0xff] },
}));

function validarArchivoDiseno({ nombre, tipoMime, tamanoBytes, cabeceraBase64 }) {
  const errores = [];
  const regla = FIRMAS.get(tipoMime);
  if (!regla) return { valido: false, errores: ['Tipo de archivo no permitido'] };

  if (!/^[\w\- áéíóúñÁÉÍÓÚÑ().]{1,100}$/.test(nombre) || nombre.includes('..')) errores.push('Nombre de archivo inválido');
  const extension = nombre.split('.').pop().toLowerCase();
  if (!regla.extension.includes(extension)) errores.push('La extensión no coincide con el tipo declarado');
  if (!Number.isInteger(tamanoBytes) || tamanoBytes <= 0 || tamanoBytes > TAMANO_MAXIMO) errores.push('Tamaño fuera de rango');

  const cabecera = Buffer.from(cabeceraBase64 || '', 'base64');
  const coincide = cabecera.length >= regla.firma.length && regla.firma.every((byte, i) => cabecera.readUInt8(i) === byte);
  if (!coincide) errores.push('El contenido no corresponde al tipo declarado');

  return { valido: errores.length === 0, errores };
}

module.exports = { validarArchivoDiseno, TAMANO_MAXIMO };
