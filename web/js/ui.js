// Helpers de interfaz: todo nodo se construye con DOM y texto plano, nunca con cadenas HTML.
const ATRIBUTOS_PERMITIDOS = new Set([
  'id', 'class', 'type', 'name', 'value', 'placeholder', 'for', 'href', 'src', 'alt', 'title', 'target', 'rel', 'role', 'tabindex',
  'aria-invalid', 'aria-describedby', 'aria-live', 'aria-label', 'aria-hidden', 'aria-current', 'aria-expanded', 'aria-controls',
  'autocomplete', 'disabled', 'required', 'minlength', 'maxlength', 'min', 'max', 'step', 'checked', 'open',
  'novalidate', 'method', 'accept', 'multiple', 'selected',
]);

export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (!ATRIBUTOS_PERMITIDOS.has(clave)) continue;
    nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.appendChild(typeof hijo === 'string' || typeof hijo === 'number' ? document.createTextNode(String(hijo)) : hijo);
  }
  return nodo;
}

// Etiqueta de un campo de formulario, con un asterisco visible (y anunciado a lectores de
// pantalla vía el atributo "required" del propio campo, no solo por el texto) cuando es
// obligatorio. Usar junto con leyendaObligatorios() (componentes.js) al principio del formulario.
export function etiquetaCampo(texto, { for: paraId, opcional = false } = {}) {
  if (opcional) return el('label', { for: paraId }, texto);
  return el('label', { for: paraId }, texto, el('span', { class: 'campo-obligatorio', 'aria-hidden': 'true' }, ' *'));
}

// Traduce una ApiError a un mensaje que diga, cuando se pueda saber, QUÉ campo falló, en vez de
// dejar el genérico "Datos de entrada inválidos" (o cualquier otro) como única pista. mapaCampos
// traduce el nombre técnico del campo (el que manda el servidor, por ejemplo "fechaCompromiso") a
// como se llama en esta pantalla (por ejemplo "Fecha comprometida").
export function describirErrorApi(err, mapaCampos = {}, generico = 'No pudimos guardar los datos. Inténtalo otra vez.') {
  const campos = err?.cuerpo?.campos;
  if (Array.isArray(campos) && campos.length) {
    const nombres = campos.map((c) => mapaCampos[c] || c);
    return `Revisa estos campos: ${nombres.join(', ')}.`;
  }
  return err?.cuerpo?.error || generico;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

export function aviso(tipo, mensaje) {
  const rol = tipo === 'error' ? 'alert' : 'status';
  return el('div', { class: `aviso aviso-${tipo}`, role: rol }, mensaje);
}

// Enlace "Volver" para las pantallas a las que se llega desde una lista (detalle, decidir, enviar)
export function enlaceVolver(ruta, texto = 'Volver') {
  return el('a', { class: 'enlace-volver', href: ruta }, '← ', texto);
}

// Cuenta regresiva compartida por el ingreso y el cambio de contraseña cuando llega un 429
export function iniciarCuentaRegresiva(contenedor, segundos, alTerminar) {
  let restantes = segundos;
  const pintar = () => {
    const mm = String(Math.floor(restantes / 60)).padStart(2, '0');
    const ss = String(restantes % 60).padStart(2, '0');
    vaciar(contenedor);
    contenedor.appendChild(el('p', {},
      'Demasiados intentos. Podrás volver a intentar en ',
      el('span', { class: 'cuenta-regresiva' }, `${mm}:${ss}`),
      '.',
    ));
  };
  pintar();
  const id = setInterval(() => {
    restantes -= 1;
    if (restantes <= 0) {
      clearInterval(id);
      alTerminar();
      return;
    }
    pintar();
  }, 1000);
  return id;
}

// Diálogo de confirmación para acciones irreversibles. <dialog>.showModal() ya atrapa el foco
// y el Escape dispara "cancel" de forma nativa, sin JavaScript adicional.
export function abrirDialogoConfirmacion({ titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    let resuelto = false;
    const terminar = (valor) => { resuelto = true; dialogo.close(); resolve(valor); };
    const botonCancelar = el('button', { type: 'button', class: 'boton boton-secundario' }, textoCancelar);
    botonCancelar.addEventListener('click', () => terminar(false));
    const botonConfirmar = el('button', { type: 'button', class: `boton ${peligro ? 'boton-peligro' : 'boton-primario'}` }, textoConfirmar);
    botonConfirmar.addEventListener('click', () => terminar(true));

    const dialogo = el('dialog', { class: 'dialogo' },
      el('h2', {}, titulo),
      el('p', {}, mensaje),
      el('div', { class: 'dialogo-acciones' }, botonCancelar, botonConfirmar),
    );
    dialogo.addEventListener('cancel', () => { if (!resuelto) resolve(false); });
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.appendChild(dialogo);
    dialogo.showModal();
    botonConfirmar.focus();
  });
}

// Diálogo con motivo obligatorio (rechazar diseño, detener trabajo), con sugerencias que rellenan el campo
export function abrirDialogoMotivo({ titulo, etiqueta = 'Motivo', minimo = 5, maximo = 300, sugerencias = [], textoConfirmar = 'Confirmar' }) {
  return new Promise((resolve) => {
    let resuelto = false;
    const campo = el('input', { type: 'text', id: 'motivo-dialogo', minlength: minimo, maxlength: maximo, required: true });
    const error = el('p', { class: 'campo-error', role: 'alert' });
    error.hidden = true;

    const sugerenciasNodo = sugerencias.length
      ? el('div', { class: 'sugerencias-motivo' }, ...sugerencias.map((texto) => {
        const boton = el('button', { type: 'button', class: 'boton boton-secundario boton-chip' }, texto);
        boton.addEventListener('click', () => { campo.value = texto; campo.focus(); });
        return boton;
      }))
      : null;

    const terminar = (valor) => { resuelto = true; dialogo.close(); resolve(valor); };
    const botonCancelar = el('button', { type: 'button', class: 'boton boton-secundario' }, 'Cancelar');
    botonCancelar.addEventListener('click', () => terminar(null));
    const botonConfirmar = el('button', { type: 'button', class: 'boton boton-primario' }, textoConfirmar);
    botonConfirmar.addEventListener('click', () => {
      const valor = campo.value.trim();
      if (valor.length < minimo) {
        campo.setAttribute('aria-invalid', 'true');
        error.textContent = `Escribe al menos ${minimo} caracteres.`;
        error.hidden = false;
        return;
      }
      terminar(valor);
    });

    const dialogo = el('dialog', { class: 'dialogo' },
      el('h2', {}, titulo),
      el('div', { class: 'campo' }, etiquetaCampo(etiqueta, { for: 'motivo-dialogo' }), campo, error),
      sugerenciasNodo,
      el('div', { class: 'dialogo-acciones' }, botonCancelar, botonConfirmar),
    );
    dialogo.addEventListener('cancel', () => { if (!resuelto) resolve(null); });
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.appendChild(dialogo);
    dialogo.showModal();
    campo.focus();
  });
}
