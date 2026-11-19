// Detalle de un trabajo: mismo contenido para quien lo vea (vendedor, diseño, producción o
// administración), con el alcance que ya decide el servidor (403 si el trabajo no corresponde).
import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion, abrirDialogoMotivo, enlaceVolver, etiquetaCampo, describirErrorApi } from '../ui.js';
import { chipEstado, chipAtrasado, listaEtapas, estadoCarga, estadoError, formatoFecha, formatoFechaHora, filaEvento, textoEtapaActualSiguiente } from '../componentes.js';
import { tienePermiso, INICIO_POR_ROL } from '../permisos.js';

const MOTIVOS_DETENER = [
  'Falta materia prima',
  'Falla de maquinaria',
  'Ausencia de personal del área',
  'A la espera de una instrucción del cliente interno',
];

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
    contenedor.appendChild(el('p', { class: 'campo-ayuda' }, `${trabajo.tipo} · ${trabajo.cantidad} unidades · compromiso ${trabajo.fecha_compromiso ? formatoFecha(trabajo.fecha_compromiso) : '—'}`));

    if (disenoRechazado) {
      contenedor.appendChild(aviso('info', `Motivo del último rechazo: ${disenoRechazado.motivo}`));
    }

    if (tienePermiso(sesion.rol, 'TRABAJO_DETENER') && (trabajo.estado === 'EN_PRODUCCION' || trabajo.estado === 'DETENIDO')) {
      contenedor.appendChild(botonDetenerReanudar(trabajo));
    }

    // Punto 2 de la revisión del equipo (19-11-2026): en lenguaje claro, no solo en la lista de
    // chips de abajo, qué etapa va ahora y cuál sigue (o que el trabajo ya terminó / aún no empieza).
    contenedor.appendChild(el('p', { class: 'campo-ayuda' }, textoEtapaActualSiguiente(trabajo)));

    contenedor.appendChild(el('h2', {}, 'Etapas'));
    contenedor.appendChild(listaEtapas(trabajo.etapas));
    const vigente = trabajo.estado === 'EN_PRODUCCION' ? trabajo.etapas.find((e) => e.estado === 'EN_CURSO') : null;
    if (vigente) {
      const accionesEtapa = el('div', { class: 'acciones-decision' });
      // Producción supervisa todas las áreas: puede completar la etapa vigente aunque nadie la haya
      // tomado (o la haya tomado un operario), a diferencia del operario, que solo completa la suya.
      if (sesion.rol === 'PRODUCCION') accionesEtapa.appendChild(botonCompletarComoProduccion(vigente));
      // Punto B1: quien la tomó, Producción o Administración pueden liberar una etapa abandonada.
      // Un operario no llega a esta pantalla (ve y libera la suya desde "Mis actividades").
      if (vigente.responsable && tienePermiso(sesion.rol, 'ETAPA_LIBERAR')) {
        accionesEtapa.appendChild(botonLiberarEtapa(vigente));
      }
      if (accionesEtapa.childElementCount) contenedor.appendChild(accionesEtapa);
    }

    if (trabajo.disenos.length) {
      contenedor.appendChild(el('h2', {}, 'Versiones de diseño'));
      contenedor.appendChild(el('ul', { class: 'lista-versiones' }, ...trabajo.disenos.map((d) => el('li', { class: 'tarjeta' },
        el('p', {}, el('strong', {}, `Versión ${d.version}`), ' · ', chipEstado(d.estado === 'APROBADO' ? 'TERMINADO' : d.estado === 'RECHAZADO' ? 'DETENIDO' : 'PENDIENTE_APROBACION')),
        el('p', { class: 'campo-ayuda' }, `Diseñador: ${d.disenador || '—'} · enviado ${formatoFechaHora(d.enviado_en)}`),
        d.decision ? el('p', { class: 'campo-ayuda' }, `Decisión: ${d.decision}${d.motivo ? ` — ${d.motivo}` : ''}`) : null,
      ))));
    }

    if (tienePermiso(sesion.rol, 'MATERIAL_VER')) {
      contenedor.appendChild(el('h2', {}, 'Materiales'));
      const listaMateriales = el('ul', { class: 'lista-reglas' });
      contenedor.appendChild(listaMateriales);
      cargarMateriales(listaMateriales, trabajo.estado);
      if (tienePermiso(sesion.rol, 'MATERIAL_REGISTRAR')) {
        contenedor.appendChild(formularioMaterial(trabajo, listaMateriales));
      }
    }

    contenedor.appendChild(el('h2', {}, 'Historial'));
    const listaHistorial = el('div');
    contenedor.appendChild(listaHistorial);
    cargarHistorial(listaHistorial, trabajo);
  }

  // Punto 2: faltan materiales registrados en un trabajo que ya está en producción (o más
  // adelante) es información que conviene destacar, no solo un texto plano entre los demás.
  async function cargarMateriales(listaMateriales, estadoTrabajo) {
    vaciar(listaMateriales);
    try {
      const materiales = await api.get(`/trabajos/${codigo}/materiales`);
      if (!materiales.length) {
        const avanzado = !['SOLICITADO', 'EN_DISENO', 'PENDIENTE_APROBACION'].includes(estadoTrabajo);
        listaMateriales.appendChild(avanzado
          ? el('li', {}, aviso('info', 'Todavía no hay materiales registrados para este trabajo.'))
          : el('li', { class: 'campo-ayuda' }, 'Este trabajo no tiene materiales registrados.'));
      } else {
        for (const m of materiales) listaMateriales.appendChild(el('li', {}, `${m.nombre}: ${m.cantidad} ${m.unidad}${m.medida ? ` (${m.medida})` : ''}`));
      }
    } catch {
      listaMateriales.appendChild(el('li', { class: 'campo-error' }, 'No pudimos cargar los materiales.'));
    }
  }

  // Punto 2: historial humano del trabajo, con el mismo alcance que ya decide el servidor para
  // verlo (Vendedor el propio, Diseño mientras le corresponde, Producción/Administración todos).
  async function cargarHistorial(listaHistorial, trabajo) {
    vaciar(listaHistorial);
    listaHistorial.appendChild(estadoCarga());
    try {
      const eventos = await api.get(`/trabajos/${codigo}/historial`);
      vaciar(listaHistorial);
      if (!eventos.length) { listaHistorial.appendChild(el('p', { class: 'campo-ayuda' }, 'Todavía no hay eventos registrados.')); return; }
      const etapasPorOrden = Object.fromEntries((trabajo.etapas || []).map((e) => [e.orden, e.nombre]));
      listaHistorial.appendChild(el('ol', { class: 'lista-bitacora' }, ...eventos.map((e) => filaEvento(e, { etapasPorOrden }))));
    } catch {
      vaciar(listaHistorial);
      listaHistorial.appendChild(estadoError('No pudimos cargar el historial. Revisa tu conexión e inténtalo otra vez.', () => cargarHistorial(listaHistorial, trabajo)));
    }
  }

  function formularioMaterial(trabajo, listaMateriales) {
    const contenedorAviso = el('div');
    const campoMaterial = el('select', { id: 'material', required: true, 'aria-describedby': 'material-error' }, el('option', { value: '' }, 'Selecciona un material'));
    const errorMaterial = el('p', { class: 'campo-error', id: 'material-error', role: 'alert' });
    errorMaterial.hidden = true;
    const campoCantidad = el('input', { id: 'cantidad-material', type: 'number', required: true, min: '0.01', step: '0.01', max: '100000', placeholder: 'Ej.: 2.5', 'aria-describedby': 'cantidad-material-error' });
    const errorCantidad = el('p', { class: 'campo-error', id: 'cantidad-material-error', role: 'alert' });
    errorCantidad.hidden = true;
    const campoMedida = el('input', { id: 'medida-material', type: 'text', maxlength: 60, placeholder: 'Ej.: color, talla, etc.' });
    const botonGuardar = el('button', { type: 'submit', class: 'boton boton-secundario' }, 'Registrar material');

    const form = el('form', { novalidate: true },
      contenedorAviso,
      el('div', { class: 'campo' }, etiquetaCampo('Material', { for: 'material' }), campoMaterial, errorMaterial),
      el('div', { class: 'campo' }, etiquetaCampo('Cantidad', { for: 'cantidad-material' }), campoCantidad, errorCantidad),
      el('div', { class: 'campo' }, etiquetaCampo('Medida', { for: 'medida-material', opcional: true }), campoMedida),
      botonGuardar,
    );

    api.get('/catalogos').then((catalogos) => {
      for (const m of catalogos.materiales) campoMaterial.appendChild(el('option', { value: m.id_material }, `${m.nombre} (${m.unidad})`));
    }).catch(() => {
      vaciar(contenedorAviso);
      contenedorAviso.appendChild(aviso('error', 'No pudimos cargar el catálogo de materiales. Recarga la página.'));
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      vaciar(contenedorAviso);
      errorMaterial.hidden = true;
      campoMaterial.removeAttribute('aria-invalid');
      errorCantidad.hidden = true;
      campoCantidad.removeAttribute('aria-invalid');
      let valido = true;
      if (!campoMaterial.value) {
        campoMaterial.setAttribute('aria-invalid', 'true');
        errorMaterial.textContent = 'Selecciona un material.';
        errorMaterial.hidden = false;
        valido = false;
      }
      if (!campoCantidad.value) {
        campoCantidad.setAttribute('aria-invalid', 'true');
        errorCantidad.textContent = 'Escribe la cantidad.';
        errorCantidad.hidden = false;
        valido = false;
      } else if (Number(campoCantidad.value) <= 0) {
        campoCantidad.setAttribute('aria-invalid', 'true');
        errorCantidad.textContent = 'La cantidad debe ser mayor que cero.';
        errorCantidad.hidden = false;
        valido = false;
      }
      if (!valido) return;

      botonGuardar.disabled = true;
      botonGuardar.textContent = 'Guardando…';
      try {
        await api.post(`/trabajos/${trabajo.codigo}/materiales`, {
          idMaterial: Number(campoMaterial.value),
          cantidad: Number(campoCantidad.value),
          ...(campoMedida.value.trim() ? { medida: campoMedida.value.trim() } : {}),
        });
        campoCantidad.value = '';
        campoMedida.value = '';
        await cargarMateriales(listaMateriales);
      } catch (err) {
        const mensaje = err instanceof ApiError && err.status === 400
          ? describirErrorApi(err, { idMaterial: 'Material', cantidad: 'Cantidad' }, 'Revisa los datos del material.')
          : 'No pudimos registrar el material. Inténtalo otra vez.';
        contenedorAviso.appendChild(aviso('error', mensaje));
      } finally {
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Registrar material';
      }
    });

    return form;
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

  function botonLiberarEtapa(etapa) {
    const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, `Liberar "${etapa.nombre}"`);
    boton.addEventListener('click', async () => {
      const confirmado = await abrirDialogoConfirmacion({
        titulo: 'Liberar etapa',
        mensaje: `¿Dejar "${etapa.nombre}" disponible de nuevo? La estaba trabajando ${etapa.responsable}; cualquier persona del área podrá tomarla desde cero.`,
        textoConfirmar: 'Liberar',
      });
      if (!confirmado) return;
      try {
        await api.post(`/trabajos/${codigo}/etapas/${etapa.orden}/liberar`, {});
        cargar();
      } catch {
        contenedor.prepend(aviso('error', 'No pudimos liberar la etapa. Inténtalo otra vez.'));
      }
    });
    return boton;
  }

  function botonCompletarComoProduccion(etapa) {
    const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, `Completar "${etapa.nombre}"`);
    boton.addEventListener('click', async () => {
      const mensaje = etapa.responsable
        ? `¿Completar "${etapa.nombre}"? La estaba trabajando ${etapa.responsable}.`
        : `¿Completar "${etapa.nombre}"? Todavía no la había tomado ningún operario.`;
      const confirmado = await abrirDialogoConfirmacion({ titulo: 'Completar etapa', mensaje, textoConfirmar: 'Completar' });
      if (!confirmado) return;
      try {
        await api.post(`/trabajos/${codigo}/etapas/${etapa.orden}/completar`, {});
        cargar();
      } catch {
        contenedor.prepend(aviso('error', 'No pudimos completar la etapa. Inténtalo otra vez.'));
      }
    });
    return boton;
  }
}
