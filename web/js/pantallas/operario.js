import { api } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError, chipAtrasado, chipResponsable, paginador } from '../componentes.js';

export function renderMisActividades(main, sesion, irA) {
  const contenedor = el('section', { class: 'contenedor' }, el('h1', {}, 'Mis actividades'));
  const listaNodo = el('div', { class: 'lista-trabajos' });
  const piePagina = el('div');
  contenedor.appendChild(listaNodo);
  contenedor.appendChild(piePagina);
  main.appendChild(contenedor);

  let pagina = 1;
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    vaciar(piePagina);
    listaNodo.appendChild(estadoCarga());
    try {
      const actividades = await api.get(`/trabajos/mis-actividades?pagina=${pagina}&limite=20`);
      vaciar(listaNodo);
      if (!actividades.length) {
        listaNodo.appendChild(estadoVacio(pagina === 1 ? 'No tienes actividades en curso en tu área por ahora.' : 'No hay más actividades.'));
      } else {
        for (const actividad of actividades) listaNodo.appendChild(tarjetaActividad(actividad, sesion));
      }
      piePagina.appendChild(paginador({ pagina, llena: actividades.length === 20, alCambiar: (p) => { pagina = p; cargar(); } }));
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar tus actividades. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function tarjetaActividad(actividad, sesion) {
    const materialesContenedor = el('div', { class: 'materiales-contenedor' });
    materialesContenedor.hidden = true;
    const botonMateriales = el('button', {
      type: 'button', class: 'boton boton-secundario', 'aria-expanded': 'false', 'aria-controls': `materiales-${actividad.codigo}`,
    }, 'Ver materiales y medidas');
    materialesContenedor.id = `materiales-${actividad.codigo}`;
    let cargados = false;
    botonMateriales.addEventListener('click', async () => {
      const abrir = materialesContenedor.hidden;
      materialesContenedor.hidden = !abrir;
      botonMateriales.setAttribute('aria-expanded', String(abrir));
      botonMateriales.textContent = abrir ? 'Ocultar materiales y medidas' : 'Ver materiales y medidas';
      if (abrir && !cargados) {
        cargados = true;
        vaciar(materialesContenedor);
        materialesContenedor.appendChild(el('p', { class: 'campo-ayuda' }, 'Cargando…'));
        try {
          const materiales = await api.get(`/trabajos/${actividad.codigo}/materiales`);
          vaciar(materialesContenedor);
          if (!materiales.length) materialesContenedor.appendChild(el('p', { class: 'campo-ayuda' }, 'Este trabajo no tiene materiales registrados.'));
          else materialesContenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...materiales.map((m) => el('li', {}, `${m.nombre}: ${m.cantidad} ${m.unidad}${m.medida ? ` (${m.medida})` : ''}`))));
        } catch {
          vaciar(materialesContenedor);
          materialesContenedor.appendChild(el('p', { class: 'campo-error' }, 'No pudimos cargar los materiales.'));
          cargados = false;
        }
      }
    });

    // Tres estados posibles: nadie la ha tomado (botón "Comenzar etapa"), la tomé yo (botones
    // "Completar etapa" y "Liberar etapa"), o la tomó otra persona del área (solo lectura, con su
    // nombre destacado junto al título de la etapa, no como texto chico — punto B3).
    let accion;
    if (!actividad.id_responsable) {
      const botonComenzar = el('button', { type: 'button', class: 'boton boton-primario boton-grande boton-ancho-completo' }, 'Comenzar etapa');
      botonComenzar.addEventListener('click', async () => {
        botonComenzar.disabled = true;
        botonComenzar.textContent = 'Comenzando…';
        try {
          await api.post(`/trabajos/${actividad.codigo}/etapas/${actividad.orden}/comenzar`, {});
          cargar();
        } catch (err) {
          listaNodo.prepend(aviso('error', err?.cuerpo?.error || 'No pudimos tomar la etapa. Puede que alguien más ya la haya tomado.'));
          cargar();
        }
      });
      accion = botonComenzar;
    } else if (actividad.id_responsable === sesion.id) {
      const botonCompletar = el('button', { type: 'button', class: 'boton boton-primario boton-grande boton-ancho-completo' }, 'Completar etapa');
      botonCompletar.addEventListener('click', async () => {
        const mensaje = actividad.siguiente_actividad
          ? `¿Terminaste "${actividad.etapa_actual}"? Sigue: "${actividad.siguiente_actividad}".`
          : `¿Terminaste "${actividad.etapa_actual}"? Con esto el trabajo queda Terminado.`;
        const confirmado = await abrirDialogoConfirmacion({ titulo: 'Completar etapa', mensaje, textoConfirmar: 'Completar' });
        if (!confirmado) return;
        try {
          await api.post(`/trabajos/${actividad.codigo}/etapas/${actividad.orden}/completar`, {});
          cargar();
        } catch {
          listaNodo.prepend(aviso('error', 'No pudimos completar la etapa. Inténtalo otra vez.'));
        }
      });
      const botonLiberar = el('button', { type: 'button', class: 'boton boton-secundario boton-ancho-completo' }, 'Liberar etapa');
      botonLiberar.addEventListener('click', async () => {
        const confirmado = await abrirDialogoConfirmacion({
          titulo: 'Liberar etapa',
          mensaje: `¿Dejar "${actividad.etapa_actual}" disponible de nuevo? Cualquier persona del área (incluida tú) podrá tomarla desde cero.`,
          textoConfirmar: 'Liberar',
        });
        if (!confirmado) return;
        try {
          await api.post(`/trabajos/${actividad.codigo}/etapas/${actividad.orden}/liberar`, {});
          cargar();
        } catch {
          listaNodo.prepend(aviso('error', 'No pudimos liberar la etapa. Inténtalo otra vez.'));
        }
      });
      accion = el('div', { class: 'acciones-decision' }, botonCompletar, botonLiberar);
    } else {
      accion = null;
    }

    return el('article', { class: 'tarjeta tarjeta-trabajo tarjeta-actividad' },
      el('div', { class: 'tarjeta-trabajo-encabezado' },
        el('span', { class: 'codigo-trabajo' }, actividad.codigo),
        actividad.atrasado ? chipAtrasado() : null,
      ),
      el('p', { class: 'tarjeta-trabajo-descripcion' }, actividad.descripcion),
      el('p', { class: 'tarjeta-trabajo-meta' }, `${actividad.tipo} · ${actividad.cantidad} unidades`),
      el('div', { class: 'etapa-destacada' },
        el('span', { class: 'etapa-destacada-etiqueta' }, 'Etapa actual'),
        el('div', { class: 'etapa-destacada-fila' },
          el('span', { class: 'etapa-destacada-nombre' }, actividad.etapa_actual),
          actividad.id_responsable && actividad.id_responsable !== sesion.id ? chipResponsable(actividad.responsable) : null,
        ),
      ),
      el('p', { class: 'tarjeta-trabajo-meta' }, actividad.siguiente_actividad ? `Sigue: ${actividad.siguiente_actividad}` : 'Es la última etapa de este trabajo.'),
      botonMateriales,
      materialesContenedor,
      accion,
    );
  }
}
