import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, iniciarCuentaRegresiva } from '../ui.js';
import { guardarSesion, consumirBanderaSesionExpirada } from '../estado.js';

const CORREO_PATRON = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function renderIngreso(main, irA) {
  let intentosFallidos = 0;
  let temporizadorCuentaRegresiva = null;

  const campoCorreo = el('input', {
    id: 'correo', type: 'email', name: 'correo', autocomplete: 'username', required: true, 'aria-describedby': 'correo-error',
  });
  const errorCorreo = el('p', { class: 'campo-error', id: 'correo-error', role: 'alert' });
  errorCorreo.hidden = true;

  const campoContrasena = el('input', {
    id: 'contrasena', type: 'password', name: 'contrasena', autocomplete: 'current-password', required: true, 'aria-describedby': 'contrasena-error',
  });
  const errorContrasena = el('p', { class: 'campo-error', id: 'contrasena-error', role: 'alert' });
  errorContrasena.hidden = true;

  const botonMostrar = el('button', { type: 'button', class: 'alternar-contrasena', 'aria-label': 'Mostrar contraseña' }, 'Mostrar');
  botonMostrar.addEventListener('click', () => {
    const mostrando = campoContrasena.type === 'text';
    campoContrasena.type = mostrando ? 'password' : 'text';
    botonMostrar.textContent = mostrando ? 'Mostrar' : 'Ocultar';
    botonMostrar.setAttribute('aria-label', mostrando ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  const contenedorAviso = el('div');
  const botonEnviar = el('button', { type: 'submit', class: 'boton boton-primario boton-ancho-completo' }, 'Ingresar');
  const pistaOlvido = el('p', { class: 'campo-ayuda' }, '¿Olvidaste tu contraseña? Pídele a Administración que revise tu cuenta.');
  pistaOlvido.hidden = true;

  const form = el('form', { novalidate: true },
    contenedorAviso,
    el('div', { class: 'campo' },
      el('label', { for: 'correo' }, 'Correo'),
      campoCorreo,
      errorCorreo,
    ),
    el('div', { class: 'campo' },
      el('label', { for: 'contrasena' }, 'Contraseña'),
      el('div', { class: 'campo-contrasena' }, campoContrasena, botonMostrar),
      errorContrasena,
    ),
    botonEnviar,
    pistaOlvido,
  );

  function marcarError(input, nodoError, mensaje) {
    input.setAttribute('aria-invalid', 'true');
    nodoError.textContent = mensaje;
    nodoError.hidden = false;
  }

  function limpiarErroresCampo() {
    for (const [input, nodoError] of [[campoCorreo, errorCorreo], [campoContrasena, errorContrasena]]) {
      input.removeAttribute('aria-invalid');
      nodoError.hidden = true;
    }
  }

  function mostrarAviso(tipo, mensaje) {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso(tipo, mensaje));
  }

  function mostrarAvisoConReintentar() {
    vaciar(contenedorAviso);
    const nodo = aviso('error', 'No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.');
    const boton = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Reintentar');
    boton.addEventListener('click', () => form.requestSubmit());
    nodo.appendChild(boton);
    contenedorAviso.appendChild(nodo);
  }

  function iniciarBloqueoTemporal(segundos) {
    botonEnviar.disabled = true;
    botonEnviar.textContent = 'Ingresar';
    vaciar(contenedorAviso);
    const nodo = el('div', { class: 'aviso aviso-error', role: 'alert', tabindex: '-1' });
    contenedorAviso.appendChild(nodo);
    nodo.focus();
    temporizadorCuentaRegresiva = iniciarCuentaRegresiva(nodo, segundos, () => {
      temporizadorCuentaRegresiva = null;
      botonEnviar.disabled = false;
      botonEnviar.textContent = 'Ingresar';
      vaciar(contenedorAviso);
    });
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErroresCampo();
    vaciar(contenedorAviso);

    const correo = campoCorreo.value.trim();
    const contrasena = campoContrasena.value;
    let valido = true;
    if (!correo) { marcarError(campoCorreo, errorCorreo, 'Ingresa tu correo.'); valido = false; }
    else if (!CORREO_PATRON.test(correo)) { marcarError(campoCorreo, errorCorreo, 'Ingresa un correo con formato válido.'); valido = false; }
    if (!contrasena) { marcarError(campoContrasena, errorContrasena, 'Ingresa tu contraseña.'); valido = false; }
    if (!valido) return;

    botonEnviar.disabled = true;
    botonEnviar.textContent = 'Ingresando…';
    try {
      await api.post('/auth/login', { correo, contrasena });
      const sesion = await api.get('/auth/sesion');
      guardarSesion(sesion);
      irA('#/');
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        intentosFallidos += 1;
        mostrarAviso('error', 'Correo o contraseña incorrectos. Si fallas 5 veces, tu cuenta se bloquea 15 minutos por seguridad.');
        if (intentosFallidos >= 2) pistaOlvido.hidden = false;
      } else if (err instanceof ApiError && err.status === 429) {
        iniciarBloqueoTemporal(err.retryAfter || 60);
      } else if (err instanceof ApiError && err.status === 400) {
        mostrarAviso('error', 'Revisa el correo y la contraseña ingresados.');
      } else {
        mostrarAvisoConReintentar();
      }
    } finally {
      if (!temporizadorCuentaRegresiva) {
        botonEnviar.disabled = false;
        botonEnviar.textContent = 'Ingresar';
      }
    }
  });

  if (consumirBanderaSesionExpirada()) {
    contenedorAviso.appendChild(aviso('info', 'Tu sesión expiró. Ingresa de nuevo.'));
  }

  const seccionMfa = el('p', { class: 'mfa-proximamente' },
    el('span', { class: 'chip chip-neutro' }, 'Próximamente'), ' verificación en dos pasos para Administración y Producción.',
  );

  main.appendChild(
    el('section', { class: 'pantalla-ingreso' },
      el('div', { class: 'tarjeta tarjeta-ingreso' },
        el('h1', {}, 'SST Kotoduo'),
        el('p', { class: 'subtitulo' }, 'Ingresa con tu cuenta de la empresa.'),
        form,
      ),
      seccionMfa,
    ),
  );
  campoCorreo.focus();
}
