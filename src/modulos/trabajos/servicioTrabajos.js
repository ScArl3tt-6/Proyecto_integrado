'use strict';
const { ErrorNegocio } = require('../../dominio/errores');
const { validarTransicion, estaAtrasado } = require('../../dominio/flujoTrabajo');

function crearServicioTrabajos({ pg, bitacora }) {
  // HU-01 / RF-01: registrar solicitud. Solo datos productivos (sin contacto de cliente ni pagos).
  async function registrarSolicitud(usuario, { idTipo, descripcion, cantidad, fechaCompromiso }) {
    const tipo = await pg.query('SELECT id_tipo FROM tipo_trabajo WHERE id_tipo = $1 AND activo', [idTipo]);
    if (!tipo.rows[0]) throw new ErrorNegocio('Tipo de trabajo no válido', 400);

    const trabajo = await pg.transaction(async (tx) => {
      const anio = new Date().getFullYear();
      const { rows: [{ n }] } = await tx.query(
        'SELECT COUNT(*)::int + 1 AS n FROM trabajo WHERE codigo LIKE $1', [`KT-${anio}-%`],
      );
      const codigo = `KT-${anio}-${String(n).padStart(4, '0')}`;
      const { rows } = await tx.query(
        `INSERT INTO trabajo (codigo, id_tipo, descripcion, cantidad, fecha_compromiso, id_vendedor)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_trabajo, codigo, estado`,
        [codigo, idTipo, descripcion, cantidad, fechaCompromiso, usuario.id],
      );
      return rows[0];
    });
    await bitacora.registrar({ tipo: 'TRABAJO_CREADO', usuario, entidad: { tipo: 'trabajo', codigo: trabajo.codigo } });
    return trabajo;
  }

  // Diseño toma la solicitud: SOLICITADO -> EN_DISENO
  async function tomarParaDiseno(usuario, codigo) {
    const trabajo = await obtenerPorCodigo(codigo);
    validarTransicion(trabajo.estado, 'EN_DISENO');
    await pg.query("UPDATE trabajo SET estado = 'EN_DISENO', actualizado_en = now() WHERE id_trabajo = $1", [trabajo.id_trabajo]);
    await bitacora.registrar({ tipo: 'DISENO_INICIADO', usuario, entidad: { tipo: 'trabajo', codigo } });
    return { codigo, estado: 'EN_DISENO' };
  }

  // HU-04 / RF-04: actividades del área del operario, con la etapa vigente y la siguiente
  // Paginado: el celular del operario muestra 20 trabajos por página, ordenados por fecha comprometida (INC-03)
  async function actividadesDeMiArea(usuario, { pagina = 1, limite = 20 } = {}) {
    const { rows } = await pg.query(
      `SELECT t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, t.fecha_compromiso, t.estado AS estado_trabajo,
              ep.orden, ep.nombre AS etapa_actual, et.estado AS estado_etapa, ep_sig.nombre AS siguiente_actividad
         FROM etapa_trabajo et
         JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
         JOIN trabajo t ON t.id_trabajo = et.id_trabajo
         JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
         LEFT JOIN etapa_plantilla ep_sig ON ep_sig.id_tipo = t.id_tipo AND ep_sig.orden = ep.orden + 1
        WHERE ep.id_area = $1 AND et.estado = 'EN_CURSO' AND t.estado = 'EN_PRODUCCION'
        ORDER BY t.fecha_compromiso ASC
        LIMIT $2 OFFSET $3`,
      [usuario.idArea, limite, (pagina - 1) * limite],
    );
    return rows.map((r) => ({ ...r, atrasado: estaAtrasado({ estado: r.estado_trabajo, fecha_compromiso: r.fecha_compromiso }) }));
  }

  // HU-05 / RF-05: completar la etapa vigente; el sistema activa la siguiente o cierra el trabajo
  async function completarEtapa(usuario, codigo, orden) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT et.id_etapa_trabajo, et.estado, ep.id_area, t.id_trabajo, t.id_tipo, t.estado AS estado_trabajo
           FROM etapa_trabajo et
           JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
           JOIN trabajo t ON t.id_trabajo = et.id_trabajo
          WHERE t.codigo = $1 AND ep.orden = $2 FOR UPDATE OF et`,
        [codigo, orden],
      );
      const etapa = rows[0];
      if (!etapa) throw new ErrorNegocio('Etapa no encontrada', 404);
      // Control por área (evita que un operario modifique trabajos de otra área cambiando el código en la URL)
      if (etapa.id_area !== usuario.idArea) throw new ErrorNegocio('No tiene permisos para esta acción', 403);
      if (etapa.estado_trabajo !== 'EN_PRODUCCION') throw new ErrorNegocio('El trabajo no está en producción', 409);
      if (etapa.estado !== 'EN_CURSO') throw new ErrorNegocio('La etapa no está en curso', 409);

      await tx.query(
        "UPDATE etapa_trabajo SET estado = 'COMPLETADA', termino = now(), id_responsable = $1 WHERE id_etapa_trabajo = $2",
        [usuario.id, etapa.id_etapa_trabajo],
      );
      const siguiente = await tx.query(
        `UPDATE etapa_trabajo SET estado = 'EN_CURSO', inicio = now()
          WHERE id_trabajo = $1
            AND id_etapa_plantilla = (SELECT id_etapa_plantilla FROM etapa_plantilla WHERE id_tipo = $2 AND orden = $3)
        RETURNING id_etapa_trabajo`,
        [etapa.id_trabajo, etapa.id_tipo, orden + 1],
      );
      let estadoTrabajo = 'EN_PRODUCCION';
      if (siguiente.rows.length === 0) {
        estadoTrabajo = validarTransicion('EN_PRODUCCION', 'TERMINADO');
      }
      await tx.query('UPDATE trabajo SET estado = $1, actualizado_en = now() WHERE id_trabajo = $2', [estadoTrabajo, etapa.id_trabajo]);
      return { codigo, etapaCompletada: orden, siguienteOrden: siguiente.rows.length ? orden + 1 : null, estadoTrabajo };
    });
    await bitacora.registrar({ tipo: 'ETAPA_COMPLETADA', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { orden } });
    return resultado;
  }

  // RF-06 / sección 4.2: listado paginado con alcance según el rol (el permiso ya filtró el acceso a la ruta)
  async function listar(usuario, { estado, area, pagina = 1, limite = 20 } = {}) {
    const valores = [estado || null, area || null];
    let alcance = '';
    if (usuario.rol === 'VENDEDOR') {
      valores.push(usuario.id);
      alcance = `AND t.id_vendedor = $${valores.length}`;
    } else if (usuario.rol === 'DISENO') {
      alcance = "AND t.estado IN ('SOLICITADO', 'EN_DISENO')";
    }
    valores.push(limite, (pagina - 1) * limite);
    const idxLimite = valores.length - 1;
    const idxOffset = valores.length;

    const { rows } = await pg.query(
      `SELECT * FROM (
          SELECT t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, t.fecha_compromiso, t.estado,
                 COALESCE(a.nombre, CASE WHEN t.estado IN ('SOLICITADO','EN_DISENO') THEN 'Diseño'
                                         WHEN t.estado = 'PENDIENTE_APROBACION' THEN 'Producción (aprobación)' END) AS area_responsable,
                 ep.nombre AS etapa_actual
            FROM trabajo t
            JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
            LEFT JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo AND et.estado = 'EN_CURSO'
            LEFT JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
            LEFT JOIN area a ON a.id_area = ep.id_area
           WHERE ($1::varchar IS NULL OR t.estado = $1) ${alcance}
       ) sub
       WHERE $2::varchar IS NULL OR sub.area_responsable = $2
       ORDER BY sub.fecha_compromiso ASC
       LIMIT $${idxLimite} OFFSET $${idxOffset}`,
      valores,
    );
    return rows.map((r) => ({ ...r, atrasado: estaAtrasado(r) }));
  }

  // Comprueba que el trabajo esté dentro del alcance de datos del rol (no solo el acceso a la ruta)
  function verificarAlcance(usuario, trabajo) {
    if (usuario.rol === 'VENDEDOR' && trabajo.id_vendedor !== usuario.id) throw new ErrorNegocio('No tiene permisos para esta acción', 403);
    if (usuario.rol === 'DISENO' && !['SOLICITADO', 'EN_DISENO'].includes(trabajo.estado)) throw new ErrorNegocio('No tiene permisos para esta acción', 403);
  }

  // Detalle con etapas y versiones de diseño, respetando el mismo alcance que el listado
  async function detalle(usuario, codigo) {
    const trabajo = await obtenerPorCodigo(codigo);
    verificarAlcance(usuario, trabajo);
    const [tipo, etapas, disenos] = await Promise.all([
      pg.query('SELECT nombre FROM tipo_trabajo WHERE id_tipo = $1', [trabajo.id_tipo]),
      pg.query(
        `SELECT ep.orden, ep.nombre, a.nombre AS area, et.estado, u.nombre AS responsable, et.inicio, et.termino
           FROM etapa_trabajo et
           JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
           JOIN area a ON a.id_area = ep.id_area
           LEFT JOIN usuario u ON u.id_usuario = et.id_responsable
          WHERE et.id_trabajo = $1
          ORDER BY ep.orden`,
        [trabajo.id_trabajo],
      ),
      pg.query(
        `SELECT d.version, d.estado, ud.nombre AS disenador, d.enviado_en, ap.decision, ap.motivo, ap.decidido_en
           FROM diseno d
           LEFT JOIN usuario ud ON ud.id_usuario = d.id_disenador
           LEFT JOIN aprobacion_diseno ap ON ap.id_diseno = d.id_diseno
          WHERE d.id_trabajo = $1
          ORDER BY d.version`,
        [trabajo.id_trabajo],
      ),
    ]);
    return {
      codigo: trabajo.codigo, tipo: tipo.rows[0]?.nombre, descripcion: trabajo.descripcion, cantidad: trabajo.cantidad,
      fecha_compromiso: trabajo.fecha_compromiso, estado: trabajo.estado, atrasado: estaAtrasado(trabajo),
      etapas: etapas.rows, disenos: disenos.rows,
    };
  }

  // Detiene y reanuda un trabajo en producción, con motivo registrado en la bitácora (sección 4.5)
  async function detener(usuario, codigo, motivo) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query('SELECT id_trabajo, estado FROM trabajo WHERE codigo = $1 FOR UPDATE', [codigo]);
      const trabajo = rows[0];
      if (!trabajo) throw new ErrorNegocio('Trabajo no encontrado', 404);
      const nuevoEstado = validarTransicion(trabajo.estado, 'DETENIDO');
      await tx.query('UPDATE trabajo SET estado = $1, actualizado_en = now() WHERE id_trabajo = $2', [nuevoEstado, trabajo.id_trabajo]);
      return { codigo, estado: nuevoEstado };
    });
    await bitacora.registrar({ tipo: 'TRABAJO_DETENIDO', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { motivo } });
    return resultado;
  }

  async function reanudar(usuario, codigo) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query('SELECT id_trabajo, estado FROM trabajo WHERE codigo = $1 FOR UPDATE', [codigo]);
      const trabajo = rows[0];
      if (!trabajo) throw new ErrorNegocio('Trabajo no encontrado', 404);
      const nuevoEstado = validarTransicion(trabajo.estado, 'EN_PRODUCCION');
      await tx.query('UPDATE trabajo SET estado = $1, actualizado_en = now() WHERE id_trabajo = $2', [nuevoEstado, trabajo.id_trabajo]);
      return { codigo, estado: nuevoEstado };
    });
    await bitacora.registrar({ tipo: 'TRABAJO_REANUDADO', usuario, entidad: { tipo: 'trabajo', codigo } });
    return resultado;
  }

  // RF-08: materiales y medidas asociados al trabajo
  async function materiales(usuario, codigo) {
    // Un operario solo consulta los materiales de trabajos que tienen una etapa en su área
    if (usuario.rol === 'OPERARIO') {
      const { rows: permitido } = await pg.query(
        `SELECT 1 FROM etapa_trabajo et
           JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
           JOIN trabajo t ON t.id_trabajo = et.id_trabajo
          WHERE t.codigo = $1 AND ep.id_area = $2 LIMIT 1`,
        [codigo, usuario.idArea],
      );
      if (!permitido[0]) throw new ErrorNegocio('No tiene permisos para esta acción', 403);
    }
    const { rows } = await pg.query(
      `SELECT m.nombre, m.unidad, tm.cantidad, tm.medida
         FROM trabajo_material tm JOIN material m ON m.id_material = tm.id_material
         JOIN trabajo t ON t.id_trabajo = tm.id_trabajo WHERE t.codigo = $1`,
      [codigo],
    );
    return rows;
  }

  async function obtenerPorCodigo(codigo) {
    const { rows } = await pg.query('SELECT * FROM trabajo WHERE codigo = $1', [codigo]);
    if (!rows[0]) throw new ErrorNegocio('Trabajo no encontrado', 404);
    return rows[0];
  }

  return { registrarSolicitud, tomarParaDiseno, actividadesDeMiArea, completarEtapa, materiales, obtenerPorCodigo, listar, detalle, detener, reanudar };
}

module.exports = { crearServicioTrabajos };
