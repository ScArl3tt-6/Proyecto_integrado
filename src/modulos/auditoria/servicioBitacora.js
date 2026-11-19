'use strict';

// Registro de auditoría en la base documental (RNF-03). Solo inserción: no existe ruta de edición ni borrado.
function crearServicioBitacora(mongoDb, pg) {
  const coleccion = mongoDb.collection('bitacora_eventos');

  async function registrar({ tipo, usuario, entidad, detalle = {}, ip }) {
    await coleccion.insertOne({
      tipo,
      usuario: usuario ? { id: usuario.id, rol: usuario.rol } : null,
      entidad,
      detalle,
      ip: ip || null,
      fecha: new Date(),
    });
  }

  // Junta el nombre real (PostgreSQL) de cada usuario.id, y el nombre del material cuando el
  // detalle trae un idMaterial (MATERIAL_REGISTRADO): la bitácora en Mongo solo guarda ids (nunca
  // nombres, para no duplicarlos ni dejarlos desactualizados si cambian); se resuelve al leer, no
  // al escribir. Punto 1 de la revisión del equipo, 18-11-2026 ("detalle útil").
  async function enriquecer(eventos) {
    const idsUsuario = [...new Set(eventos.map((e) => e.usuario?.id).filter((id) => id !== null && id !== undefined))];
    const idsMaterial = [...new Set(eventos.map((e) => e.detalle?.idMaterial).filter((id) => id !== null && id !== undefined))];
    const [usuarios, materiales] = await Promise.all([
      idsUsuario.length ? pg.query('SELECT id_usuario, nombre FROM usuario WHERE id_usuario = ANY($1::int[])', [idsUsuario]) : { rows: [] },
      idsMaterial.length ? pg.query('SELECT id_material, nombre, unidad FROM material WHERE id_material = ANY($1::int[])', [idsMaterial]) : { rows: [] },
    ]);
    const nombresUsuario = Object.fromEntries(usuarios.rows.map((r) => [r.id_usuario, r.nombre]));
    const nombresMaterial = Object.fromEntries(materiales.rows.map((r) => [r.id_material, { nombre: r.nombre, unidad: r.unidad }]));
    return eventos.map((e) => ({
      ...e,
      usuario: e.usuario ? { ...e.usuario, nombre: nombresUsuario[e.usuario.id] || null } : null,
      detalle: e.detalle?.idMaterial ? { ...e.detalle, material: nombresMaterial[e.detalle.idMaterial] || null } : e.detalle,
    }));
  }

  async function consultarPorTrabajo(codigo) {
    const eventos = await coleccion
      .find({ 'entidad.codigo': String(codigo) }, { projection: { _id: 0, ip: 0 } })
      .sort({ fecha: 1 })
      .limit(200)
      .toArray();
    return enriquecer(eventos);
  }

  // Últimos eventos de cualquier trabajo, para que "Bitácora" muestre algo por defecto en vez de
  // obligar a elegir un trabajo primero (punto 1 de la revisión del equipo, 18-11-2026).
  async function consultarRecientes(limite = 30) {
    const eventos = await coleccion
      .find({ 'entidad.tipo': 'trabajo' }, { projection: { _id: 0, ip: 0 } })
      .sort({ fecha: -1 })
      .limit(limite)
      .toArray();
    return enriquecer(eventos);
  }

  // Último acceso exitoso por usuario, para la lista de cuentas de Administración (no existe esa columna en PostgreSQL)
  async function ultimosAccesos(idsUsuarios) {
    if (!idsUsuarios.length) return {};
    const eventos = await coleccion.aggregate([
      { $match: { tipo: 'ACCESO_EXITOSO', 'usuario.id': { $in: idsUsuarios } } },
      { $group: { _id: '$usuario.id', ultima: { $max: '$fecha' } } },
    ]).toArray();
    return Object.fromEntries(eventos.map((e) => [e._id, e.ultima]));
  }

  return { registrar, consultarPorTrabajo, consultarRecientes, ultimosAccesos };
}

module.exports = { crearServicioBitacora };
