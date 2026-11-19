// Piezas compartidas por todas las pantallas de trabajos: un solo diseño de tarjeta, un solo
// vocabulario de estados y los mismos estados de carga/vacío/error en toda la aplicación.
import { el, aviso } from './ui.js';

export const TEXTO_ESTADO = {
  SOLICITADO: 'Solicitado',
  EN_DISENO: 'En diseño',
  PENDIENTE_APROBACION: 'Esperando aprobación',
  EN_PRODUCCION: 'En producción',
  DETENIDO: 'Detenido',
  TERMINADO: 'Terminado',
};

// Nombres de las claves de "especificaciones" de una propuesta (ver enviarPropuesta en diseno.js),
// para no mostrar la clave interna cruda ("tecnica", "ubicacion") en pantalla.
export const TEXTO_ESPECIFICACION = {
  tecnica: 'Técnica',
  ubicacion: 'Ubicación',
  medidas: 'Medidas',
  colores: 'Colores',
};

// Texto humano para cada tipo de evento de la bitácora que puede estar ligado a un trabajo (ver
// entidad.tipo === 'trabajo' en src/modulos/*). Punto 1 de la revisión del equipo, 18-11-2026:
// antes se mostraba el código interno tal cual ("DISENO_APROBADO").
export const TEXTO_EVENTO = {
  TRABAJO_CREADO: 'Solicitud creada',
  DISENO_INICIADO: 'Diseño tomó la solicitud',
  DISENO_ENVIADO: 'Propuesta de diseño enviada',
  DISENO_APROBADO: 'Diseño aprobado',
  DISENO_RECHAZADO: 'Diseño rechazado',
  ETAPA_INICIADA: 'Etapa de producción tomada',
  ETAPA_COMPLETADA: 'Etapa de producción completada',
  ETAPA_LIBERADA: 'Etapa liberada (queda disponible para tomar de nuevo)',
  TRABAJO_DETENIDO: 'Trabajo detenido',
  TRABAJO_REANUDADO: 'Trabajo reanudado',
  MATERIAL_REGISTRADO: 'Material registrado',
};

// Detalle legible de un evento (punto 1: "con el detalle útil: etapa, material, motivo"), a
// partir de lo que ya guarda cada evento (ver bitacora.registrar en cada servicio) más los nombres
// que el servidor ya resolvió (usuario.nombre, detalle.material) al leer la bitácora.
export function detalleEvento(evento, { nombreEtapa } = {}) {
  const d = evento.detalle || {};
  switch (evento.tipo) {
    case 'DISENO_ENVIADO': return `Versión ${d.version}.`;
    case 'DISENO_APROBADO': return null;
    case 'DISENO_RECHAZADO': return d.motivo ? `Motivo: ${d.motivo}` : null;
    case 'ETAPA_INICIADA':
    case 'ETAPA_COMPLETADA':
    case 'ETAPA_LIBERADA': return nombreEtapa ? `Etapa: ${nombreEtapa}` : (d.orden ? `Etapa n.º ${d.orden}` : null);
    case 'TRABAJO_DETENIDO': return d.motivo ? `Motivo: ${d.motivo}` : null;
    case 'MATERIAL_REGISTRADO': return d.material ? `${d.material.nombre}: ${d.cantidad} ${d.material.unidad}${d.medida ? ` (${d.medida})` : ''}` : null;
    default: return null;
  }
}

const CLASE_ESTADO = {
  SOLICITADO: 'chip-neutro',
  EN_DISENO: 'chip-neutro',
  PENDIENTE_APROBACION: 'chip-aviso',
  EN_PRODUCCION: 'chip-neutro',
  DETENIDO: 'chip-error',
  TERMINADO: 'chip-ok',
};

export function chipEstado(estado) {
  return el('span', { class: `chip ${CLASE_ESTADO[estado] || 'chip-neutro'}` }, TEXTO_ESTADO[estado] || estado);
}

export function chipAtrasado() {
  return el('span', { class: 'chip chip-error' }, 'Atrasado');
}

// Quién tiene tomada una etapa de producción ahora mismo: antes era texto chico bajo el botón
// (punto B3 de la revisión del equipo, 19-11-2026); ahora es una etiqueta con ícono, junto al
// título de la etapa, igual de visible que el estado.
export function chipResponsable(nombre) {
  return el('span', { class: 'chip chip-responsable' }, el('span', { class: 'icono-responsable', 'aria-hidden': 'true' }), nombre);
}

function formatoFecha(fecha) {
  const texto = String(fecha).slice(0, 10);
  const [anio, mes, dia] = texto.split('-');
  return `${dia}-${mes}-${anio}`;
}

// Tarjeta única de trabajo, reutilizada por las cinco pantallas de perfil
export function tarjetaTrabajo(trabajo, { accion, detalleExtra } = {}) {
  const encabezado = el('div', { class: 'tarjeta-trabajo-encabezado' },
    el('span', { class: 'codigo-trabajo' }, trabajo.codigo),
    chipEstado(trabajo.estado),
    trabajo.atrasado ? chipAtrasado() : null,
  );
  const cuerpo = el('div', { class: 'tarjeta-trabajo-cuerpo' },
    el('p', { class: 'tarjeta-trabajo-descripcion' }, trabajo.descripcion),
    el('p', { class: 'tarjeta-trabajo-meta' }, `${trabajo.tipo} · ${trabajo.cantidad} unidades`),
    el('p', { class: 'tarjeta-trabajo-meta' }, `Compromiso: ${formatoFecha(trabajo.fecha_compromiso)}`),
    trabajo.etapa_actual ? el('p', { class: 'tarjeta-trabajo-meta' }, `Etapa actual: ${trabajo.etapa_actual}`) : null,
    detalleExtra || null,
  );
  return el('article', { class: 'tarjeta tarjeta-trabajo' }, encabezado, cuerpo, accion ? el('div', { class: 'tarjeta-trabajo-accion' }, accion) : null);
}

// Resumen vertical de las etapas de un trabajo, usado en el detalle
export function listaEtapas(etapas) {
  if (!etapas.length) return el('p', { class: 'campo-ayuda' }, 'Aún no hay etapas de producción para este trabajo.');
  return el('ol', { class: 'lista-etapas' }, ...etapas.map((etapa) => el('li', { class: `etapa-item etapa-${etapa.estado.toLowerCase()}` },
    el('div', { class: 'etapa-item-encabezado' },
      el('span', { class: 'etapa-nombre' }, `${etapa.orden}. ${etapa.nombre}`),
      chipEstado(etapa.estado === 'COMPLETADA' ? 'TERMINADO' : etapa.estado === 'EN_CURSO' ? 'EN_PRODUCCION' : 'SOLICITADO'),
      etapa.responsable ? chipResponsable(etapa.responsable) : null,
    ),
    el('span', { class: 'etapa-area' }, etapa.area),
  )));
}

export function estadoVacio(mensaje) {
  return el('div', { class: 'estado-vacio' }, mensaje);
}

export function estadoCarga(lineas = 3) {
  const contenedor = el('div', { class: 'tarjeta' });
  for (let i = 0; i < lineas; i += 1) contenedor.appendChild(el('div', { class: 'esqueleto esqueleto-linea' }));
  return contenedor;
}

export function estadoError(mensaje, alReintentar) {
  const nodo = aviso('error', mensaje);
  if (alReintentar) {
    const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Reintentar');
    boton.addEventListener('click', alReintentar);
    nodo.appendChild(boton);
  }
  return nodo;
}

// Paginador simple: como el listado no informa el total, "Siguiente" se habilita mientras la
// página venga llena (señal de que puede haber más).
export function paginador({ pagina, llena, alCambiar }) {
  const anterior = el('button', { type: 'button', class: 'boton boton-secundario', disabled: pagina <= 1 }, 'Anterior');
  anterior.addEventListener('click', () => alCambiar(pagina - 1));
  const siguiente = el('button', { type: 'button', class: 'boton boton-secundario', disabled: !llena }, 'Siguiente');
  siguiente.addEventListener('click', () => alCambiar(pagina + 1));
  return el('div', { class: 'paginador' }, anterior, el('span', { class: 'campo-ayuda' }, `Página ${pagina}`), siguiente);
}
