'use strict';

// Matriz de autorización RBAC. Todo lo que no está listado se deniega (denegación por defecto).
const PERMISOS = new Map(Object.entries({
  ADMINISTRADOR: ['PANEL_VER', 'USUARIO_GESTIONAR', 'TRABAJO_VER_TODOS', 'TRABAJO_DETENER', 'AUDITORIA_VER', 'MATERIAL_VER', 'ETAPA_LIBERAR'],
  PRODUCCION: ['PANEL_VER', 'TRABAJO_VER_TODOS', 'DISENO_VER', 'DISENO_APROBAR', 'TRABAJO_DETENER', 'MATERIAL_VER', 'MATERIAL_REGISTRAR', 'ETAPA_AVANZAR', 'ETAPA_LIBERAR'],
  DISENO: ['TRABAJO_VER_DISENO', 'DISENO_VER', 'DISENO_ENVIAR', 'MATERIAL_VER', 'NOVEDADES_VER'],
  VENDEDOR: ['TRABAJO_CREAR', 'TRABAJO_VER_PROPIOS', 'NOVEDADES_VER'],
  OPERARIO: ['TRABAJO_VER_AREA', 'ETAPA_AVANZAR', 'ETAPA_LIBERAR', 'MATERIAL_VER'],
}));

function tienePermiso(rol, permiso) {
  return PERMISOS.get(rol)?.includes(permiso) === true;
}

module.exports = { PERMISOS, tienePermiso };
