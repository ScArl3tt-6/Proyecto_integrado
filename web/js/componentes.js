// Piezas compartidas por todas las pantallas de trabajos: un solo diseño de tarjeta, un solo
// vocabulario de estados y los mismos estados de carga/vacío/error en toda la aplicación.
import { el, aviso } from './ui.js';
import { ROL_TEXTO } from './permisos.js';

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
// que el servidor ya resolvió (usuario.nombre, detalle.material, detalle.nombreEtapa) al leer la
// bitácora — el de la etapa se resuelve en el servidor desde el 20-11-2026 (antes había que
// pasárselo a mano desde quien llamaba, y "Mis actividades" y la vista general de varios trabajos
// nunca lo hacían: mostraban "Etapa n.º 2" en vez del nombre real).
export function detalleEvento(evento) {
  const d = evento.detalle || {};
  switch (evento.tipo) {
    case 'DISENO_ENVIADO': return `Versión ${d.version}.`;
    case 'DISENO_APROBADO': return null;
    case 'DISENO_RECHAZADO': return d.motivo ? `Motivo: ${d.motivo}` : null;
    case 'ETAPA_INICIADA':
    case 'ETAPA_LIBERADA': return d.nombreEtapa ? `Etapa: ${d.nombreEtapa}` : (d.orden ? `Etapa n.º ${d.orden}` : null);
    case 'ETAPA_COMPLETADA': {
      const etapa = d.nombreEtapa ? `Etapa: ${d.nombreEtapa}.` : (d.orden ? `Etapa n.º ${d.orden}.` : '');
      return d.trabajoTerminado ? `${etapa} Era la última etapa: el trabajo quedó terminado.`.trim() : (etapa || null);
    }
    case 'TRABAJO_DETENIDO': return d.motivo ? `Motivo: ${d.motivo}` : null;
    case 'MATERIAL_REGISTRADO': return d.material ? `${d.material.nombre}: ${d.cantidad} ${d.material.unidad}${d.medida ? ` (${d.medida})` : ''}` : null;
    default: return null;
  }
}

// Una fila de la bitácora (texto humano, no el código interno), compartida por la Bitácora de
// Administración, "Mis actividades" y el historial dentro del detalle de un trabajo (punto 2 de la
// revisión del equipo, 19-11-2026). "mostrarCodigo" solo tiene sentido en la vista general (no
// filtrada a un único trabajo, donde repetirlo en cada fila sería ruido).
export function filaEvento(evento, { mostrarCodigo = false } = {}) {
  return el('li', { class: 'tarjeta' },
    el('p', {},
      el('strong', {}, TEXTO_EVENTO[evento.tipo] || evento.tipo),
      ' · ', formatoFechaHora(evento.fecha),
      mostrarCodigo && evento.entidad?.tipo === 'trabajo' ? ` · ${evento.entidad.codigo}` : null,
      // "leida" solo viene en eventos de Novedades (punto 3 de la revisión del equipo, 20-11-2026,
      // segunda vuelta); en Bitácora/historial el campo no existe y este chip nunca aparece.
      evento.leida === false ? ' ' : null,
      evento.leida === false ? el('span', { class: 'chip chip-aviso' }, 'Nueva') : null,
    ),
    evento.usuario
      // Si no se puede resolver el nombre (por ejemplo, datos de demostración antiguos cuyo
      // usuario.id ya no existe tras reiniciar la base), un texto honesto: nunca "Alguien".
      ? el('p', { class: 'campo-ayuda' }, `${evento.usuario.nombre || 'Datos de demostración'} · ${ROL_TEXTO[evento.usuario.rol] || evento.usuario.rol}`)
      : el('p', { class: 'campo-ayuda' }, 'Sistema'),
    (() => {
      const detalle = detalleEvento(evento);
      return detalle ? el('p', { class: 'campo-ayuda' }, detalle) : null;
    })(),
  );
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

// Vocabulario propio de una VERSIÓN de diseño (diseno.estado / aprobacion_diseno.decision):
// PENDIENTE/APROBADO/RECHAZADO. Punto 4 de la revisión del equipo (20-11-2026): una versión
// rechazada mostraba el chip "Detenido" (vocabulario de trabajo.estado, prestado por error) y el
// texto crudo "Decisión: RECHAZADO"; cada estado necesita su propia etiqueta, nunca prestada de
// otro vocabulario ni el valor interno sin traducir.
export const TEXTO_ESTADO_DISENO = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobada',
  RECHAZADO: 'Rechazada',
};

const CLASE_ESTADO_DISENO = {
  PENDIENTE: 'chip-aviso',
  APROBADO: 'chip-ok',
  RECHAZADO: 'chip-error',
};

export function chipEstadoDiseno(estado) {
  return el('span', { class: `chip ${CLASE_ESTADO_DISENO[estado] || 'chip-neutro'}` }, TEXTO_ESTADO_DISENO[estado] || estado);
}

// Línea "quién decidió, cuándo y por qué" de una versión ya decidida (aprobada o rechazada);
// null mientras sigue pendiente (todavía no hay aprobador, fecha ni motivo que mostrar).
export function textoDecisionDiseno(d) {
  if (!d.decision) return null;
  const quien = d.aprobador ? `${d.aprobador}` : 'Datos de demostración';
  const base = `${TEXTO_ESTADO_DISENO[d.decision] || d.decision} por ${quien} el ${formatoFechaHora(d.decidido_en)}`;
  return d.motivo ? `${base}. Motivo: ${d.motivo}` : base;
}

// Quién tiene tomada una etapa de producción ahora mismo: antes era texto chico bajo el botón
// (punto B3 de la revisión del equipo, 19-11-2026); ahora es una etiqueta con ícono, junto al
// título de la etapa, igual de visible que el estado.
export function chipResponsable(nombre) {
  return el('span', { class: 'chip chip-responsable' }, el('span', { class: 'icono-responsable', 'aria-hidden': 'true' }), nombre);
}

// Un solo formato de fecha (sin hora) en toda la aplicación (punto 13 de la revisión del equipo,
// 19-11-2026): antes "Compromiso" se veía "28-11-2026" en las tarjetas (tarjetaTrabajo) pero
// "2026-11-28" en el detalle de un trabajo (el AAAA-MM-DD crudo que entrega la API, mostrado tal
// cual, sin pasar por este formateador).
export function formatoFecha(fecha) {
  const texto = String(fecha).slice(0, 10);
  const [anio, mes, dia] = texto.split('-');
  return `${dia}-${mes}-${anio}`;
}

// En lenguaje claro: qué etapa va ahora y cuál sigue (o que el trabajo ya terminó / aún no
// entra a producción). Compartido entre el detalle de un trabajo y "Mis solicitudes" (puntos 2 y
// 9 de la revisión del equipo, 19-11-2026).
export function textoEtapaActualSiguiente(trabajo) {
  if (trabajo.estado === 'TERMINADO') return 'Este trabajo ya terminó todas sus etapas de producción.';
  if (!['EN_PRODUCCION', 'DETENIDO'].includes(trabajo.estado)) return 'Todavía no entra a producción (está en diseño o esperando aprobación).';
  const actual = (trabajo.etapas || []).find((e) => e.estado === 'EN_CURSO');
  if (!actual) return 'Sin una etapa de producción vigente en este momento.';
  const siguiente = trabajo.etapas.find((e) => e.orden === actual.orden + 1);
  const detalleResponsable = actual.responsable ? `, la tiene ${actual.responsable}` : ', nadie la ha tomado todavía';
  return siguiente
    ? `Etapa actual: "${actual.nombre}"${detalleResponsable}. Sigue: "${siguiente.nombre}".`
    : `Etapa actual: "${actual.nombre}"${detalleResponsable}. Es la última etapa de este trabajo.`;
}

// Un solo formato de fecha y hora para toda la aplicación (punto 13 de la revisión del equipo,
// 19-11-2026; corregido el punto 6, 20-11-2026): "toLocaleString('es-CL', ...)" entregaba año a 2
// dígitos y "p. m." con espacio angosto ("19-11-26 10:41 p. m."), distinto del DD-MM-AAAA a 4
// dígitos de formatoFecha ("12-11-2026") — dos formatos distintos convivían en la misma pantalla.
// Se construye a mano, con la MISMA fecha de formatoFecha más HH:MM en 24 horas: un solo formato,
// sin depender de qué locale tenga configurado el navegador.
export function formatoFechaHora(fecha, vacio = '—') {
  if (!fecha) return vacio;
  const d = new Date(fecha);
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const fechaTexto = `${dosDigitos(d.getDate())}-${dosDigitos(d.getMonth() + 1)}-${d.getFullYear()}`;
  return `${fechaTexto} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

// Tarjeta única de trabajo, reutilizada por las cinco pantallas de perfil. Si "trabajo.etapas"
// viene incluido (punto 9 de la revisión del equipo, 19-11-2026: "Mis solicitudes" lo pide con
// "conEtapas=true"), se ve la línea de tiempo completa y el texto de etapa actual/siguiente, no
// solo el nombre plano de la etapa.
export function tarjetaTrabajo(trabajo, { accion, detalleExtra } = {}) {
  const encabezado = el('div', { class: 'tarjeta-trabajo-encabezado' },
    el('span', { class: 'codigo-trabajo' }, trabajo.codigo),
    chipEstado(trabajo.estado),
    trabajo.atrasado ? chipAtrasado() : null,
  );
  const tieneEtapas = Array.isArray(trabajo.etapas);
  const cuerpo = el('div', { class: 'tarjeta-trabajo-cuerpo' },
    el('p', { class: 'tarjeta-trabajo-descripcion' }, trabajo.descripcion),
    el('p', { class: 'tarjeta-trabajo-meta' }, `${trabajo.tipo} · ${trabajo.cantidad} unidades`),
    el('p', { class: 'tarjeta-trabajo-meta' }, `Compromiso: ${formatoFecha(trabajo.fecha_compromiso)}`),
    trabajo.atrasado ? el('p', { class: 'tarjeta-trabajo-meta' }, `Debía estar listo el ${formatoFecha(trabajo.fecha_compromiso)} y todavía no termina.`) : null,
    tieneEtapas ? el('p', { class: 'tarjeta-trabajo-meta' }, textoEtapaActualSiguiente(trabajo)) : (trabajo.etapa_actual ? el('p', { class: 'tarjeta-trabajo-meta' }, `Etapa actual: ${trabajo.etapa_actual}`) : null),
    tieneEtapas && trabajo.etapas.length ? listaEtapas(trabajo.etapas) : null,
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

// Mismo selector de orden en toda la app: Vendedor ("Mis solicitudes"), Diseño (bandeja),
// Producción (Aprobaciones) y Panel general (punto 3 de la revisión del equipo, 20-11-2026). Antes
// cada pantalla tenía su propio control (algunas ninguno) y Producción decía "Más urgentes
// primero" con una etiqueta distinta a las demás.
export const OPCIONES_ORDEN = [
  { valor: 'entrega_proxima', etiqueta: 'Entrega más próxima' },
  { valor: 'recientes', etiqueta: 'Más recientes' },
  { valor: 'antiguos', etiqueta: 'Más antiguos' },
];

// Texto de ayuda del selector de orden. Va SIEMPRE fuera de la fila de filtros (ver barraFiltros):
// metido dentro de su propio ".campo", hacía que ese campo tuviera una línea más que sus vecinos y
// "align-items: flex-end" los desalineaba (punto 2 de la revisión del equipo, 20-11-2026, segunda
// vuelta — DEF-48).
export const AYUDA_ORDEN = '"Entrega más próxima" ordena por la fecha de entrega comprometida; las otras dos, por fecha de creación.';

export function selectorOrden({ id = 'orden', valor = 'entrega_proxima', alCambiar }) {
  const select = el('select', { id },
    ...OPCIONES_ORDEN.map((o) => el('option', { value: o.valor, selected: o.valor === valor || undefined }, o.etiqueta)));
  select.addEventListener('change', () => alCambiar(select.value));
  return el('div', { class: 'campo' }, el('label', { for: id }, 'Ordenar por'), select);
}

// Barra de filtros ÚNICA y reutilizable (punto 2 de la revisión del equipo, 20-11-2026, segunda
// vuelta — DEF-48): antes cada pantalla armaba su propia fila de filtros a mano, y un campo con
// una línea de más (como el de orden, con su texto de ayuda) empujaba hacia abajo a sus vecinos,
// porque "align-items: flex-end" alinea por la base de la fila. Con esta barra, cada ".campo" que
// se le pase tiene siempre la misma altura (una etiqueta y un control, nunca una ayuda dentro), así
// que quedan alineados sin importar cuántos o cuáles se combinen; cualquier texto de ayuda va
// aparte, debajo de toda la fila.
export function barraFiltros(...campos) {
  return el('div', { class: 'filtros-lista' }, ...campos);
}

// Mismo criterio de orden para listas que ya se traen completas y se ordenan en el navegador
// (Panel general), en vez de pedírselo al servidor con "?orden=".
export function ordenarPorOpcion(lista, orden, { entrega, creacion }) {
  const copia = [...lista];
  if (orden === 'entrega_proxima') { copia.sort((a, b) => new Date(entrega(a)) - new Date(entrega(b))); return copia; }
  copia.sort((a, b) => new Date(creacion(a)) - new Date(creacion(b)));
  if (orden === 'recientes') copia.reverse();
  return copia;
}
