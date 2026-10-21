// Estado de sesión en memoria (solo para esta pestaña y mientras dura la página): nunca en
// localStorage, sessionStorage ni en el DOM. Los tokens los maneja el servidor con cookies HttpOnly.
import { api } from './api.js';

let sesionActual = null;
let banderaSesionExpirada = false;

export function obtenerSesion() {
  return sesionActual;
}

export function guardarSesion(datos) {
  sesionActual = datos;
}

export function limpiarSesion() {
  sesionActual = null;
}

export function marcarSesionExpirada() {
  banderaSesionExpirada = true;
}

// Se consume una sola vez, para que el aviso solo aparezca en la primera pantalla de ingreso tras expirar
export function consumirBanderaSesionExpirada() {
  const valor = banderaSesionExpirada;
  banderaSesionExpirada = false;
  return valor;
}

export async function cerrarSesion() {
  try {
    await api.post('/auth/logout', {});
  } catch {
    // se limpia el estado local de todas formas
  }
  limpiarSesion();
  location.hash = '#/ingreso';
}

// Cierre por inactividad (solo UX; el servidor sigue expirando la sesión por su cuenta a las 8 horas)
const LIMITE_INACTIVIDAD_MS = 30 * 60 * 1000;
let temporizadorInactividad = null;

export function iniciarVigilanciaInactividad(alExpirar) {
  const reiniciar = () => {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(alExpirar, LIMITE_INACTIVIDAD_MS);
  };
  ['click', 'keydown', 'pointerdown', 'scroll'].forEach((evento) => {
    window.addEventListener(evento, reiniciar, { passive: true });
  });
  reiniciar();
}
