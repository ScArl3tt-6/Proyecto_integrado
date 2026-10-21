// Espejo en el cliente de src/dominio/permisos.js, solo para decidir qué mostrar en el menú y
// en las rutas internas. No es una medida de seguridad: el servidor sigue siendo la autoridad y
// rechaza con 403 aunque alguien fuerce la ruta o la llamada a la API.
const PERMISOS = {
  ADMINISTRADOR: ['PANEL_VER', 'USUARIO_GESTIONAR', 'TRABAJO_VER_TODOS', 'TRABAJO_DETENER', 'AUDITORIA_VER', 'MATERIAL_VER'],
  PRODUCCION: ['PANEL_VER', 'TRABAJO_VER_TODOS', 'DISENO_VER', 'DISENO_APROBAR', 'TRABAJO_DETENER', 'MATERIAL_VER'],
  DISENO: ['TRABAJO_VER_DISENO', 'DISENO_VER', 'DISENO_ENVIAR', 'MATERIAL_VER'],
  VENDEDOR: ['TRABAJO_CREAR', 'TRABAJO_VER_PROPIOS'],
  OPERARIO: ['TRABAJO_VER_AREA', 'ETAPA_AVANZAR', 'MATERIAL_VER'],
};

export function tienePermiso(rol, permiso) {
  return (PERMISOS[rol] || []).includes(permiso);
}

export function tieneAlgunPermiso(rol, permisos) {
  return permisos.some((p) => tienePermiso(rol, p));
}

// Destino principal al ingresar, y los ítems del menú de navegación por rol
export const INICIO_POR_ROL = {
  VENDEDOR: '#/mis-solicitudes',
  DISENO: '#/bandeja-diseno',
  PRODUCCION: '#/aprobaciones',
  OPERARIO: '#/mis-actividades',
  ADMINISTRADOR: '#/panel',
};

// Nombre de pantalla para cada rol (el servidor usa el valor sin tilde; aquí solo se muestra)
export const ROL_TEXTO = {
  ADMINISTRADOR: 'Administrador',
  PRODUCCION: 'Producción',
  DISENO: 'Diseño',
  VENDEDOR: 'Vendedor',
  OPERARIO: 'Operario',
};

// Áreas que tienen sentido para cada rol, para que el formulario no deje armar combinaciones
// absurdas (por ejemplo Diseño con área Administración). El servidor no exige esta relación,
// así que esto es una ayuda de la interfaz, no un control de seguridad.
export const AREAS_POR_ROL = {
  ADMINISTRADOR: ['Administración'],
  PRODUCCION: [],
  DISENO: ['Diseño'],
  VENDEDOR: ['Ventas'],
  OPERARIO: ['Bordado', 'Sublimación', 'Letreros', 'Grabado', 'Impresión gran formato'],
};

export const MENU_POR_ROL = {
  VENDEDOR: [
    { ruta: '#/mis-solicitudes', texto: 'Mis solicitudes' },
    { ruta: '#/nueva-solicitud', texto: 'Nueva solicitud' },
  ],
  DISENO: [
    { ruta: '#/bandeja-diseno', texto: 'Bandeja de diseño' },
  ],
  PRODUCCION: [
    { ruta: '#/aprobaciones', texto: 'Aprobaciones' },
    { ruta: '#/panel', texto: 'Panel general' },
  ],
  OPERARIO: [
    { ruta: '#/mis-actividades', texto: 'Mis actividades' },
  ],
  ADMINISTRADOR: [
    { ruta: '#/panel', texto: 'Panel general' },
    { ruta: '#/usuarios', texto: 'Usuarios' },
    { ruta: '#/bitacora', texto: 'Bitácora' },
  ],
};
