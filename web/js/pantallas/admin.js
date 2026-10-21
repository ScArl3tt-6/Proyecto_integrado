import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, abrirDialogoConfirmacion } from '../ui.js';
import { estadoVacio, estadoCarga, estadoError } from '../componentes.js';
import { ROL_TEXTO, AREAS_POR_ROL } from '../permisos.js';

const ROLES = ['ADMINISTRADOR', 'PRODUCCION', 'DISENO', 'VENDEDOR', 'OPERARIO'];

function selectRoles(valorActual) {
  return el('select', {}, ...ROLES.map((r) => el('option', { value: r, selected: r === valorActual || undefined }, ROL_TEXTO[r])));
}

// El área se recalcula según el rol elegido: solo se puede asignar un área que tenga sentido
// para ese rol (evita, por ejemplo, un rol de Diseño con área Administración).
function selectAreas(rolActual, valorActual) {
  const campo = el('select', {});
  pintarOpcionesArea(campo, rolActual, valorActual);
  return campo;
}

function pintarOpcionesArea(campo, rol, valorActual) {
  vaciar(campo);
  const areasValidas = AREAS_POR_ROL[rol] || [];
  campo.appendChild(el('option', { value: '' }, 'Sin área'));
  for (const area of areasValidas) campo.appendChild(el('option', { value: area, selected: area === valorActual || undefined }, area));
  campo.disabled = areasValidas.length === 0;
}

function formatoFechaHora(fecha) {
  if (!fecha) return 'Nunca';
  return new Date(fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function renderUsuarios(main, sesion, irA) {
  const contenedorAvisoAlta = el('div');
  const campoNombre = el('input', { id: 'nombre-nuevo', type: 'text', required: true, minlength: 3, maxlength: 80 });
  const campoCorreo = el('input', { id: 'correo-nuevo', type: 'email', required: true, maxlength: 120 });
  const campoRol = selectRoles('VENDEDOR');
  const campoArea = selectAreas('VENDEDOR', '');
  campoRol.addEventListener('change', () => pintarOpcionesArea(campoArea, campoRol.value, null));
  const campoContrasena = el('input', { id: 'contrasena-nueva-cuenta', type: 'text', required: true, minlength: 12, maxlength: 128 });
  const botonCrear = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Crear cuenta');

  const formAlta = el('form', { novalidate: true },
    contenedorAvisoAlta,
    el('div', { class: 'campo' }, el('label', { for: 'nombre-nuevo' }, 'Nombre'), campoNombre),
    el('div', { class: 'campo' }, el('label', { for: 'correo-nuevo' }, 'Correo'), campoCorreo),
    el('div', { class: 'campo' }, el('label', {}, 'Rol'), campoRol),
    el('div', { class: 'campo' }, el('label', {}, 'Área'), campoArea),
    el('div', { class: 'campo' }, el('label', { for: 'contrasena-nueva-cuenta' }, 'Contraseña inicial'), campoContrasena),
    el('p', { class: 'campo-ayuda' }, 'Mínimo 12 caracteres, sin el nombre, el correo ni «kotoduo». Entrégasela a la persona en mano; ella la cambia luego desde "Mi cuenta".'),
    botonCrear,
  );

  const listaNodo = el('div', { class: 'lista-trabajos' });

  main.appendChild(
    el('section', { class: 'contenedor' },
      el('h1', {}, 'Usuarios'),
      el('h2', {}, 'Crear cuenta'),
      el('div', { class: 'tarjeta' }, formAlta),
      el('h2', {}, 'Cuentas'),
      listaNodo,
    ),
  );

  cargar();

  formAlta.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAvisoAlta);
    if (campoNombre.value.trim().length < 3) return mostrarAlta('error', 'El nombre debe tener al menos 3 caracteres.');
    if (!campoCorreo.value.trim()) return mostrarAlta('error', 'Ingresa un correo.');
    if (campoContrasena.value.length < 12) return mostrarAlta('error', 'La contraseña inicial debe tener al menos 12 caracteres.');

    botonCrear.disabled = true;
    botonCrear.textContent = 'Creando…';
    try {
      await api.post('/usuarios', {
        nombre: campoNombre.value.trim(), correo: campoCorreo.value.trim(), contrasena: campoContrasena.value,
        rol: campoRol.value, area: campoArea.value || undefined,
      });
      formAlta.reset();
      pintarOpcionesArea(campoArea, campoRol.value, null);
      mostrarAlta('exito', 'Cuenta creada. Entrégale la contraseña inicial en mano; ella la cambiará desde "Mi cuenta".');
      cargar();
    } catch (err) {
      mostrarAlta('error', err instanceof ApiError ? (err.cuerpo?.error || 'No pudimos crear la cuenta.') : 'No pudimos crear la cuenta. Revisa tu conexión.');
    } finally {
      botonCrear.disabled = false;
      botonCrear.textContent = 'Crear cuenta';
    }
  });

  function mostrarAlta(tipo, mensaje) {
    vaciar(contenedorAvisoAlta);
    contenedorAvisoAlta.appendChild(aviso(tipo, mensaje));
  }

  async function cargar() {
    vaciar(listaNodo);
    listaNodo.appendChild(estadoCarga());
    try {
      const usuarios = await api.get('/usuarios');
      vaciar(listaNodo);
      if (!usuarios.length) { listaNodo.appendChild(estadoVacio('No hay cuentas registradas.')); return; }
      listaNodo.appendChild(el('table', { class: 'tabla-simple' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Nombre'), el('th', {}, 'Correo'), el('th', {}, 'Rol'), el('th', {}, 'Área'), el('th', {}, 'Estado'), el('th', {}, 'Último acceso'), el('th', {}, 'Acciones'))),
        el('tbody', {}, ...usuarios.map((u) => fila(u))),
      ));
    } catch {
      vaciar(listaNodo);
      listaNodo.appendChild(estadoError('No pudimos cargar las cuentas. Revisa tu conexión e inténtalo otra vez.', cargar));
    }
  }

  function fila(usuario) {
    const esUnoMismo = usuario.id_usuario === sesion.id;
    const botonPerfil = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cambiar rol o área');
    botonPerfil.addEventListener('click', () => abrirDialogoPerfil(usuario, cargar));

    const celdaEstado = el('td', {},
      el('span', { class: `chip ${usuario.activo ? 'chip-ok' : 'chip-error'}` }, usuario.activo ? 'Activa' : 'Inactiva'),
      usuario.bloqueado ? el('span', { class: 'chip chip-error' }, 'Bloqueada') : null,
    );

    const acciones = el('td', { class: 'celda-acciones' }, botonPerfil);
    if (!esUnoMismo) {
      const botonEstado = el('button', { type: 'button', class: usuario.activo ? 'boton boton-peligro' : 'boton boton-secundario' }, usuario.activo ? 'Desactivar' : 'Activar');
      botonEstado.addEventListener('click', async () => {
        const confirmado = await abrirDialogoConfirmacion({
          titulo: usuario.activo ? 'Desactivar cuenta' : 'Activar cuenta',
          mensaje: `¿${usuario.activo ? 'Desactivar' : 'Activar'} la cuenta de ${usuario.nombre}?`,
          textoConfirmar: usuario.activo ? 'Desactivar' : 'Activar',
          peligro: usuario.activo,
        });
        if (!confirmado) return;
        try {
          await api.patch(`/usuarios/${usuario.id_usuario}/estado`, { activo: !usuario.activo });
          cargar();
        } catch {
          listaNodo.prepend(aviso('error', 'No pudimos actualizar el estado de la cuenta.'));
        }
      });
      acciones.appendChild(botonEstado);
    }

    return el('tr', {},
      el('td', {}, usuario.nombre),
      el('td', {}, usuario.correo),
      el('td', {}, ROL_TEXTO[usuario.rol] || usuario.rol),
      el('td', {}, usuario.area || '—'),
      celdaEstado,
      el('td', {}, formatoFechaHora(usuario.ultimoAcceso)),
      acciones,
    );
  }

  function abrirDialogoPerfil(usuario, alGuardar) {
    const campoRolDialogo = selectRoles(usuario.rol);
    const campoAreaDialogo = selectAreas(usuario.rol, usuario.area || '');
    campoRolDialogo.addEventListener('change', () => pintarOpcionesArea(campoAreaDialogo, campoRolDialogo.value, null));
    const error = el('p', { class: 'campo-error' });
    error.hidden = true;

    const dialogo = el('dialog', { class: 'dialogo' },
      el('h2', {}, `Rol y área de ${usuario.nombre}`),
      el('div', { class: 'campo' }, el('label', {}, 'Rol'), campoRolDialogo),
      el('div', { class: 'campo' }, el('label', {}, 'Área'), campoAreaDialogo),
      error,
      el('div', { class: 'dialogo-acciones' }),
    );
    const acciones = dialogo.querySelector('.dialogo-acciones');
    const cancelar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cancelar');
    cancelar.addEventListener('click', () => dialogo.close());
    const guardar = el('button', { type: 'button', class: 'boton boton-primario' }, 'Guardar');
    guardar.addEventListener('click', async () => {
      try {
        await api.patch(`/usuarios/${usuario.id_usuario}/perfil`, { rol: campoRolDialogo.value, area: campoAreaDialogo.value || undefined });
        dialogo.close();
        alGuardar();
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof ApiError && err.status === 409 ? 'No puedes modificar tu propio perfil.' : 'No pudimos guardar los cambios.';
      }
    });
    acciones.appendChild(cancelar);
    acciones.appendChild(guardar);
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.appendChild(dialogo);
    dialogo.showModal();
  }
}

export function renderBitacora(main, sesion, irA) {
  const campoCodigo = el('input', { id: 'codigo-bitacora', type: 'text', placeholder: 'KT-2026-0001', maxlength: 15 });
  const botonBuscar = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Buscar');
  const resultado = el('div');

  const form = el('form', { novalidate: true },
    el('div', { class: 'campo' }, el('label', { for: 'codigo-bitacora' }, 'Código de trabajo'), campoCodigo),
    botonBuscar,
  );

  main.appendChild(el('section', { class: 'contenedor' }, el('h1', {}, 'Bitácora'), form, resultado));

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const codigo = campoCodigo.value.trim().toUpperCase();
    vaciar(resultado);
    if (!/^KT-\d{4}-\d{4}$/.test(codigo)) {
      resultado.appendChild(aviso('error', 'Ingresa un código con el formato KT-AAAA-NNNN.'));
      return;
    }
    resultado.appendChild(estadoCarga());
    try {
      const eventos = await api.get(`/auditoria/trabajos/${codigo}`);
      vaciar(resultado);
      if (!eventos.length) { resultado.appendChild(estadoVacio('No hay eventos para ese código.')); return; }
      resultado.appendChild(el('ol', { class: 'lista-bitacora' }, ...eventos.map((e) => el('li', { class: 'tarjeta' },
        el('p', {}, el('strong', {}, e.tipo), ' · ', new Date(e.fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })),
        e.usuario ? el('p', { class: 'campo-ayuda' }, `Rol: ${ROL_TEXTO[e.usuario.rol] || e.usuario.rol}`) : null,
      ))));
    } catch {
      vaciar(resultado);
      resultado.appendChild(estadoError('No pudimos cargar la bitácora. Revisa tu conexión e inténtalo otra vez.', () => form.requestSubmit()));
    }
  });
}
