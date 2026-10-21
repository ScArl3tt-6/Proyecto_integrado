import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, iniciarCuentaRegresiva } from '../ui.js';
import { cerrarSesion } from '../estado.js';
import { ROL_TEXTO } from '../permisos.js';

function campoContrasena(id, etiqueta) {
  const input = el('input', { id, type: 'password', autocomplete: 'new-password', required: true });
  const contenedor = el('div', { class: 'campo' }, el('label', { for: id }, etiqueta), input);
  return { input, contenedor };
}

export function renderCuenta(main, sesion) {
  let temporizador = null;

  const actual = el('input', { id: 'contrasena-actual', type: 'password', autocomplete: 'current-password', required: true });
  const { input: nueva, contenedor: contenedorNueva } = campoContrasena('contrasena-nueva', 'Contraseña nueva');
  const { input: repetir, contenedor: contenedorRepetir } = campoContrasena('contrasena-repetir', 'Repetir contraseña nueva');
  nueva.setAttribute('minlength', '12');

  const contenedorAviso = el('div');
  const boton = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Cambiar contraseña');

  function mostrarError(mensaje) {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso('error', mensaje));
  }

  const form = el('form', { novalidate: true },
    contenedorAviso,
    el('div', { class: 'campo' }, el('label', { for: 'contrasena-actual' }, 'Contraseña actual'), actual),
    contenedorNueva,
    contenedorRepetir,
    boton,
  );

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAviso);

    const valorActual = actual.value;
    const valorNueva = nueva.value;
    const valorRepetir = repetir.value;

    if (valorNueva.length < 12) return mostrarError('La contraseña nueva debe tener al menos 12 caracteres.');
    if (valorNueva !== valorRepetir) return mostrarError('Las contraseñas nuevas no coinciden.');
    if (valorNueva === valorActual) return mostrarError('La nueva contraseña debe ser distinta de la actual.');

    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      await api.post('/auth/cambiar-contrasena', { actual: valorActual, nueva: valorNueva });
      vaciar(contenedorAviso);
      contenedorAviso.appendChild(aviso('exito', 'Listo. Cerramos tus otras sesiones por seguridad.'));
      form.reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        mostrarError('La contraseña actual no es correcta.');
      } else if (err instanceof ApiError && err.status === 400) {
        mostrarError(err.cuerpo?.error || 'La contraseña nueva no cumple la política.');
      } else if (err instanceof ApiError && err.status === 429) {
        boton.textContent = 'Cambiar contraseña';
        vaciar(contenedorAviso);
        const nodo = el('div', { class: 'aviso aviso-error', role: 'alert', tabindex: '-1' });
        contenedorAviso.appendChild(nodo);
        nodo.focus();
        temporizador = iniciarCuentaRegresiva(nodo, err.retryAfter || 60, () => {
          temporizador = null;
          boton.disabled = false;
          boton.textContent = 'Cambiar contraseña';
          vaciar(contenedorAviso);
        });
        return;
      } else {
        mostrarError('No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.');
      }
    } finally {
      if (!temporizador) {
        boton.disabled = false;
        boton.textContent = 'Cambiar contraseña';
      }
    }
  });

  const botonSalirCuenta = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cerrar sesión');
  botonSalirCuenta.addEventListener('click', cerrarSesion);

  main.appendChild(
    el('section', { class: 'contenedor seccion-cuenta' },
      el('h1', {}, 'Mi cuenta'),
      el('p', {}, `Rol: ${ROL_TEXTO[sesion.rol] || sesion.rol}`),
      el('h2', {}, 'Cambiar contraseña'),
      el('ul', { class: 'lista-reglas' },
        el('li', {}, 'Al menos 12 caracteres (se aceptan frases largas).'),
        el('li', {}, 'No uses tu nombre, tu correo ni «kotoduo».'),
        el('li', {}, 'Evita contraseñas comunes, repeticiones o secuencias.'),
        el('li', {}, 'Debe ser distinta de tu contraseña actual.'),
      ),
      form,
      el('h2', {}, 'Sesión'),
      botonSalirCuenta,
    ),
  );
}
