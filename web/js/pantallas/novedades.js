// Novedades para Vendedor y Diseño (punto 5 de la revisión del equipo, 19-11-2026): aviso visible
// (contador + lista) cuando una solicitud propia se rechaza, se aprueba, cambia de etapa o
// termina. Reutiliza eventos que ya existen en la bitácora; nada de correo ni servicios nuevos.
import { api } from '../api.js';
import { el, vaciar } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError, filaEvento } from '../componentes.js';

export function renderNovedades(main) {
  const contenedor = el('section', { class: 'contenedor' }, el('h1', {}, 'Novedades'));
  const resumen = el('p', { class: 'campo-ayuda' }, '');
  const listaNodo = el('div');
  contenedor.appendChild(resumen);
  contenedor.appendChild(listaNodo);
  main.appendChild(contenedor);
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      const { noVistas, eventos } = await api.get('/auditoria/novedades');
      vaciar(listaNodo);
      resumen.textContent = noVistas > 0
        ? `${noVistas} novedad${noVistas === 1 ? '' : 'es'} nueva${noVistas === 1 ? '' : 's'} desde tu última visita.`
        : 'No tienes novedades nuevas desde tu última visita.';
      if (!eventos.length) {
        listaNodo.appendChild(estadoVacio('Todavía no hay novedades para tus trabajos.'));
      } else {
        listaNodo.appendChild(el('ol', { class: 'lista-bitacora' }, ...eventos.map((e) => filaEvento(e, { mostrarCodigo: true }))));
      }
      // Se marcan como vistas al abrir esta pantalla (no antes): así el contador del menú sigue
      // avisando hasta que la persona realmente las revise.
      api.post('/auditoria/novedades/vistas', {}).catch(() => { /* no es crítico: se reintenta en la próxima visita */ });
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar las novedades. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }
}
