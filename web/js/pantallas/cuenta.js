import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, iniciarCuentaRegresiva, etiquetaCampo, describirErrorApi } from '../ui.js';
import { estadoCarga, leyendaObligatorios } from '../componentes.js';
import { cerrarSesion, guardarSesion, obtenerSesion } from '../estado.js';
import { ROL_TEXTO } from '../permisos.js';

const ROLES_CON_MFA = new Set(['ADMINISTRADOR', 'PRODUCCION']);

function campoContrasena(id, texto) {
  const input = el('input', { id, type: 'password', autocomplete: 'new-password', required: true });
  const contenedor = el('div', { class: 'campo' }, etiquetaCampo(texto, { for: id }), input);
  return { input, contenedor };
}

// Verificación en dos pasos (Funcionalidad 5), disponible para Administración y Producción.
// Nodo que administra sus propios tres estados (inactiva / activando / activa) y se repinta solo.
function seccionMfa(sesion) {
  if (!ROLES_CON_MFA.has(sesion.rol)) return null;
  let activa = Boolean(sesion.mfaHabilitado);
  const cuerpo = el('div');
  const contenedor = el('div', {}, el('h2', {}, 'Verificación en dos pasos'), cuerpo);

  function actualizarSesionLocal(valor) {
    activa = valor;
    const actual = obtenerSesion();
    if (actual) guardarSesion({ ...actual, mfaHabilitado: valor });
  }

  function pintarInactiva() {
    vaciar(cuerpo);
    const boton = el('button', { type: 'button', class: 'boton boton-primario' }, 'Activar verificación en dos pasos');
    boton.addEventListener('click', () => pintarActivando());
    cuerpo.appendChild(el('ol', { class: 'lista-reglas' },
      el('li', {}, 'Instala una aplicación de verificación en tu teléfono, como Google Authenticator o Microsoft Authenticator.'),
      el('li', {}, 'Escanea el código QR que te mostramos a continuación (solo una vez).'),
      el('li', {}, 'Escribe el código de 6 dígitos que te muestre la aplicación para confirmarlo.'),
    ));
    cuerpo.appendChild(el('p', {}, 'Una vez activada, te pediremos ese código cada vez que ingreses, además de tu contraseña.'));
    cuerpo.appendChild(boton);
  }

  function pintarActivando() {
    vaciar(cuerpo);
    cuerpo.appendChild(estadoCarga());
    api.post('/auth/mfa/iniciar', {}).then(({ secreto, qr }) => {
      vaciar(cuerpo);
      const campoCodigo = el('input', { id: 'mfa-codigo-nuevo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true });
      const errorCodigo = el('p', { class: 'campo-error', role: 'alert' });
      errorCodigo.hidden = true;
      const botonConfirmar = el('button', { type: 'button', class: 'boton boton-primario' }, 'Confirmar y activar');
      const botonCancelar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cancelar');
      botonCancelar.addEventListener('click', () => {
        api.post('/auth/mfa/cancelar', {}).catch(() => { /* no quedó activada; se puede reintentar igual */ });
        pintarInactiva();
      });
      botonConfirmar.addEventListener('click', async () => {
        const codigo = campoCodigo.value.trim();
        if (!/^\d{6}$/.test(codigo)) {
          errorCodigo.textContent = 'Escribe los 6 dígitos del código.';
          errorCodigo.hidden = false;
          return;
        }
        botonConfirmar.disabled = true;
        botonConfirmar.textContent = 'Confirmando…';
        try {
          await api.post('/auth/mfa/confirmar', { codigo });
          actualizarSesionLocal(true);
          pintarActiva(true);
        } catch (err) {
          errorCodigo.textContent = err instanceof ApiError ? (err.cuerpo?.error || 'Código incorrecto o vencido.') : 'No pudimos conectar con el sistema.';
          errorCodigo.hidden = false;
        } finally {
          botonConfirmar.disabled = false;
          botonConfirmar.textContent = 'Confirmar y activar';
        }
      });

      cuerpo.appendChild(el('p', {}, 'Escanea este código QR con la aplicación que instalaste.'));
      cuerpo.appendChild(el('img', { src: qr, alt: 'Código QR para activar la verificación en dos pasos' }));
      cuerpo.appendChild(el('p', { class: 'campo-ayuda' }, '¿No puedes escanearlo? Ingresa esta clave a mano en tu aplicación: ', el('strong', {}, secreto)));
      cuerpo.appendChild(el('div', { class: 'campo' }, etiquetaCampo('Código de 6 dígitos', { for: 'mfa-codigo-nuevo' }), campoCodigo, errorCodigo));
      cuerpo.appendChild(botonConfirmar);
      cuerpo.appendChild(botonCancelar);
      campoCodigo.focus();
    }).catch((err) => {
      vaciar(cuerpo);
      cuerpo.appendChild(aviso('error', err instanceof ApiError ? (err.cuerpo?.error || 'No pudimos iniciar la activación.') : 'No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.'));
      const botonReintentar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Reintentar');
      botonReintentar.addEventListener('click', () => pintarActivando());
      cuerpo.appendChild(botonReintentar);
    });
  }

  function pintarActiva(reciénActivada = false) {
    vaciar(cuerpo);
    if (reciénActivada) cuerpo.appendChild(aviso('exito', 'Verificación en dos pasos activada.'));
    cuerpo.appendChild(el('p', {}, el('span', { class: 'chip chip-ok' }, 'Activada')));
    const boton = el('button', { type: 'button', class: 'boton boton-peligro' }, 'Desactivar verificación en dos pasos');
    boton.addEventListener('click', () => pintarDesactivando());
    cuerpo.appendChild(boton);
  }

  function pintarDesactivando() {
    vaciar(cuerpo);
    const campoClave = el('input', { id: 'mfa-contrasena-actual', type: 'password', autocomplete: 'current-password', required: true });
    const errorClave = el('p', { class: 'campo-error', role: 'alert' });
    errorClave.hidden = true;
    const botonConfirmar = el('button', { type: 'button', class: 'boton boton-peligro' }, 'Sí, desactivar');
    const botonCancelar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cancelar');
    botonCancelar.addEventListener('click', () => pintarActiva());
    botonConfirmar.addEventListener('click', async () => {
      if (!campoClave.value) {
        errorClave.textContent = 'Ingresa tu contraseña actual.';
        errorClave.hidden = false;
        return;
      }
      botonConfirmar.disabled = true;
      botonConfirmar.textContent = 'Desactivando…';
      try {
        await api.post('/auth/mfa/desactivar', { contrasena: campoClave.value });
        actualizarSesionLocal(false);
        pintarInactiva();
      } catch (err) {
        errorClave.textContent = err instanceof ApiError && err.status === 401 ? 'La contraseña actual no es correcta.' : 'No pudimos conectar con el sistema.';
        errorClave.hidden = false;
      } finally {
        botonConfirmar.disabled = false;
        botonConfirmar.textContent = 'Sí, desactivar';
      }
    });

    cuerpo.appendChild(el('p', {}, 'Para desactivarla, confirma tu contraseña actual.'));
    cuerpo.appendChild(el('div', { class: 'campo' }, etiquetaCampo('Contraseña actual (para desactivar la verificación en dos pasos)', { for: 'mfa-contrasena-actual' }), campoClave, errorClave));
    cuerpo.appendChild(botonConfirmar);
    cuerpo.appendChild(botonCancelar);
    campoClave.focus();
  }

  if (activa) pintarActiva(); else pintarInactiva();
  return contenedor;
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
    leyendaObligatorios(),
    el('div', { class: 'campo' }, etiquetaCampo('Contraseña actual', { for: 'contrasena-actual' }), actual),
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
        mostrarError(describirErrorApi(err, { actual: 'Contraseña actual', nueva: 'Contraseña nueva' }, 'La contraseña nueva no cumple la política.'));
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
      seccionMfa(sesion),
      el('h2', {}, 'Sesión'),
      botonSalirCuenta,
    ),
  );
}
