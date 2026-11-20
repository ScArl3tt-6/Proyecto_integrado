import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, enlaceVolver, etiquetaCampo, describirErrorApi } from '../ui.js';
import { tarjetaTrabajo, estadoVacio, estadoCarga, estadoError, selectorOrden, ordenarPorOpcion, barraFiltros, AYUDA_ORDEN } from '../componentes.js';

const CAMPOS_PROPUESTA = { archivos: 'Archivos', 'archivos.0.nombre': 'Archivos', 'archivos.0.contenidoBase64': 'Archivos', comentario: 'Comentario' };

const CABECERAS_FIRMA = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
};
const TAMANO_MAXIMO = 15 * 1024 * 1024;

// Punto 2 de la revisión del equipo (20-11-2026, segunda vuelta): "Todos" muestra las cuatro
// secciones naturales de la bandeja; los otros cinco acotan a una sola. "Rechazados" es un recorte
// de "En diseño" (los que además tienen un rechazo reciente por corregir), no una sección aparte.
const FILTROS = [
  { clave: 'TODOS', etiqueta: 'Todos' },
  { clave: 'POR_TOMAR', etiqueta: 'Por tomar' },
  { clave: 'EN_DISENO', etiqueta: 'En diseño' },
  { clave: 'EN_APROBACION', etiqueta: 'Esperando aprobación' },
  { clave: 'RECHAZADOS', etiqueta: 'Rechazados' },
  { clave: 'APROBADOS', etiqueta: 'Aprobados' },
];

export function renderBandejaDiseno(main, sesion, irA) {
  let filtroActivo = 'TODOS';
  let orden = 'entrega_proxima';
  let datos = null;

  const filaFiltros = el('div', { class: 'filtros-lista', role: 'group', 'aria-label': 'Filtrar bandeja de diseño' });
  const filaOrden = barraFiltros(selectorOrden({ id: 'orden-bandeja-diseno', valor: orden, alCambiar: (v) => { orden = v; pintarLista(); } }));
  const listaNodo = el('div', { class: 'lista-trabajos' });
  const contenedor = el('section', { class: 'contenedor' },
    el('h1', {}, 'Bandeja de diseño'), filaFiltros, filaOrden,
    el('p', { class: 'campo-ayuda' }, AYUDA_ORDEN),
    listaNodo,
  );
  main.appendChild(contenedor);

  pintarFiltros();
  cargar();

  function pintarFiltros() {
    vaciar(filaFiltros);
    for (const f of FILTROS) {
      const activo = filtroActivo === f.clave;
      const boton = el('button', {
        type: 'button', class: `boton boton-chip ${activo ? 'boton-primario' : 'boton-secundario'}`, 'aria-pressed': String(activo),
      }, f.etiqueta);
      boton.addEventListener('click', () => { filtroActivo = f.clave; pintarFiltros(); pintarLista(); });
      filaFiltros.appendChild(boton);
    }
  }

  async function cargar() {
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      const trabajos = await api.get('/trabajos?limite=50');
      const porTomar = trabajos.filter((t) => t.estado === 'SOLICITADO');
      const enDiseno = trabajos.filter((t) => t.estado === 'EN_DISENO');
      // Incluye PENDIENTE_APROBACION (DEF-29/DEF-42): antes de este arreglo, el trabajo desaparecía por
      // completo de la bandeja apenas se enviaba la propuesta. EN_PRODUCCION (filtro "Aprobados",
      // segunda vuelta del punto 2) para seguir viendo qué pasó con una propuesta ya aprobada.
      const enAprobacion = trabajos.filter((t) => t.estado === 'PENDIENTE_APROBACION');
      const aprobados = trabajos.filter((t) => t.estado === 'EN_PRODUCCION');
      const motivos = await motivosDeRechazo(enDiseno);
      datos = { porTomar, enDiseno, enAprobacion, aprobados, motivos };
      pintarLista();
    } catch {
      datos = null;
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar la bandeja. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function ordenar(lista) {
    return ordenarPorOpcion(lista, orden, { entrega: (t) => t.fecha_compromiso, creacion: (t) => t.creado_en });
  }

  function pintarLista() {
    if (!datos) return;
    vaciar(listaNodo);
    const { porTomar, enDiseno, enAprobacion, aprobados, motivos } = datos;
    const rechazados = enDiseno.filter((t) => motivos[t.codigo]);

    if (filtroActivo === 'TODOS' || filtroActivo === 'POR_TOMAR') {
      listaNodo.appendChild(el('h2', {}, 'Por tomar'));
      const lista = ordenar(porTomar);
      if (!lista.length) listaNodo.appendChild(estadoVacio('No hay solicitudes nuevas por tomar.'));
      for (const trabajo of lista) listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: botonTomar(trabajo) }));
    }

    if (filtroActivo === 'TODOS' || filtroActivo === 'EN_DISENO' || filtroActivo === 'RECHAZADOS') {
      const soloRechazados = filtroActivo === 'RECHAZADOS';
      listaNodo.appendChild(el('h2', {}, soloRechazados ? 'Rechazados' : 'En diseño'));
      const lista = ordenar(soloRechazados ? rechazados : enDiseno);
      if (!lista.length) {
        listaNodo.appendChild(estadoVacio(soloRechazados ? 'No hay propuestas rechazadas por corregir.' : 'No tienes trabajos en diseño en este momento.'));
      }
      for (const trabajo of lista) {
        const motivo = motivos[trabajo.codigo];
        const extra = motivo ? aviso('info', `Motivo del rechazo: ${motivo}`) : null;
        const enviar = el('a', { class: 'boton boton-primario', href: `#/disenos/${trabajo.codigo}/enviar` }, 'Enviar propuesta');
        const verDetalle = el('a', { class: 'boton boton-secundario', href: `#/trabajos/${trabajo.codigo}` }, 'Ver detalle e historial');
        listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: el('div', { class: 'acciones-decision' }, verDetalle, enviar), detalleExtra: extra }));
      }
    }

    if (filtroActivo === 'TODOS' || filtroActivo === 'EN_APROBACION') {
      listaNodo.appendChild(el('h2', {}, 'Esperando aprobación'));
      const lista = ordenar(enAprobacion);
      if (!lista.length) listaNodo.appendChild(estadoVacio('No tienes propuestas esperando la decisión de Producción.'));
      for (const trabajo of lista) {
        const verDetalle = el('a', { class: 'boton boton-secundario', href: `#/trabajos/${trabajo.codigo}` }, 'Ver detalle e historial');
        listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: verDetalle }));
      }
    }

    if (filtroActivo === 'TODOS' || filtroActivo === 'APROBADOS') {
      listaNodo.appendChild(el('h2', {}, 'Aprobados'));
      const lista = ordenar(aprobados);
      if (!lista.length) listaNodo.appendChild(estadoVacio('No tienes propuestas aprobadas en producción por ahora.'));
      for (const trabajo of lista) {
        const verDetalle = el('a', { class: 'boton boton-secundario', href: `#/trabajos/${trabajo.codigo}` }, 'Ver detalle e historial');
        listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: verDetalle }));
      }
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

// Todo el archivo, no solo la cabecera: el servidor lo guarda de verdad en GridFS (Fase 1).
// FileReader.readAsDataURL es la forma rápida de codificar en base64 un archivo de hasta 15 MB en
// el navegador (recorrer el archivo byte a byte para armar el texto, como se hacía con la cabecera
// de 16 bytes, es demasiado lento para un archivo de este tamaño).
function leerArchivoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function archivoValido(archivo) {
  if (archivo.type === 'image/svg+xml') return 'No se aceptan archivos SVG.';
  if (!CABECERAS_FIRMA[archivo.type]) return 'Solo se aceptan archivos PDF, PNG o JPG.';
  if (archivo.size > TAMANO_MAXIMO) return 'El archivo supera los 15 MB permitidos.';
  return null;
}

export function renderEnviarPropuesta(main, sesion, codigo, irA) {
  const contenedorAviso = el('div');
  // El botón nativo del selector de archivos no se puede traducir ni pintar con el estilo de la
  // app (su texto, "Choose Files" en este navegador, lo pone el propio sistema operativo, igual
  // que el diálogo que abre, que sigue siendo nativo). Punto 11 de la revisión del equipo
  // (19-11-2026): se oculta visualmente el campo real (mismo ".visualmente-oculto" que ya existía
  // para el enlace "Saltar al contenido") y se dispara con un botón normal de la app.
  const campoArchivos = el('input', {
    id: 'archivos', type: 'file', class: 'visualmente-oculto', tabindex: '-1',
    accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg', multiple: true, required: true,
  });
  const botonElegirArchivos = el('button', { type: 'button', class: 'boton boton-secundario', 'aria-describedby': 'archivos-error' }, 'Elegir archivos');
  const nombreArchivos = el('span', { class: 'campo-ayuda' }, 'Ningún archivo elegido');
  botonElegirArchivos.addEventListener('click', () => campoArchivos.click());
  campoArchivos.addEventListener('change', () => {
    const n = campoArchivos.files.length;
    nombreArchivos.textContent = n === 0 ? 'Ningún archivo elegido' : n === 1 ? campoArchivos.files[0].name : `${n} archivos elegidos`;
  });
  const errorArchivos = el('p', { class: 'campo-error', id: 'archivos-error', role: 'alert' });
  errorArchivos.hidden = true;
  const campoTecnica = el('input', { id: 'tecnica', type: 'text', maxlength: 60, placeholder: 'Ej.: bordado' });
  const campoUbicacion = el('input', { id: 'ubicacion', type: 'text', maxlength: 60, placeholder: 'Ej.: pecho izquierdo' });
  const campoMedidas = el('input', { id: 'medidas', type: 'text', maxlength: 60, placeholder: 'Ej.: 8 x 8 cm' });
  const campoColores = el('input', { id: 'colores', type: 'text', maxlength: 200, placeholder: 'Ej.: morado, azul (separados por coma)' });
  const campoComentario = el('input', { id: 'comentario', type: 'text', maxlength: 500 });
  const boton = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Enviar propuesta');

  const form = el('form', { novalidate: true },
    contenedorAviso,
    el('div', { class: 'campo' },
      etiquetaCampo('Archivos (PDF, PNG o JPG, hasta 15 MB)', { for: 'archivos' }),
      el('div', { class: 'campo-archivo' }, botonElegirArchivos, nombreArchivos),
      campoArchivos,
      errorArchivos,
    ),
    el('div', { class: 'campo' }, etiquetaCampo('Técnica', { for: 'tecnica', opcional: true }), campoTecnica),
    el('div', { class: 'campo' }, etiquetaCampo('Ubicación', { for: 'ubicacion', opcional: true }), campoUbicacion),
    el('div', { class: 'campo' }, etiquetaCampo('Medidas', { for: 'medidas', opcional: true }), campoMedidas),
    el('div', { class: 'campo' }, etiquetaCampo('Colores', { for: 'colores', opcional: true }), campoColores),
    el('div', { class: 'campo' }, etiquetaCampo('Comentario', { for: 'comentario', opcional: true }), campoComentario),
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
    errorArchivos.hidden = true;
    botonElegirArchivos.removeAttribute('aria-invalid');
    const archivos = [...campoArchivos.files];
    if (!archivos.length) {
      botonElegirArchivos.setAttribute('aria-invalid', 'true');
      errorArchivos.textContent = 'Adjunta al menos un archivo.';
      errorArchivos.hidden = false;
      return;
    }
    for (const archivo of archivos) {
      const error = archivoValido(archivo);
      if (error) return mostrar('error', `"${archivo.name}": ${error}`);
    }

    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const archivosCodificados = await Promise.all(archivos.map(async (archivo) => ({
        nombre: archivo.name, tipoMime: archivo.type, contenidoBase64: await leerArchivoBase64(archivo),
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
      if (err instanceof ApiError && err.status === 400) mostrar('error', describirErrorApi(err, CAMPOS_PROPUESTA, 'Revisa los archivos y los datos ingresados.'));
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
