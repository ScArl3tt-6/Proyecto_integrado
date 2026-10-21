import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, enlaceVolver } from '../ui.js';
import { tarjetaTrabajo, estadoVacio, estadoCarga, estadoError } from '../componentes.js';

const CABECERAS_FIRMA = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
};
const TAMANO_MAXIMO = 15 * 1024 * 1024;

export function renderBandejaDiseno(main, sesion, irA) {
  const contenedor = el('section', { class: 'contenedor' }, el('h1', {}, 'Bandeja de diseño'));
  const listaNodo = el('div', { class: 'lista-trabajos' });
  contenedor.appendChild(listaNodo);
  main.appendChild(contenedor);
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      const trabajos = await api.get('/trabajos?limite=50');
      const porTomar = trabajos.filter((t) => t.estado === 'SOLICITADO');
      const enCurso = trabajos.filter((t) => t.estado === 'EN_DISENO');
      const motivos = await motivosDeRechazo(enCurso);

      vaciar(listaNodo);
      listaNodo.appendChild(el('h2', {}, 'Por tomar'));
      if (!porTomar.length) listaNodo.appendChild(estadoVacio('No hay solicitudes nuevas por tomar.'));
      for (const trabajo of porTomar) listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: botonTomar(trabajo) }));

      listaNodo.appendChild(el('h2', {}, 'En diseño'));
      if (!enCurso.length) listaNodo.appendChild(estadoVacio('No tienes trabajos en diseño en este momento.'));
      for (const trabajo of enCurso) {
        const motivo = motivos[trabajo.codigo];
        const extra = motivo ? aviso('info', `Motivo del rechazo: ${motivo}`) : null;
        const enviar = el('a', { class: 'boton boton-primario', href: `#/disenos/${trabajo.codigo}/enviar` }, 'Enviar propuesta');
        listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: enviar, detalleExtra: extra }));
      }
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar la bandeja. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function botonTomar(trabajo) {
    const boton = el('button', { type: 'button', class: 'boton boton-primario' }, 'Tomar solicitud');
    boton.addEventListener('click', async () => {
      const confirmado = await abrirDialogoConfirmacion({
        titulo: 'Tomar solicitud', mensaje: `¿Tomar ${trabajo.codigo} para diseño?`, textoConfirmar: 'Tomar',
      });
      if (!confirmado) return;
      try {
        await api.post(`/trabajos/${trabajo.codigo}/tomar-diseno`, {});
        cargar();
      } catch {
        listaNodo.prepend(aviso('error', 'No pudimos tomar la solicitud. Inténtalo otra vez.'));
      }
    });
    return boton;
  }

  // Trae el motivo del último rechazo solo para los trabajos que ya están en diseño (bandeja acotada)
  async function motivosDeRechazo(trabajosEnDiseno) {
    const entradas = await Promise.all(trabajosEnDiseno.map(async (t) => {
      try {
        const detalle = await api.get(`/trabajos/${t.codigo}`);
        const rechazo = [...detalle.disenos].reverse().find((d) => d.decision === 'RECHAZADO');
        return [t.codigo, rechazo?.motivo || null];
      } catch {
        return [t.codigo, null];
      }
    }));
    return Object.fromEntries(entradas);
  }
}

async function primerosBytesBase64(archivo, n = 16) {
  const buffer = await archivo.slice(0, n).arrayBuffer();
  let binario = '';
  new Uint8Array(buffer).forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario);
}

function archivoValido(archivo) {
  if (archivo.type === 'image/svg+xml') return 'No se aceptan archivos SVG.';
  if (!CABECERAS_FIRMA[archivo.type]) return 'Solo se aceptan archivos PDF, PNG o JPG.';
  if (archivo.size > TAMANO_MAXIMO) return 'El archivo supera los 15 MB permitidos.';
  return null;
}

export function renderEnviarPropuesta(main, sesion, codigo, irA) {
  const contenedorAviso = el('div');
  const campoArchivos = el('input', { id: 'archivos', type: 'file', accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg', multiple: true, required: true });
  const campoTecnica = el('input', { id: 'tecnica', type: 'text', maxlength: 60 });
  const campoUbicacion = el('input', { id: 'ubicacion', type: 'text', maxlength: 60 });
  const campoMedidas = el('input', { id: 'medidas', type: 'text', maxlength: 60 });
  const campoColores = el('input', { id: 'colores', type: 'text', maxlength: 200, placeholder: 'Separados por coma' });
  const campoComentario = el('input', { id: 'comentario', type: 'text', maxlength: 500 });
  const boton = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Enviar propuesta');

  const form = el('form', { novalidate: true },
    contenedorAviso,
    el('div', { class: 'campo' }, el('label', { for: 'archivos' }, 'Archivos (PDF, PNG o JPG, hasta 15 MB)'), campoArchivos),
    el('div', { class: 'campo' }, el('label', { for: 'tecnica' }, 'Técnica'), campoTecnica),
    el('div', { class: 'campo' }, el('label', { for: 'ubicacion' }, 'Ubicación'), campoUbicacion),
    el('div', { class: 'campo' }, el('label', { for: 'medidas' }, 'Medidas'), campoMedidas),
    el('div', { class: 'campo' }, el('label', { for: 'colores' }, 'Colores'), campoColores),
    el('div', { class: 'campo' }, el('label', { for: 'comentario' }, 'Comentario (opcional)'), campoComentario),
    boton,
  );

  main.appendChild(
    el('section', { class: 'contenedor' },
      enlaceVolver('#/bandeja-diseno'),
      el('h1', {}, `Enviar propuesta — ${codigo}`),
      form,
    ),
  );

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAviso);
    const archivos = [...campoArchivos.files];
    if (!archivos.length) return mostrar('error', 'Adjunta al menos un archivo.');
    for (const archivo of archivos) {
      const error = archivoValido(archivo);
      if (error) return mostrar('error', `"${archivo.name}": ${error}`);
    }

    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const archivosCodificados = await Promise.all(archivos.map(async (archivo) => ({
        nombre: archivo.name, tipoMime: archivo.type, tamanoBytes: archivo.size, cabeceraBase64: await primerosBytesBase64(archivo),
      })));
      const especificaciones = {};
      if (campoTecnica.value.trim()) especificaciones.tecnica = campoTecnica.value.trim();
      if (campoUbicacion.value.trim()) especificaciones.ubicacion = campoUbicacion.value.trim();
      if (campoMedidas.value.trim()) especificaciones.medidas = campoMedidas.value.trim();
      if (campoColores.value.trim()) especificaciones.colores = campoColores.value.split(',').map((c) => c.trim()).filter(Boolean);

      const resultado = await api.post(`/disenos/trabajos/${codigo}`, {
        archivos: archivosCodificados,
        especificaciones: Object.keys(especificaciones).length ? especificaciones : undefined,
        comentario: campoComentario.value.trim() || undefined,
      });
      vaciar(contenedorAviso);
      contenedorAviso.appendChild(aviso('exito', `Versión ${resultado.version} enviada.`));
      setTimeout(() => irA('#/bandeja-diseno'), 1200);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) mostrar('error', err.cuerpo?.error || 'Revisa los archivos y los datos ingresados.');
      else mostrar('error', 'No pudimos enviar la propuesta. Revisa tu conexión e inténtalo otra vez.');
      boton.disabled = false;
      boton.textContent = 'Enviar propuesta';
    }
  });

  function mostrar(tipo, mensaje) {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso(tipo, mensaje));
  }
}
