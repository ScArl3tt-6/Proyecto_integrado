'use strict';

// Catálogos de referencia (tipos de trabajo activos y áreas) para los formularios del front-end
function crearServicioCatalogos({ pg }) {
  async function obtener() {
    const [tipos, areas] = await Promise.all([
      pg.query('SELECT id_tipo, nombre FROM tipo_trabajo WHERE activo ORDER BY nombre'),
      pg.query('SELECT id_area, nombre FROM area ORDER BY nombre'),
    ]);
    return { tipos: tipos.rows, areas: areas.rows };
  }

  return { obtener };
}

module.exports = { crearServicioCatalogos };
