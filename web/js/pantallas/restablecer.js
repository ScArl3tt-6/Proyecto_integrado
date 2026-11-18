import { api, ApiError } from '../api.js';
import { el, vaciar, aviso, iniciarCuentaRegresiva, etiquetaCampo, describirErrorApi } from '../ui.js';
import { leyendaObligatorios } from '../componentes.js';

const CAMPOS = { nueva: 'Contraseña nueva' };

function campoContrasena(id, texto) {
  const input = el('input', { id, type: 'password', autocomplete: 'new-password', required: true, minlength: 12 });
  const contenedor = el('div', { class: 'campo' }, etiquetaCampo(texto, { for: id }), input);
  return { input, contenedor };
}

// Pantalla pública (sin sesión): se llega aquí desde el enlace que generó Administración.
// No valida el token por separado antes de mostrar el formulario (evita un segundo punto donde
// alguien pueda tantear tokens); el resultado se sabe recién al guardar.
export function renderRestablecer(main, irA, token) {
  let temporizador = null;

  const { input: nueva, contenedor: contenedorNueva } = campoContrasena('restablecer-nueva', 'Contraseña nueva');
  const { input: repetir, contenedor: contenedorRepetir } = campoContrasena('restablecer-repetir', 'Repetir contraseña nueva');

  const contenedorAviso = el('div');
  const boton = el('button', { type: 'submit', class: 'boton boton-primario boton-ancho-completo' }, 'Guardar contraseña nueva');

  function mostrarError(mensaje) {
    vaciar(contenedorAviso);
    contenedorAviso.appendChild(aviso('error', mensaje));
  }

  const form = el('form', { novalidate: true },
    contenedorAviso,
    leyendaObligatorios(),
    contenedorNueva,
    contenedorRepetir,
    boton,
  );

  const botonIngresar = el('button', { type: 'button', class: 'boton boton-primario boton-ancho-completo' }, 'Ir a Ingresar');
  botonIngresar.addEventListener('click', () => irA('#/ingreso'));
  const estadoListo = el('div', { class: 'tarjeta' },
    aviso('exito', 'Contraseña actualizada. Ya puedes ingresar con tu contraseña nueva.'),
    botonIngresar,
  );
  estadoListo.hidden = true;

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    vaciar(contenedorAviso);

    const valorNueva = nueva.value;
    const valorRepetir = repetir.value;
    if (valorNueva.length < 12) return mostrarError('La contraseña nueva debe tener al menos 12 caracteres.');
    if (valorNueva !== valorRepetir) return mostrarError('Las contraseñas nuevas no coinciden.');

    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      await api.post('/auth/restablecer', { token, nueva: valorNueva });
      form.hidden = true;
      estadoListo.hidden = false;
      botonIngresar.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.cuerpo?.motivo === 'TOKEN_INVALIDO') {
        mostrarError('Este enlace ya no es válido: venció, ya se usó o no existe. Pídele a Administración que te genere uno nuevo.');
      } else if (err instanceof ApiError && err.status === 400) {
        mostrarError(describirErrorApi(err, CAMPOS, 'La contraseña nueva no cumple la política.'));
      } else if (err instanceof ApiError && err.status === 429) {
        vaciar(contenedorAviso);
        const nodo = el('div', { class: 'aviso aviso-error', role: 'alert', tabindex: '-1' });
        contenedorAviso.appendChild(nodo);
        nodo.focus();
        temporizador = iniciarCuentaRegresiva(nodo, err.retryAfter || 60, () => {
          temporizador = null;
          boton.disabled = false;
          boton.textContent = 'Guardar contraseña nueva';
          vaciar(contenedorAviso);
        });
        return;
      } else {
        mostrarError('No pudimos conectar con el sistema. Revisa tu conexión e inténtalo otra vez.');
      }
    } finally {
      if (!temporizador) {
        boton.disabled = false;
        boton.textContent = 'Guardar contraseña nueva';
      }
    }
  });

  main.appendChild(
    el('section', { class: 'pantalla-ingreso' },
      el('div', { class: 'tarjeta tarjeta-ingreso' },
        el('h1', {}, 'Crear una contraseña nueva'),
        el('p', { class: 'subtitulo' }, 'Al menos 12 caracteres (se aceptan frases largas). Evita tu nombre, tu correo, «kotoduo», contraseñas comunes o secuencias.'),
        form,
        estadoListo,
      ),
    ),
  );
  nueva.focus();
}
