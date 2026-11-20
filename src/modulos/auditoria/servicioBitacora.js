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

  // Junta el nombre real (PostgreSQL) de cada usuario.id, el nombre del material cuando el detalle
  // trae un idMaterial (MATERIAL_REGISTRADO), y el nombre de la etapa cuando trae un orden
  // (ETAPA_INICIADA/COMPLETADA/LIBERADA): la bitácora en Mongo solo guarda ids/números (nunca
  // nombres, para no duplicarlos ni dejarlos desactualizados si cambian); se resuelve al leer, no
  // al escribir. Punto 1 de la revisión del equipo, 18-11-2026 ("detalle útil"); el de la etapa se
  // agregó el 20-11-2026 porque solo se resolvía cuando quien llamaba ya tenía a mano las etapas
  // de ESE trabajo (el detalle de un trabajo, o la Bitácora ya filtrada a uno): en la vista general
  // (varios trabajos a la vez, con tipos distintos) y en el historial de "Mis actividades" seguía
  // mostrando "Etapa n.º 2" en vez del nombre real.
  async function enriquecer(eventos) {
    const idsUsuario = [...new Set(eventos.map((e) => e.usuario?.id).filter((id) => id !== null && id !== undefined))];
    const idsMaterial = [...new Set(eventos.map((e) => e.detalle?.idMaterial).filter((id) => id !== null && id !== undefined))];
    const codigosConEtapa = [...new Set(
      eventos.filter((e) => e.entidad?.tipo === 'trabajo' && e.detalle?.orden !== null && e.detalle?.orden !== undefined)
        .map((e) => e.entidad.codigo),
    )];
    const [usuarios, materiales, etapas] = await Promise.all([
      idsUsuario.length ? pg.query('SELECT id_usuario, nombre FROM usuario WHERE id_usuario = ANY($1::int[])', [idsUsuario]) : { rows: [] },
      idsMaterial.length ? pg.query('SELECT id_material, nombre, unidad FROM material WHERE id_material = ANY($1::int[])', [idsMaterial]) : { rows: [] },
      codigosConEtapa.length
        ? pg.query(
            `SELECT t.codigo, ep.orden, ep.nombre
               FROM trabajo t
               JOIN etapa_plantilla ep ON ep.id_tipo = t.id_tipo
              WHERE t.codigo = ANY($1::text[])`,
            [codigosConEtapa],
          )
        : { rows: [] },
    ]);
    const nombresUsuario = Object.fromEntries(usuarios.rows.map((r) => [r.id_usuario, r.nombre]));
    const nombresMaterial = Object.fromEntries(materiales.rows.map((r) => [r.id_material, { nombre: r.nombre, unidad: r.unidad }]));
    const nombresEtapa = Object.fromEntries(etapas.rows.map((r) => [`${r.codigo}:${r.orden}`, r.nombre]));
    return eventos.map((e) => {
      let detalle = e.detalle;
      if (detalle?.idMaterial) detalle = { ...detalle, material: nombresMaterial[detalle.idMaterial] || null };
      if (e.entidad?.tipo === 'trabajo' && detalle?.orden !== null && detalle?.orden !== undefined) {
        detalle = { ...detalle, nombreEtapa: nombresEtapa[`${e.entidad.codigo}:${detalle.orden}`] || null };
      }
      return { ...e, usuario: e.usuario ? { ...e.usuario, nombre: nombresUsuario[e.usuario.id] || null } : null, detalle };
    });
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
  // del trabajo apenas envía la propuesta (ver DEF-29/DEF-42): esta es, en la práctica, la única forma que
  // le queda de enterarse de si fue aprobada o rechazada.
  // Paginado ("Cargar más") y marca de leída por evento agregados en la segunda vuelta del punto 3
  // de la revisión del equipo (20-11-2026): con pocas novedades alcanzaba con traerlas todas de una
  // vez, pero con muchas hacía falta poder seguir cargando, filtrar por leídas/no leídas, y agrupar
  // por día en el cliente (para eso cada evento necesita saber si ya se vio, no solo el total).
  async function consultarNovedades(usuario, { pagina = 1, limite = 20 } = {}) {
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
      return { noVistas: 0, total: 0, eventos: [] };
    }

    const { rows: [{ novedades_vistas_en: vistasEn }] } = await pg.query('SELECT novedades_vistas_en FROM usuario WHERE id_usuario = $1', [usuario.id]);
    // "nunca visitada" llega de PostgreSQL como el número -Infinity, no como un Date (un TIMESTAMPTZ
    // '-infinity' no es representable como fecha de JavaScript): para comparar fechas de Mongo contra
    // esto (tanto en la consulta como en JS) hace falta una fecha real, nunca ese número especial.
    const umbralVistas = vistasEn instanceof Date ? vistasEn : new Date(0);
    const [total, noVistas, eventos] = await Promise.all([
      coleccion.countDocuments(condicion),
      coleccion.countDocuments({ $and: [condicion, { fecha: { $gt: umbralVistas } }] }),
      coleccion.find(condicion, { projection: { _id: 0, ip: 0 } }).sort({ fecha: -1 }).skip((pagina - 1) * limite).limit(limite).toArray(),
    ]);
    const enriquecidos = await enriquecer(eventos);
    return { noVistas, total, eventos: enriquecidos.map((e) => ({ ...e, leida: e.fecha <= umbralVistas })) };
  }

  async function marcarNovedadesVistas(usuario) {
    await pg.query('UPDATE usuario SET novedades_vistas_en = now() WHERE id_usuario = $1', [usuario.id]);
  }

  return { registrar, consultarPorTrabajo, consultarRecientes, ultimosAccesos, consultarNovedades, marcarNovedadesVistas };
}

module.exports = { crearServicioBitacora };
