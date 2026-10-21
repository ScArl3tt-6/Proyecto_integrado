// Detalle de un trabajo: mismo contenido para quien lo vea (vendedor, diseño, producción o
// administración), con el alcance que ya decide el servidor (403 si el trabajo no corresponde).
import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, abrirDialogoMotivo, enlaceVolver } from '../ui.js';
import { chipEstado, chipAtrasado, listaEtapas, estadoCarga, estadoError } from '../componentes.js';
import { tienePermiso, INICIO_POR_ROL } from '../permisos.js';

const MOTIVOS_DETENER = [
  'Falta materia prima',
  'Falla de maquinaria',
  'Ausencia de personal del área',
  'A la espera de una instrucción del cliente interno',
];

function formatoFechaHora(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function renderDetalleTrabajo(main, sesion, codigo) {
  const contenedor = el('section', { class: 'contenedor' });
  main.appendChild(contenedor);
  cargar();

  async function cargar() {
    vaciar(contenedor);
    contenedor.appendChild(enlaceVolver(INICIO_POR_ROL[sesion.rol] || '#/'));
    contenedor.appendChild(el('h1', {}, codigo));
    contenedor.appendChild(estadoCarga(4));
    try {
      const trabajo = await api.get(`/trabajos/${codigo}`);
      vaciar(contenedor);
      contenedor.appendChild(enlaceVolver(INICIO_POR_ROL[sesion.rol] || '#/'));
      pintar(trabajo);
    } catch (err) {
      vaciar(contenedor);
      contenedor.appendChild(enlaceVolver(INICIO_POR_ROL[sesion.rol] || '#/'));
      contenedor.appendChild(el('h1', {}, codigo));
      if (err instanceof ApiError && err.status === 403) {
        contenedor.appendChild(aviso('error', 'No tienes permiso para ver este trabajo.'));
      } else if (err instanceof ApiError && err.status === 404) {
        contenedor.appendChild(aviso('error', 'No encontramos ese código de trabajo.'));
      } else {
        contenedor.appendChild(estadoError('No pudimos cargar el detalle. Revisa tu conexión e inténtalo otra vez.', cargar));
      }
    }
  }

  function pintar(trabajo) {
    const disenoRechazado = [...trabajo.disenos].reverse().find((d) => d.decision === 'RECHAZADO');

    contenedor.appendChild(
      el('div', { class: 'detalle-encabezado' },
        el('h1', {}, trabajo.codigo),
        chipEstado(trabajo.estado),
        trabajo.atrasado ? chipAtrasado() : null,
      ),
    );
    contenedor.appendChild(el('p', {}, trabajo.descripcion));
    contenedor.appendChild(el('p', { class: 'campo-ayuda' }, `${trabajo.tipo} · ${trabajo.cantidad} unidades · compromiso ${String(trabajo.fecha_compromiso || '').slice(0, 10)}`));

    if (disenoRechazado) {
      contenedor.appendChild(aviso('info', `Motivo del último rechazo: ${disenoRechazado.motivo}`));
    }

    if (tienePermiso(sesion.rol, 'TRABAJO_DETENER') && (trabajo.estado === 'EN_PRODUCCION' || trabajo.estado === 'DETENIDO')) {
      contenedor.appendChild(botonDetenerReanudar(trabajo));
    }

    contenedor.appendChild(el('h2', {}, 'Etapas'));
    contenedor.appendChild(listaEtapas(trabajo.etapas));

    if (trabajo.disenos.length) {
      contenedor.appendChild(el('h2', {}, 'Versiones de diseño'));
      contenedor.appendChild(el('ul', { class: 'lista-versiones' }, ...trabajo.disenos.map((d) => el('li', { class: 'tarjeta' },
        el('p', {}, el('strong', {}, `Versión ${d.version}`), ' · ', chipEstado(d.estado === 'APROBADO' ? 'TERMINADO' : d.estado === 'RECHAZADO' ? 'DETENIDO' : 'PENDIENTE_APROBACION')),
        el('p', { class: 'campo-ayuda' }, `Diseñador: ${d.disenador || '—'} · enviado ${formatoFechaHora(d.enviado_en)}`),
        d.decision ? el('p', { class: 'campo-ayuda' }, `Decisión: ${d.decision}${d.motivo ? ` — ${d.motivo}` : ''}`) : null,
      ))));
    }
  }

  function botonDetenerReanudar(trabajo) {
    if (trabajo.estado === 'EN_PRODUCCION') {
      const boton = el('button', { type: 'button', class: 'boton boton-peligro' }, 'Detener trabajo');
      boton.addEventListener('click', async () => {
        const motivo = await abrirDialogoMotivo({ titulo: `Detener ${trabajo.codigo}`, etiqueta: 'Motivo de la detención', sugerencias: MOTIVOS_DETENER, textoConfirmar: 'Detener' });
        if (!motivo) return;
        try {
          await api.post(`/trabajos/${trabajo.codigo}/detener`, { motivo });
          cargar();
        } catch {
          contenedor.prepend(aviso('error', 'No pudimos detener el trabajo. Inténtalo otra vez.'));
        }
      });
      return boton;
    }
    const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Reanudar trabajo');
    boton.addEventListener('click', async () => {
      const confirmado = await abrirDialogoConfirmacion({ titulo: `Reanudar ${trabajo.codigo}`, mensaje: '¿Reanudar este trabajo en producción?', textoConfirmar: 'Reanudar' });
      if (!confirmado) return;
      try {
        await api.post(`/trabajos/${trabajo.codigo}/reanudar`, {});
        cargar();
      } catch {
        contenedor.prepend(aviso('error', 'No pudimos reanudar el trabajo. Inténtalo otra vez.'));
      }
    });
    return boton;
  }
}
