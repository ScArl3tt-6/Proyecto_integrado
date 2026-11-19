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

  // Punto 5 de la revisión del equipo (19-11-2026): novedades para Vendedor y Diseño, a partir de
  // eventos que YA existen (sin servicios nuevos ni correo): cuando una solicitud propia se
  // rechaza, se aprueba, cambia de etapa o termina. Diseño, en particular, pierde acceso al detalle
  // del trabajo apenas envía la propuesta (ver DEF-29): esta es, en la práctica, la única forma que
  // le queda de enterarse de si fue aprobada o rechazada.
  async function consultarNovedades(usuario) {
    let condicion;
    if (usuario.rol === 'VENDEDOR') {
      const { rows } = await pg.query('SELECT codigo FROM trabajo WHERE id_vendedor = $1', [usuario.id]);
      const codigos = rows.map((r) => r.codigo);
      condicion = { 'entidad.tipo': 'trabajo', 'entidad.codigo': { $in: codigos }, tipo: { $in: ['DISENO_APROBADO', 'DISENO_RECHAZADO', 'ETAPA_COMPLETADA'] } };
    } else if (usuario.rol === 'DISENO') {
      const { rows } = await pg.query(
        `SELECT d.id_diseno, t.codigo FROM diseno d JOIN trabajo t ON t.id_trabajo = d.id_trabajo WHERE d.id_disenador = $1`,
        [usuario.id],
      );
      const idsDiseno = rows.map((r) => r.id_diseno);
      const codigos = [...new Set(rows.map((r) => r.codigo))];
      condicion = {
        $or: [
          { tipo: { $in: ['DISENO_APROBADO', 'DISENO_RECHAZADO'] }, 'detalle.idDiseno': { $in: idsDiseno } },
          { tipo: 'ETAPA_COMPLETADA', 'detalle.trabajoTerminado': true, 'entidad.codigo': { $in: codigos } },
        ],
      };
    } else {
      return { noVistas: 0, eventos: [] };
    }

    const { rows: [{ novedades_vistas_en: vistasEn }] } = await pg.query('SELECT novedades_vistas_en FROM usuario WHERE id_usuario = $1', [usuario.id]);
    const eventos = await coleccion.find(condicion, { projection: { _id: 0, ip: 0 } }).sort({ fecha: -1 }).limit(30).toArray();
    const noVistas = eventos.filter((e) => e.fecha > vistasEn).length;
    return { noVistas, eventos: await enriquecer(eventos) };
  }

  async function marcarNovedadesVistas(usuario) {
    await pg.query('UPDATE usuario SET novedades_vistas_en = now() WHERE id_usuario = $1', [usuario.id]);
  }

  return { registrar, consultarPorTrabajo, consultarRecientes, ultimosAccesos, consultarNovedades, marcarNovedadesVistas };
}

module.exports = { crearServicioBitacora };
