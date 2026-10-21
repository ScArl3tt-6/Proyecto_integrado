import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, abrirDialogoMotivo, enlaceVolver } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError } from '../componentes.js';

const MOTIVOS_RECHAZO = [
  'El diseño no cumple las medidas solicitadas',
  'Los colores no coinciden con lo pedido',
  'La resolución del archivo es insuficiente',
  'Falta información técnica para producir',
];

export function renderAprobaciones(main, sesion, irA) {
  const contenedor = el('section', { class: 'contenedor' }, el('h1', {}, 'Aprobaciones'));
  const listaNodo = el('div', { class: 'lista-trabajos' });
  contenedor.appendChild(listaNodo);
  main.appendChild(contenedor);
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      const pendientes = await api.get('/disenos/pendientes');
      vaciar(listaNodo);
      if (!pendientes.length) {
        listaNodo.appendChild(estadoVacio('No hay propuestas esperando decisión.'));
        return;
      }
      for (const p of pendientes) {
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

    if (propuesta.archivos?.length) {
      contenedor.appendChild(el('h2', {}, 'Archivos'));
      contenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...propuesta.archivos.map((a) => el('li', {}, `${a.nombre} · ${a.tipoMime} · ${Math.round(a.tamanoBytes / 1024)} KB`))));
    }
    const especificaciones = propuesta.especificaciones || {};
    if (Object.keys(especificaciones).length) {
      contenedor.appendChild(el('h2', {}, 'Especificaciones'));
      contenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...Object.entries(especificaciones).map(([clave, valor]) => el('li', {}, `${clave}: ${Array.isArray(valor) ? valor.join(', ') : valor}`))));
    }
    if (propuesta.comentarios?.length) {
      contenedor.appendChild(el('h2', {}, 'Comentarios'));
      contenedor.appendChild(el('ul', { class: 'lista-reglas' }, ...propuesta.comentarios.map((c) => el('li', {}, c.texto))));
    }

    if (diseno.estado !== 'PENDIENTE') {
      contenedor.appendChild(aviso('info', `Esta versión ya tiene una decisión registrada (${diseno.estado}).`));
      return;
    }

    const botonAprobar = el('button', { type: 'button', class: 'boton boton-primario' }, 'Aprobar');
    botonAprobar.addEventListener('click', async () => {
      const confirmado = await abrirDialogoConfirmacion({ titulo: 'Aprobar propuesta', mensaje: `¿Aprobar la versión ${diseno.version} de ${diseno.codigo}?`, textoConfirmar: 'Aprobar' });
      if (!confirmado) return;
      await decidir('APROBADO');
    });

    const botonRechazar = el('button', { type: 'button', class: 'boton boton-peligro' }, 'Rechazar');
    botonRechazar.addEventListener('click', async () => {
      const motivo = await abrirDialogoMotivo({ titulo: 'Rechazar propuesta', etiqueta: 'Motivo del rechazo', sugerencias: MOTIVOS_RECHAZO, textoConfirmar: 'Rechazar' });
      if (!motivo) return;
      await decidir('RECHAZADO', motivo);
    });

    contenedor.appendChild(el('div', { class: 'acciones-decision' }, botonAprobar, botonRechazar));

    async function decidir(decision, motivo) {
      try {
        await api.post(`/disenos/${idDiseno}/decision`, { decision, motivo });
        irA('#/aprobaciones');
      } catch (err) {
        const mensaje = err instanceof ApiError && err.status === 409 ? 'Esta versión ya tiene una decisión registrada.' : 'No pudimos registrar la decisión. Inténtalo otra vez.';
        contenedor.prepend(aviso('error', mensaje));
      }
    }
  }
}
