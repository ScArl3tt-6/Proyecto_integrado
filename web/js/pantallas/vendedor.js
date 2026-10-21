import { api, ApiError } from '../api.js';
import { el, vaciar, aviso } from '../ui.js';
import { tarjetaTrabajo, estadoVacio, estadoCarga, estadoError, paginador, TEXTO_ESTADO } from '../componentes.js';

export function renderMisSolicitudes(main, sesion, irA) {
  const filtroEstado = el('select', { id: 'filtro-estado' }, el('option', { value: '' }, 'Todos los estados'),
    ...Object.entries(TEXTO_ESTADO).map(([valor, texto]) => el('option', { value: valor }, texto)));

  const contenedor = el('section', { class: 'contenedor' },
    el('div', { class: 'encabezado-pantalla' },
      el('h1', {}, 'Mis solicitudes'),
      el('a', { class: 'boton boton-primario', href: '#/nueva-solicitud' }, 'Nueva solicitud'),
    ),
    el('div', { class: 'filtros-lista' },
      el('div', { class: 'campo' }, el('label', { for: 'filtro-estado' }, 'Filtrar por estado'), filtroEstado),
    ),
  );
  const listaNodo = el('div', { class: 'lista-trabajos' });
  const piePagina = el('div');
  contenedor.appendChild(listaNodo);
  contenedor.appendChild(piePagina);
  main.appendChild(contenedor);

  let pagina = 1;
  filtroEstado.addEventListener('change', () => { pagina = 1; cargar(); });
  cargar();

  async function cargar() {
    vaciar(listaNodo);
    vaciar(piePagina);
    listaNodo.appendChild(estadoCarga());
    try {
      const filtro = filtroEstado.value ? `&estado=${filtroEstado.value}` : '';
      const trabajos = await api.get(`/trabajos?pagina=${pagina}&limite=20${filtro}`);
      vaciar(listaNodo);
      if (!trabajos.length) {
        listaNodo.appendChild(estadoVacio(pagina === 1 ? 'Todavía no registras solicitudes.' : 'No hay más solicitudes.'));
      } else {
        for (const trabajo of trabajos) {
          const verDetalle = el('a', { class: 'boton boton-secundario', href: `#/trabajos/${trabajo.codigo}` }, 'Ver detalle');
          listaNodo.appendChild(tarjetaTrabajo(trabajo, { accion: verDetalle }));
        }
      }
      piePagina.appendChild(paginador({ pagina, llena: trabajos.length === 20, alCambiar: (p) => { pagina = p; cargar(); } }));
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar tus solicitudes. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }
}

export function renderNuevaSolicitud(main, sesion, irA) {
  const contenedorAviso = el('div');
  const campoTipo = el('select', { id: 'tipo', required: true }, el('option', { value: '' }, 'Selecciona un tipo'));
  const campoDescripcion = el('input', { id: 'descripcion', type: 'text', required: true, minlength: 5, maxlength: 300 });
  const campoCantidad = el('input', { id: 'cantidad', type: 'number', required: true, min: 1, max: 100000, value: '1' });
  const hoy = new Date().toISOString().slice(0, 10);
  const campoFecha = el('input', { id: 'fecha', type: 'date', required: true, min: hoy });
  const botonGuardar = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Registrar solicitud');

  const form = el('form', { novalidate: true },
    contenedorAviso,
    el('div', { class: 'campo' }, el('label', { for: 'tipo' }, 'Tipo de trabajo'), campoTipo),
    el('div', { class: 'campo' }, el('label', { for: 'descripcion' }, 'Descripción'), campoDescripcion),
    el('div', { class: 'campo' }, el('label', { for: 'cantidad' }, 'Cantidad'), campoCantidad),
    el('div', { class: 'campo' }, el('label', { for: 'fecha' }, 'Fecha comprometida'), campoFecha),
    botonGuardar,
  );

  main.appendChild(
    el('section', { class: 'contenedor' },
      el('h1', {}, 'Nueva solicitud'),
      el('p', { class: 'campo-ayuda' }, 'Solo se registran datos del trabajo. No se piden datos de contacto ni de pago del cliente.'),
      form,
    ),
  );

  api.get('/catalogos').then((catalogos) => {
    for (const tipo of catalogos.tipos) campoTipo.appendChild(el('option', { value: tipo.id_tipo }, tipo.nombre));
  }).catch(() => {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso('error', 'No pudimos cargar los tipos de trabajo. Recarga la página.'));
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAviso);
    if (!campoTipo.value) return mostrar('error', 'Selecciona un tipo de trabajo.');
    if (campoDescripcion.value.trim().length < 5) return mostrar('error', 'La descripción debe tener al menos 5 caracteres.');
    if (campoFecha.value < hoy) return mostrar('error', 'La fecha comprometida no puede ser anterior a hoy.');

    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando…';
    try {
      const resultado = await api.post('/trabajos', {
        idTipo: Number(campoTipo.value),
        descripcion: campoDescripcion.value.trim(),
        cantidad: Number(campoCantidad.value),
        fechaCompromiso: campoFecha.value,
      });
      irA(`#/trabajos/${resultado.codigo}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) mostrar('error', 'Revisa los datos ingresados: ' + (err.cuerpo?.error || 'hay campos inválidos.'));
      else mostrar('error', 'No pudimos registrar la solicitud. Revisa tu conexión e inténtalo otra vez.');
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Registrar solicitud';
    }
  });

  function mostrar(tipo, mensaje) {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso(tipo, mensaje));
  }
}
