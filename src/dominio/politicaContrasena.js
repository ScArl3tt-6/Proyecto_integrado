'use strict';

// Política de contraseñas alineada con OWASP ASVS V2.1 y NIST SP 800-63B:
// largo mínimo, sin reglas de composición arbitrarias y rechazo de contraseñas conocidas o predecibles.
const LARGO_MINIMO = 12;
const LARGO_MAXIMO = 128;

// Contraseñas de uso común de 12 o más caracteres (en minúsculas). Puede ampliarse con listas públicas.
const CONTRASENAS_COMUNES = new Set([
  '123456789012', '1234567890123', '12345678901234', '111111111111', '000000000000', '123123123123', '112233445566',
  'password1234', 'password12345', 'passw0rd1234', 'contrasena123', 'contrasena1234', 'contrasena2026', 'contrasena2025',
  'qwertyuiop12', 'qwertyuiopas', 'qwertyuiop123', '1q2w3e4r5t6y', '1qaz2wsx3edc', 'asdfghjkl123', 'asdfghjklzxc',
  'administrador', 'administrator', 'administrador1', 'administrador123', 'bienvenido123', 'bienvenida123', 'welcome12345',
  'letmein12345', 'iloveyou1234', 'iloveyou12345', 'te-quiero1234', 'tequiero1234', 'chile1234567', 'chilechile123',
  'santiago12345', 'temuco123456', 'inacap123456', 'inacap2026', 'inacap2025', 'trabajo123456', 'produccion123',
  'kotoduo12345', 'kotoduo2026!', 'kotoduo123456', 'kotoduo2026', 'kotoduo2025', 'kotoduo20262026',
]);

const SECUENCIAS = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiopasdfghjklzxcvbnm'];

function esPredecible(normalizada) {
  const sinEspacios = normalizada.replace(/\s/g, '');
  if (/^(.)\1+$/.test(sinEspacios)) return true; // un solo carácter repetido
  if (/^(.{1,4})\1+$/.test(sinEspacios)) return true; // un patrón corto repetido (abcabcabcabc)
  return SECUENCIAS.some((s) => s.includes(sinEspacios)); // secuencia completa del teclado o del alfabeto
}

function validarContrasena(contrasena, { correo = '', nombre = '' } = {}) {
  const errores = [];
  if (typeof contrasena !== 'string') return { valida: false, errores: ['Formato inválido'] };

  if (contrasena.length < LARGO_MINIMO) errores.push(`Debe tener al menos ${LARGO_MINIMO} caracteres`);
  if (contrasena.length > LARGO_MAXIMO) errores.push(`No puede superar ${LARGO_MAXIMO} caracteres`);

  const normalizada = contrasena.toLowerCase();
  if (CONTRASENAS_COMUNES.has(normalizada) || CONTRASENAS_COMUNES.has(normalizada.replace(/\s/g, ''))) errores.push('Corresponde a una contraseña de uso común');
  if (contrasena.length >= LARGO_MINIMO && esPredecible(normalizada)) errores.push('Es una secuencia o un patrón repetido');
  if (normalizada.includes('kotoduo')) errores.push('No debe contener el nombre de la empresa');

  const usuarioCorreo = correo.split('@')[0].toLowerCase();
  if (usuarioCorreo.length >= 4 && normalizada.includes(usuarioCorreo)) errores.push('No debe contener el usuario');
  const primerNombre = nombre.split(' ')[0].toLowerCase();
  if (primerNombre.length >= 4 && normalizada.includes(primerNombre)) errores.push('No debe contener el nombre');

  return { valida: errores.length === 0, errores };
}

module.exports = { validarContrasena, LARGO_MINIMO, LARGO_MAXIMO };
