import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, iniciarCuentaRegresiva, etiquetaCampo } from '../ui.js';
import { leyendaObligatorios } from '../componentes.js';
import { guardarSesion, consumirBanderaSesionExpirada } from '../estado.js';

const CORREO_PATRON = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function renderIngreso(main, irA) {
  let intentosFallidos = 0;
  let temporizadorCuentaRegresiva = null;
  let desafioMfa = null;

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
  const pistaOlvido = el('p', { class: 'campo-ayuda' }, '¿Olvidaste tu contraseña? Pídele a Administración que te genere un enlace para crear una nueva (pantalla "Usuarios" → "Generar enlace"). Ábrelo apenas te lo entregue: vence en 30 minutos y sirve una sola vez.');
  pistaOlvido.hidden = true;

  const form = el('form', { novalidate: true },
    contenedorAviso,
    leyendaObligatorios(),
    el('div', { class: 'campo' },
      etiquetaCampo('Correo', { for: 'correo' }),
      campoCorreo,
      errorCorreo,
    ),
    el('div', { class: 'campo' },
      etiquetaCampo('Contraseña', { for: 'contrasena' }),
      el('div', { class: 'campo-contrasena' }, campoContrasena, botonMostrar),
      errorContrasena,
    ),
    botonEnviar,
    pistaOlvido,
  );

  // Segundo paso (solo si la cuenta tiene verificación en dos pasos activada): la contraseña ya
  // se validó; el "desafío" lo prueba sin crear todavía ninguna sesión.
  const contenedorAvisoMfa = el('div');
  const campoCodigoMfa = el('input', {
    id: 'codigo-mfa', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: 6, required: true, 'aria-describedby': 'codigo-mfa-error',
  });
  const errorCodigoMfa = el('p', { class: 'campo-error', id: 'codigo-mfa-error', role: 'alert' });
  errorCodigoMfa.hidden = true;
  const botonVerificarMfa = el('button', { type: 'submit', class: 'boton boton-primario boton-ancho-completo' }, 'Verificar');
  const botonVolverMfa = el('button', { type: 'button', class: 'boton boton-secundario boton-ancho-completo' }, 'Volver');
  let temporizadorMfa = null;

  const formMfa = el('form', { novalidate: true },
    contenedorAvisoMfa,
    el('p', {}, 'Escribe el código de 6 dígitos de tu aplicación de verificación.'),
    leyendaObligatorios(),
    el('div', { class: 'campo' },
      etiquetaCampo('Código de verificación', { for: 'codigo-mfa' }),
      campoCodigoMfa,
      errorCodigoMfa,
    ),
    botonVerificarMfa,
    botonVolverMfa,
  );
  formMfa.hidden = true;

  function mostrarPasoMfa(desafio) {
    desafioMfa = desafio;
    form.hidden = true;
    formMfa.hidden = false;
    campoCodigoMfa.value = '';
    campoCodigoMfa.focus();
  }

  function volverAlPaso1() {
    desafioMfa = null;
    temporizadorMfa = null;
    formMfa.hidden = true;
    form.hidden = false;
    vaciar(contenedorAvisoMfa);
    campoContrasena.value = '';
    campoContrasena.focus();
  }
  botonVolverMfa.addEventListener('click', volverAlPaso1);

  formMfa.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAvisoMfa);
    errorCodigoMfa.hidden = true;
    campoCodigoMfa.removeAttribute('aria-invalid');

    const codigo = campoCodigoMfa.value.trim();
    if (!/^\d{6}$/.test(codigo)) {
      campoCodigoMfa.setAttribute('aria-invalid', 'true');
      errorCodigoMfa.textContent = 'Escribe los 6 dígitos del código.';
      errorCodigoMfa.hidden = false;
      return;
    }

    botonVerificarMfa.disabled = true;
    botonVerificarMfa.textContent = 'Verificando…';
    try {
      await api.post('/auth/login/verificar', { desafio: desafioMfa, codigo });
      const sesion = await api.get('/auth/sesion');
      guardarSesion(sesion);
      irA('#/');
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        vaciar(contenedorAvisoMfa);
        contenedorAvisoMfa.appendChild(aviso('error', err.cuerpo?.error || 'Código incorrecto o vencido.'));
        campoCodigoMfa.value = '';
        campoCodigoMfa.focus();
      } else if (err instanceof ApiError && err.status === 429) {
        botonVerificarMfa.textContent = 'Verificar';
        vaciar(contenedorAvisoMfa);
        const nodo = el('div', { class: 'aviso aviso-error', role: 'alert', tabindex: '-1' });
        contenedorAvisoMfa.appendChild(nodo);
        nodo.focus();
        temporizadorMfa = iniciarCuentaRegresiva(nodo, err.retryAfter || 60, () => {
          temporizadorMfa = null;
          botonVerificarMfa.disabled = false;
          botonVerificarMfa.textContent = 'Verificar';
          vaciar(contenedorAvisoMfa);
        });
        return;
      } else {
        vaciar(contenedorAvisoMfa);
        const nodo = aviso('error', 'No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.');
        const botonReintentar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Reintentar');
        botonReintentar.addEventListener('click', () => formMfa.requestSubmit());
        nodo.appendChild(botonReintentar);
        contenedorAvisoMfa.appendChild(nodo);
      }
    } finally {
      if (!temporizadorMfa) {
        botonVerificarMfa.disabled = false;
        botonVerificarMfa.textContent = 'Verificar';
      }
    }
  });

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
      const resultado = await api.post('/auth/login', { correo, contrasena });
      if (resultado?.requiereMfa) {
        mostrarPasoMfa(resultado.desafio);
        return;
      }
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

  const sesionExpirada = consumirBanderaSesionExpirada();
  if (sesionExpirada) {
    const mensaje = sesionExpirada.motivo === 'INACTIVIDAD'
      ? 'Tu sesión se cerró por inactividad. Ingresa de nuevo.'
      : 'Tu sesión expiró. Ingresa de nuevo.';
    contenedorAviso.appendChild(aviso('info', mensaje));
  }

  main.appendChild(
    el('section', { class: 'pantalla-ingreso' },
      el('div', { class: 'tarjeta tarjeta-ingreso' },
        el('h1', {}, 'SST Kotoduo'),
        el('p', { class: 'subtitulo' }, 'Ingresa con tu cuenta de la empresa.'),
        form,
        formMfa,
      ),
    ),
  );
  campoCorreo.focus();
}
