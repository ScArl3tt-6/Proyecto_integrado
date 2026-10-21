import { api } from '../api.js';
import { el, vaciar } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError, chipEstado } from '../componentes.js';

const GRUPOS = [
  { clave: 'ATRASADO', titulo: 'Atrasados' },
  { clave: 'EN_CURSO', titulo: 'En curso' },
  { clave: 'DETENIDO', titulo: 'Detenidos' },
  { clave: 'TERMINADO', titulo: 'Terminados' },
];

export function renderPanel(main, sesion, irA) {
  const contenedor = el('section', { class: 'contenedor' }, el('h1', {}, 'Panel general'));
  const tilesNodo = el('div', { class: 'panel-tiles' });
  const filtroArea = el('select', { id: 'filtro-area' }, el('option', { value: '' }, 'Todas las áreas'));
  const listaNodo = el('div', { class: 'lista-trabajos' });
  contenedor.appendChild(tilesNodo);
  contenedor.appendChild(el('div', { class: 'campo' }, el('label', { for: 'filtro-area' }, 'Filtrar por área'), filtroArea));
  contenedor.appendChild(listaNodo);
  main.appendChild(contenedor);

  let panel = null;
  let grupoActivo = 'ATRASADO';
  filtroArea.addEventListener('change', pintarLista);
  cargar();

  async function cargar() {
    vaciar(tilesNodo);
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      panel = await api.get('/panel');
      if (!panel.totales.ATRASADO) grupoActivo = 'EN_CURSO';
      pintarTiles();
      poblarAreas();
      pintarLista();
    } catch {
      vaciar(tilesNodo);
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar el panel. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function pintarTiles() {
    vaciar(tilesNodo);
    for (const grupo of GRUPOS) {
      const boton = el('button', { type: 'button', class: `panel-tile${grupoActivo === grupo.clave ? ' panel-tile-activo' : ''}` },
        el('span', { class: 'panel-tile-total' }, String(panel.totales[grupo.clave] || 0)),
        el('span', { class: 'panel-tile-titulo' }, grupo.titulo),
      );
      boton.addEventListener('click', () => { grupoActivo = grupo.clave; pintarTiles(); pintarLista(); });
      tilesNodo.appendChild(boton);
    }
  }

  function poblarAreas() {
    const valorPrevio = filtroArea.value;
    vaciar(filtroArea);
    filtroArea.appendChild(el('option', { value: '' }, 'Todas las áreas'));
    const areas = [...new Set(Object.values(panel.grupos).flat().map((t) => t.area_responsable).filter(Boolean))].sort();
    for (const area of areas) filtroArea.appendChild(el('option', { value: area, selected: area === valorPrevio || undefined }, area));
  }

  function pintarLista() {
    vaciar(listaNodo);
    let filas = panel.grupos[grupoActivo] || [];
    if (filtroArea.value) filas = filas.filter((t) => t.area_responsable === filtroArea.value);
    if (!filas.length) {
      listaNodo.appendChild(estadoVacio('No hay trabajos en este grupo.'));
      return;
    }
    listaNodo.appendChild(el('table', { class: 'tabla-simple' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Código'), el('th', {}, 'Tipo'), el('th', {}, 'Estado'), el('th', {}, 'Área'), el('th', {}, 'Días en etapa'), el('th', {}))),
      el('tbody', {}, ...filas.map((t) => el('tr', {},
        el('td', {}, el('span', { class: 'codigo-trabajo' }, t.codigo)),
        el('td', {}, t.tipo),
        el('td', {}, chipEstado(t.estado)),
        el('td', {}, t.area_responsable || '—'),
        el('td', {}, String(t.dias_en_etapa ?? '—')),
        el('td', {}, el('a', { class: 'boton boton-secundario', href: `#/trabajos/${t.codigo}` }, 'Ver detalle')),
      ))),
    ));
  }
}
