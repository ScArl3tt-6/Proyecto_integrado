import { api } from './api.js';
import { el, vaciar } from './ui.js';
import {
  obtenerSesion, guardarSesion, limpiarSesion,
  marcarSesionExpirada, cerrarSesion, iniciarVigilanciaInactividad,
} from './estado.js';
import { tieneAlgunPermiso, INICIO_POR_ROL, MENU_POR_ROL, ROL_TEXTO } from './permisos.js';
import { renderIngreso } from './pantallas/ingreso.js';
import { renderCuenta } from './pantallas/cuenta.js';
import { renderProhibido, renderNoEncontrado } from './pantallas/errores.js';
import { renderMisSolicitudes, renderNuevaSolicitud } from './pantallas/vendedor.js';
import { renderDetalleTrabajo } from './pantallas/detalleTrabajo.js';
import { renderBandejaDiseno, renderEnviarPropuesta } from './pantallas/diseno.js';
import { renderAprobaciones, renderDecidirDiseno } from './pantallas/produccion.js';
import { renderMisActividades } from './pantallas/operario.js';
import { renderPanel } from './pantallas/panel.js';
import { renderUsuarios, renderBitacora } from './pantallas/admin.js';

const main = document.getElementById('app');
const cabecera = document.getElementById('cabecera');
const navPrincipal = document.getElementById('nav-principal');
const textoUsuario = document.getElementById('texto-usuario');
const botonSalir = document.getElementById('boton-salir');

const RUTAS_PUBLICAS = new Set(['#/ingreso']);

// Tabla de rutas: permiso null = cualquier sesión válida. "parametros" extrae los valores de la URL.
const RUTAS = [
  { patron: '#/mis-solicitudes', permiso: ['TRABAJO_VER_PROPIOS'], render: (m, s) => renderMisSolicitudes(m, s, irA) },
  { patron: '#/nueva-solicitud', permiso: ['TRABAJO_CREAR'], render: (m, s) => renderNuevaSolicitud(m, s, irA) },
  { patron: '#/trabajos/:codigo', permiso: ['TRABAJO_VER_PROPIOS', 'TRABAJO_VER_DISENO', 'TRABAJO_VER_TODOS'], render: (m, s, p) => renderDetalleTrabajo(m, s, p.codigo) },
  { patron: '#/bandeja-diseno', permiso: ['DISENO_ENVIAR'], render: (m, s) => renderBandejaDiseno(m, s, irA) },
  { patron: '#/disenos/:codigo/enviar', permiso: ['DISENO_ENVIAR'], render: (m, s, p) => renderEnviarPropuesta(m, s, p.codigo, irA) },
  { patron: '#/aprobaciones', permiso: ['DISENO_APROBAR'], render: (m, s) => renderAprobaciones(m, s, irA) },
  { patron: '#/disenos/:idDiseno', permiso: ['DISENO_APROBAR'], render: (m, s, p) => renderDecidirDiseno(m, s, p.idDiseno, irA) },
  { patron: '#/mis-actividades', permiso: ['TRABAJO_VER_AREA'], render: (m, s) => renderMisActividades(m, s, irA) },
  { patron: '#/panel', permiso: ['PANEL_VER'], render: (m, s) => renderPanel(m, s, irA) },
  { patron: '#/usuarios', permiso: ['USUARIO_GESTIONAR'], render: (m, s) => renderUsuarios(m, s, irA) },
  { patron: '#/bitacora', permiso: ['AUDITORIA_VER'], render: (m, s) => renderBitacora(m, s, irA) },
  { patron: '#/mi-cuenta', permiso: null, render: (m, s) => renderCuenta(m, s) },
];

function emparejar(patron, hash) {
  const partesPatron = patron.split('/');
  const partesHash = hash.split('/');
  if (partesPatron.length !== partesHash.length) return null;
  const parametros = {};
  for (let i = 0; i < partesPatron.length; i += 1) {
    if (partesPatron[i].startsWith(':')) parametros[partesPatron[i].slice(1)] = decodeURIComponent(partesHash[i]);
    else if (partesPatron[i] !== partesHash[i]) return null;
  }
  return parametros;
}

function irA(ruta) {
  location.hash = ruta;
}

function enfocarTitulo() {
  const titulo = main.querySelector('h1');
  if (titulo) {
    titulo.setAttribute('tabindex', '-1');
    titulo.focus();
  }
}

async function sesionVigente() {
  const cache = obtenerSesion();
  if (cache) return cache;
  try {
    const datos = await api.get('/auth/sesion');
    guardarSesion(datos);
    return datos;
  } catch {
    return null;
  }
}

function expirarSesion() {
  limpiarSesion();
  marcarSesionExpirada();
  if (location.hash === '#/ingreso') enrutar();
  else location.hash = '#/ingreso';
}

function pintarMenu(sesion) {
  vaciar(navPrincipal);
  navPrincipal.hidden = false;
  const hashActual = location.hash || '';
  for (const item of MENU_POR_ROL[sesion.rol] || []) {
    const enlace = el('a', { href: item.ruta, class: 'nav-item', 'aria-current': hashActual === item.ruta ? 'page' : undefined }, item.texto);
    navPrincipal.appendChild(enlace);
  }
}

async function enrutar() {
  const hash = location.hash || '#/ingreso';
  vaciar(main);

  if (RUTAS_PUBLICAS.has(hash)) {
    cabecera.hidden = true;
    navPrincipal.hidden = true;
    renderIngreso(main, irA);
    enfocarTitulo();
    return;
  }

  const sesion = await sesionVigente();
  if (!sesion) {
    cabecera.hidden = true;
    navPrincipal.hidden = true;
    irA('#/ingreso');
    return;
  }

  cabecera.hidden = false;
  textoUsuario.textContent = ROL_TEXTO[sesion.rol] || sesion.rol;
  pintarMenu(sesion);

  if (hash === '#/' || hash === '') {
    irA(INICIO_POR_ROL[sesion.rol] || '#/mi-cuenta');
    return;
  }

  for (const ruta of RUTAS) {
    const parametros = emparejar(ruta.patron, hash);
    if (!parametros) continue;
    if (ruta.permiso && !tieneAlgunPermiso(sesion.rol, ruta.permiso)) {
      renderProhibido(main);
      enfocarTitulo();
      return;
    }
    ruta.render(main, sesion, parametros);
    enfocarTitulo();
    return;
  }

  renderNoEncontrado(main);
  enfocarTitulo();
}

window.addEventListener('hashchange', enrutar);
window.addEventListener('sst:sesion-expirada', expirarSesion);
botonSalir.addEventListener('click', cerrarSesion);

iniciarVigilanciaInactividad(async () => {
  try { await api.post('/auth/logout', {}); } catch { /* se limpia igual */ }
  expirarSesion();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* la PWA sigue funcionando sin cache offline */ });
  });
}

enrutar();
