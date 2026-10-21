'use strict';

// Registro de auditoría en la base documental (RNF-03). Solo inserción: no existe ruta de edición ni borrado.
function crearServicioBitacora(mongoDb) {
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

  async function consultarPorTrabajo(codigo) {
    return coleccion
      .find({ 'entidad.codigo': String(codigo) }, { projection: { _id: 0, ip: 0 } })
      .sort({ fecha: 1 })
      .limit(200)
      .toArray();
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

  return { registrar, consultarPorTrabajo, ultimosAccesos };
}

module.exports = { crearServicioBitacora };
