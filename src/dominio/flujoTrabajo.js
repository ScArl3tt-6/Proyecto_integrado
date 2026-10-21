'use strict';
const { ErrorNegocio } = require('./errores');

// Transiciones permitidas del estado general de un trabajo (diagrama de estados, vista lógica)
const TRANSICIONES = new Map(Object.entries({
  SOLICITADO: ['EN_DISENO'],
  EN_DISENO: ['PENDIENTE_APROBACION'],
  PENDIENTE_APROBACION: ['EN_PRODUCCION', 'EN_DISENO'],
  EN_PRODUCCION: ['DETENIDO', 'TERMINADO'],
  DETENIDO: ['EN_PRODUCCION'],
  TERMINADO: [],
}));

function puedeTransitar(actual, nuevo) {
  return TRANSICIONES.get(actual)?.includes(nuevo) === true;
}

function validarTransicion(actual, nuevo) {
  if (!puedeTransitar(actual, nuevo)) {
    throw new ErrorNegocio(`Transición no permitida: ${actual} -> ${nuevo}`, 409);
  }
  return nuevo;
}

// Etapa vigente: la primera que no está completada, según el orden definido para el tipo de trabajo
function etapaVigente(etapas) {
  return [...etapas].sort((a, b) => a.orden - b.orden).find((e) => e.estado !== 'COMPLETADA') || null;
}

function siguienteEtapa(etapas, ordenActual) {
  return [...etapas].sort((a, b) => a.orden - b.orden).find((e) => e.orden > ordenActual) || null;
}

// "Atrasado" no es un estado: se calcula a partir de la fecha comprometida
function estaAtrasado(trabajo, hoy = new Date()) {
  if (trabajo.estado === 'TERMINADO') return false;
  // La fecha comprometida se interpreta como día calendario local (America/Santiago), no como medianoche UTC
  const f = trabajo.fecha_compromiso;
  const [a, m, d] = f instanceof Date
    ? [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()]
    : String(f).slice(0, 10).split('-').map(Number);
  const finDelDia = new Date(a, m - 1, d, 23, 59, 59, 999);
  return hoy > finDelDia;
}

module.exports = { TRANSICIONES, puedeTransitar, validarTransicion, etapaVigente, siguienteEtapa, estaAtrasado };
