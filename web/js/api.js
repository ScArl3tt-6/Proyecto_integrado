// Cliente único de la API: agrega el CSRF, reintenta una vez con renovación ante un 401
// y nunca guarda tokens fuera de las cookies HttpOnly que gestiona el servidor.

// Rutas donde un 401 es una respuesta de negocio (credenciales o contraseña actual incorrectas),
// no una sesión expirada: en estas nunca se intenta renovar.
const RUTAS_SIN_RENOVACION = new Set(['/auth/login', '/auth/renovar', '/auth/cambiar-contrasena']);

export class ApiError extends Error {
  constructor(status, cuerpo, retryAfter) {
    super(cuerpo?.error || 'Error de la API');
    this.status = status;
    this.cuerpo = cuerpo;
    this.retryAfter = retryAfter;
  }
}

function leerCookie(nombre) {
  const coincidencia = document.cookie.match(`(?:^|; )${nombre}=([^;]*)`);
  return coincidencia ? decodeURIComponent(coincidencia[1]) : null;
}

async function intentarRenovar() {
  try {
    const csrf = leerCookie('sst_csrf');
    const respuesta = await fetch('/api/auth/renovar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    return respuesta.status === 204;
  } catch {
    return false;
  }
}

async function solicitud(metodo, ruta, cuerpo, { reintentando = false } = {}) {
  const opciones = {
    method: metodo,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  };
  if (metodo !== 'GET') {
    const csrf = leerCookie('sst_csrf');
    if (csrf) opciones.headers['X-CSRF-Token'] = csrf;
  }
  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);

  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, opciones);
  } catch {
    throw new ApiError(0, { error: 'Sin conexión' });
  }

  if (respuesta.status === 204) return null;

  const tipo = respuesta.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await respuesta.json().catch(() => null) : null;

  if (respuesta.ok) return datos;

  if (respuesta.status === 401 && !RUTAS_SIN_RENOVACION.has(ruta)) {
    if (!reintentando) {
      const renovada = await intentarRenovar();
      if (renovada) return solicitud(metodo, ruta, cuerpo, { reintentando: true });
    }
    window.dispatchEvent(new CustomEvent('sst:sesion-expirada'));
  }

  const retryAfter = Number(respuesta.headers.get('retry-after')) || undefined;
  throw new ApiError(respuesta.status, datos, retryAfter);
}

export const api = {
  get: (ruta) => solicitud('GET', ruta),
  post: (ruta, cuerpo) => solicitud('POST', ruta, cuerpo),
  patch: (ruta, cuerpo) => solicitud('PATCH', ruta, cuerpo),
};
