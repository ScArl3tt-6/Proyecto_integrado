import { el } from '../ui.js';

export function renderProhibido(main) {
  main.appendChild(
    el('section', { class: 'contenedor estado-vacio' },
      el('h1', {}, 'No tienes permiso'),
      el('p', {}, 'No tienes permiso para esta acción.'),
      el('a', { class: 'boton boton-secundario', href: '#/' }, 'Volver al inicio'),
    ),
  );
}

export function renderNoEncontrado(main) {
  main.appendChild(
    el('section', { class: 'contenedor estado-vacio' },
      el('h1', {}, 'Página no encontrada'),
      el('p', {}, 'Esa dirección no existe o cambió.'),
      el('a', { class: 'boton boton-secundario', href: '#/' }, 'Volver al inicio'),
    ),
  );
}
