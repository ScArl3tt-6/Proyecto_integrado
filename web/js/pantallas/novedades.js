// Novedades para Vendedor y Diseño (punto 5 de la revisión del equipo, 19-11-2026): aviso visible
// (contador + lista) cuando una solicitud propia se rechaza, se aprueba, cambia de etapa o
// termina. Reutiliza eventos que ya existen en la bitácora; nada de correo ni servicios nuevos.
// Filtros, "Marcar todas como leídas", agrupación por día y "Cargar más" agregados en la segunda
// vuelta del punto 3 (20-11-2026): con pocas novedades alcanzaba con la lista plana de antes, pero
// con muchas hacía falta poder encontrar algo concreto sin leerlas todas de nuevo cada vez.
import { api } from '../api.js';
import { el, vaciar } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError, filaEvento, formatoFecha } from '../componentes.js';

const LIMITE_PAGINA = 20;

const FILTROS = [
  { clave: 'TODAS', etiqueta: 'Todas' },
  { clave: 'NO_LEIDAS', etiqueta: 'No leídas' },
  { clave: 'RECHAZOS', etiqueta: 'Rechazos' },
  { clave: 'APROBADOS', etiqueta: 'Aprobados' },
  { clave: 'EN_PRODUCCION', etiqueta: 'En producción' },
  { clave: 'TERMINADOS', etiqueta: 'Terminados' },
];

// A qué filtro de categoría pertenece un evento. Ninguno de los cuatro es exclusivo de un rol:
// según el alcance de cada quien (ver servicioBitacora.consultarNovedades), algunos simplemente
// quedan siempre vacíos (p. ej. Diseño no recibe eventos de etapas intermedias, solo el término).
function categoria(evento) {
  if (evento.tipo === 'DISENO_RECHAZADO') return 'RECHAZOS';
  if (evento.tipo === 'DISENO_APROBADO') return 'APROBADOS';
  if (evento.tipo === 'ETAPA_COMPLETADA') return evento.detalle?.trabajoTerminado ? 'TERMINADOS' : 'EN_PRODUCCION';
  return null;
}

function etiquetaDia(fecha) {
  const d = new Date(fecha);
  const inicioDe = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDias = Math.round((inicioDe(new Date()) - inicioDe(d)) / 86400000);
  if (diffDias === 0) return 'Hoy';
  if (diffDias === 1) return 'Ayer';
  return formatoFecha(fecha);
}

export function renderNovedades(main) {
  let filtroActivo = 'TODAS';
  let pagina = 1;
  let eventos = [];
  let total = 0;
  let noVistas = 0;
  let cargando = false;

  const resumen = el('p', { class: 'campo-ayuda' }, '');
  const filaFiltros = el('div', { class: 'filtros-lista', role: 'group', 'aria-label': 'Filtrar novedades' });
  const botonMarcarTodas = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Marcar todas como leídas');
  const listaNodo = el('div');
  const piePagina = el('div');

  const contenedor = el('section', { class: 'contenedor' },
    el('div', { class: 'encabezado-pantalla' }, el('h1', {}, 'Novedades'), botonMarcarTodas),
    resumen,
    filaFiltros,
    listaNodo,
    piePagina,
  );
  main.appendChild(contenedor);

  pintarFiltros();
  botonMarcarTodas.addEventListener('click', async () => {
    botonMarcarTodas.disabled = true;
    try {
      await api.post('/auditoria/novedades/vistas', {});
      await cargar(true);
    } catch {
      contenedor.prepend(estadoError('No pudimos marcarlas como leídas. Inténtalo otra vez.'));
    } finally {
      botonMarcarTodas.disabled = false;
    }
  });
  cargar(true);

  function pintarFiltros() {
    vaciar(filaFiltros);
    for (const f of FILTROS) {
      const activo = filtroActivo === f.clave;
      const boton = el('button', {
        type: 'button', class: `boton boton-chip ${activo ? 'boton-primario' : 'boton-secundario'}`, 'aria-pressed': String(activo),
      }, f.etiqueta);
      boton.addEventListener('click', () => { filtroActivo = f.clave; pintarLista(); });
      filaFiltros.appendChild(boton);
    }
  }

  async function cargar(reiniciar) {
    if (cargando) return;
    cargando = true;
    if (reiniciar) {
      pagina = 1;
      vaciar(listaNodo);
      vaciar(piePagina);
      listaNodo.appendChild(estadoCarga());
    }
    try {
      const resultado = await api.get(`/auditoria/novedades?pagina=${pagina}&limite=${LIMITE_PAGINA}`);
      noVistas = resultado.noVistas;
      total = resultado.total;
      eventos = reiniciar ? resultado.eventos : [...eventos, ...resultado.eventos];
      pintarLista();
    } catch {
      vaciar(listaNodo);
      vaciar(piePagina);
      listaNodo.appendChild(estadoError('No pudimos cargar las novedades. Revisa tu conexión e inténtalo otra vez.', () => cargar(true)));
    } finally {
      cargando = false;
    }
  }

  function pintarLista() {
    vaciar(listaNodo);
    resumen.textContent = noVistas > 0
      ? `${noVistas} novedad${noVistas === 1 ? '' : 'es'} nueva${noVistas === 1 ? '' : 's'} desde tu última visita.`
      : 'No tienes novedades nuevas desde tu última visita.';

    const filtrados = filtroActivo === 'TODAS' ? eventos
      : filtroActivo === 'NO_LEIDAS' ? eventos.filter((e) => !e.leida)
        : eventos.filter((e) => categoria(e) === filtroActivo);

    if (!filtrados.length) {
      listaNodo.appendChild(estadoVacio(
        eventos.length ? 'No hay novedades en este filtro, entre las ya cargadas.' : 'Todavía no hay novedades para tus trabajos.',
      ));
    } else {
      let diaAnterior = null;
      let grupoActual = null;
      for (const evento of filtrados) {
        const dia = formatoFecha(evento.fecha);
        if (dia !== diaAnterior) {
          listaNodo.appendChild(el('h2', {}, etiquetaDia(evento.fecha)));
          grupoActual = el('ol', { class: 'lista-bitacora' });
          listaNodo.appendChild(grupoActual);
          diaAnterior = dia;
        }
        grupoActual.appendChild(filaEvento(evento, { mostrarCodigo: true }));
      }
    }

    vaciar(piePagina);
    if (eventos.length < total) {
      const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cargar más');
      boton.addEventListener('click', async () => { pagina += 1; await cargar(false); });
      piePagina.appendChild(boton);
    }
  }
}
