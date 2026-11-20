import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, abrirDialogoMotivo, enlaceVolver, conEspera } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError, paginador, TEXTO_ESPECIFICACION, TEXTO_ESTADO_DISENO, selectorOrden, barraFiltros, AYUDA_ORDEN } from '../componentes.js';

const MOTIVOS_RECHAZO = [
  'El diseño no cumple las medidas solicitadas',
  'Los colores no coinciden con lo pedido',
  'La resolución del archivo es insuficiente',
  'Falta información técnica para producir',
];

// Tarjeta de un archivo real de la propuesta: datos, botón para abrirlo completo y una vista
// previa en la misma pantalla (imagen o PDF), para decidir sin tener que adivinar qué se adjuntó.
function tarjetaArchivo(idDiseno, archivo) {
  const url = `/api/disenos/${idDiseno}/archivos/${archivo.archivoId}`;
  const tamanoKb = Math.round(archivo.tamanoBytes / 1024);
  const boton = el('a', { class: 'boton boton-secundario', href: url, target: '_blank', rel: 'noopener' }, '📄 Ver archivo completo');

  let previa = null;
  if (archivo.tipoMime === 'image/png' || archivo.tipoMime === 'image/jpeg') {
    previa = el('img', { class: 'vista-previa-archivo vista-previa-imagen', src: url, alt: `Vista previa de ${archivo.nombre}` });
  } else if (archivo.tipoMime === 'application/pdf') {
    previa = el('iframe', { class: 'vista-previa-archivo vista-previa-pdf', src: url, title: `Vista previa de ${archivo.nombre}` });
  }

  return el('article', { class: 'tarjeta-archivo' },
    el('div', { class: 'tarjeta-archivo-datos' },
      el('span', { class: 'tarjeta-archivo-nombre' }, archivo.nombre),
      el('span', { class: 'tarjeta-archivo-meta' }, `${archivo.tipoMime} · ${tamanoKb} KB`),
      boton,
    ),
    previa,
  );
}

export function renderAprobaciones(main, sesion, irA) {
  const campoBusqueda = el('input', { id: 'buscar-aprobaciones', type: 'text', placeholder: 'Ej.: KT-2026-0005 o "poleras"' });
  let orden = 'entrega_proxima';
  const contador = el('p', { class: 'campo-ayuda' }, '');

  const contenedor = el('section', { class: 'contenedor' },
    el('h1', {}, 'Aprobaciones'),
    barraFiltros(
      el('div', { class: 'campo' }, el('label', { for: 'buscar-aprobaciones' }, 'Buscar por código o descripción'), campoBusqueda),
      selectorOrden({ id: 'orden-aprobaciones', valor: orden, alCambiar: (v) => { orden = v; pagina = 1; cargar(); } }),
    ),
    el('p', { class: 'campo-ayuda' }, AYUDA_ORDEN),
    contador,
  );
  const listaNodo = el('div', { class: 'lista-trabajos' });
  const piePagina = el('div');
  contenedor.appendChild(listaNodo);
  contenedor.appendChild(piePagina);
  main.appendChild(contenedor);

  let pagina = 1;
  campoBusqueda.addEventListener('input', conEspera(() => { pagina = 1; cargar(); }));
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    vaciar(piePagina);
    vaciar(contador);
    listaNodo.appendChild(estadoCarga());
    try {
      const busqueda = campoBusqueda.value.trim() ? `&busqueda=${encodeURIComponent(campoBusqueda.value.trim())}` : '';
      const { total, items } = await api.get(`/disenos/pendientes?pagina=${pagina}&limite=20&orden=${orden}${busqueda}`);
      vaciar(listaNodo);
      contador.textContent = total === 0 ? '' : `${total} propuesta${total === 1 ? '' : 's'} pendiente${total === 1 ? '' : 's'} de decisión`;
      if (!items.length) {
        listaNodo.appendChild(estadoVacio(campoBusqueda.value.trim()
          ? 'No hay propuestas pendientes que coincidan con la búsqueda.'
          : 'No hay propuestas esperando decisión.'));
        return;
      }
      for (const p of items) {
        const boton = el('a', { class: 'boton boton-primario', href: `#/disenos/${p.idDiseno}` }, 'Ver y decidir');
        listaNodo.appendChild(el('article', { class: 'tarjeta tarjeta-trabajo' },
          el('div', { class: 'tarjeta-trabajo-encabezado' }, el('span', { class: 'codigo-trabajo' }, p.codigo), el('span', { class: 'chip chip-aviso' }, `Versión ${p.version}`)),
          el('div', { class: 'tarjeta-trabajo-cuerpo' },
            el('p', { class: 'tarjeta-trabajo-descripcion' }, p.descripcion),
            el('p', { class: 'tarjeta-trabajo-meta' }, `${p.tipo} · ${p.cantidad} unidades · diseñó ${p.disenador}`),
          ),
          el('div', { class: 'tarjeta-trabajo-accion' }, boton),
        ));
      }
      piePagina.appendChild(paginador({ pagina, llena: pagina * 20 < total, alCambiar: (p) => { pagina = p; cargar(); } }));
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar las aprobaciones. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }
}

export function renderDecidirDiseno(main, sesion, idDiseno, irA) {
  const contenedor = el('section', { class: 'contenedor' }, enlaceVolver('#/aprobaciones'), el('h1', {}, 'Decidir propuesta'));
  main.appendChild(contenedor);
  cargar();

  async function cargar() {
    vaciar(contenedor);
    contenedor.appendChild(enlaceVolver('#/aprobaciones'));
    contenedor.appendChild(el('h1', {}, 'Decidir propuesta'));
    contenedor.appendChild(estadoCarga(4));
    try {
      const diseno = await api.get(`/disenos/${idDiseno}`);
      vaciar(contenedor);
      contenedor.appendChild(enlaceVolver('#/aprobaciones'));
      pintar(diseno);
    } catch {
      vaciar(contenedor);
      contenedor.appendChild(enlaceVolver('#/aprobaciones'));
      contenedor.appendChild(el('h1', {}, 'Decidir propuesta'));
      contenedor.appendChild(estadoError('No pudimos cargar la propuesta. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function pintar(diseno) {
    const propuesta = diseno.propuesta || {};
    contenedor.appendChild(el('h1', {}, `${diseno.codigo} — versión ${diseno.version}`));
    // Punto 4 de la revisión del equipo (19-11-2026): trazabilidad completa antes de decidir, no
    // solo después — a quién corresponde esta propuesta y quién la envió.
    contenedor.appendChild(el('p', { class: 'campo-ayuda' },
      `Solicitó: ${diseno.vendedor} (Vendedor) · Propuesta enviada por: ${diseno.disenador} (Diseño)`));

    if (propuesta.archivos?.length) {
      contenedor.appendChild(el('h2', {}, 'Archivos'));
      for (const a of propuesta.archivos) contenedor.appendChild(tarjetaArchivo(diseno.idDiseno, a));
    }
    const especificaciones = propuesta.especificaciones || {};
    if (Object.keys(especificaciones).length) {
      contenedor.appendChild(el('h2', {}, 'Especificaciones'));
      contenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...Object.entries(especificaciones).map(([clave, valor]) => el('li', {}, `${TEXTO_ESPECIFICACION[clave] || clave}: ${Array.isArray(valor) ? valor.join(', ') : valor}`))));
    }
    if (propuesta.comentarios?.length) {
      contenedor.appendChild(el('h2', {}, 'Comentarios'));
      contenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...propuesta.comentarios.map((c) => el('li', {}, c.texto))));
    }

    if (diseno.estado !== 'PENDIENTE') {
      contenedor.appendChild(aviso('info', `Esta versión ya tiene una decisión registrada (${TEXTO_ESTADO_DISENO[diseno.estado] || diseno.estado}).`));
      return;
    }

    const botonAprobar = el('button', { type: 'button', class: 'boton boton-primario' }, 'Aprobar');
    botonAprobar.addEventListener('click', async () => {
      const mensaje = diseno.primera_etapa
        ? `¿Aprobar la versión ${diseno.version} de ${diseno.codigo}? Pasa a producción: empieza la etapa "${diseno.primera_etapa}" (área ${diseno.primera_etapa_area}), visible para esa área en "Mis actividades".`
        : `¿Aprobar la versión ${diseno.version} de ${diseno.codigo}? Pasa a producción.`;
      const confirmado = await abrirDialogoConfirmacion({ titulo: 'Aprobar propuesta', mensaje, textoConfirmar: 'Aprobar' });
      if (!confirmado) return;
      await decidir('APROBADO');
    });

    const botonRechazar = el('button', { type: 'button', class: 'boton boton-peligro' }, 'Rechazar');
    botonRechazar.addEventListener('click', async () => {
      const motivo = await abrirDialogoMotivo({
        titulo: 'Rechazar propuesta',
        etiqueta: 'Motivo del rechazo',
        sugerencias: MOTIVOS_RECHAZO,
        textoConfirmar: 'Rechazar',
      });
      if (!motivo) return;
      // Punto 5 de la revisión del equipo (20-11-2026): el mensaje rechaza la PROPUESTA (una
      // versión), no a la persona que la envió — antes decía "Se rechazará a ${disenador}", como
      // si el rechazo fuera contra ella en vez de contra el diseño que mandó.
      const confirmado = await abrirDialogoConfirmacion({
        titulo: 'Confirmar rechazo',
        mensaje: `Se rechazará la versión ${diseno.version} de ${diseno.codigo}, enviada por ${diseno.disenador}; el trabajo vuelve a "En diseño" para que ${diseno.disenador} pueda retomarlo con una nueva versión. Motivo: "${motivo}".`,
        textoConfirmar: 'Rechazar',
        peligro: true,
      });
      if (!confirmado) return;
      await decidir('RECHAZADO', motivo);
    });

    contenedor.appendChild(el('div', { class: 'acciones-decision' }, botonAprobar, botonRechazar));

    async function decidir(decision, motivo) {
      try {
        await api.post(`/disenos/${idDiseno}/decision`, { decision, motivo });
        // Al detalle del trabajo (no de vuelta a la lista): ahí se ve de inmediato la etapa actual
        // en lenguaje claro y el historial con la decisión recién tomada (punto 2 + punto 4).
        irA(`#/trabajos/${diseno.codigo}`);
      } catch (err) {
        const mensaje = err instanceof ApiError && err.status === 409 ? 'Esta versión ya tiene una decisión registrada.' : 'No pudimos registrar la decisión. Inténtalo otra vez.';
        contenedor.prepend(aviso('error', mensaje));
      }
    }
  }
}
