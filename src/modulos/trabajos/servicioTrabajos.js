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

  // HU-04 / RF-04: actividades del área del operario, con la etapa vigente y la siguiente.
  // Incluye quién la tomó (id_responsable/responsable): así el resto del área la ve "En curso por
  // <nombre>" en vez de verla disponible para todos a la vez (ver comenzarEtapa).
  // Paginado: el celular del operario muestra 20 trabajos por página, ordenados por fecha comprometida (INC-03)
  async function actividadesDeMiArea(usuario, { pagina = 1, limite = 20 } = {}) {
    const { rows } = await pg.query(
      `SELECT t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, t.fecha_compromiso, t.estado AS estado_trabajo,
              ep.orden, ep.nombre AS etapa_actual, et.estado AS estado_etapa, ep_sig.nombre AS siguiente_actividad,
              et.id_responsable, ur.nombre AS responsable
         FROM etapa_trabajo et
         JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
         JOIN trabajo t ON t.id_trabajo = et.id_trabajo
         JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
         LEFT JOIN etapa_plantilla ep_sig ON ep_sig.id_tipo = t.id_tipo AND ep_sig.orden = ep.orden + 1
         LEFT JOIN usuario ur ON ur.id_usuario = et.id_responsable
        WHERE ep.id_area = $1 AND et.estado = 'EN_CURSO' AND t.estado = 'EN_PRODUCCION'
        ORDER BY t.fecha_compromiso ASC
        LIMIT $2 OFFSET $3`,
      [usuario.idArea, limite, (pagina - 1) * limite],
    );
    return rows.map((r) => ({ ...r, atrasado: estaAtrasado({ estado: r.estado_trabajo, fecha_compromiso: r.fecha_compromiso }) }));
  }

  // Reclama la etapa vigente de forma atómica (punto 3 de la revisión del equipo, 18-11-2026): si
  // dos operarios la toman a la vez, el UPDATE con "id_responsable IS NULL" en el WHERE solo puede
  // afectar una fila incluso con dos solicitudes concurrentes (PostgreSQL serializa el acceso a esa
  // fila); quien llega después recibe 0 filas y un aviso de que ya no está disponible.
  async function comenzarEtapa(usuario, codigo, orden) {
    const { rows } = await pg.query(
      `UPDATE etapa_trabajo et SET id_responsable = $1, inicio = COALESCE(et.inicio, now())
         FROM etapa_plantilla ep, trabajo t
        WHERE et.id_etapa_plantilla = ep.id_etapa_plantilla AND et.id_trabajo = t.id_trabajo
          AND t.codigo = $2 AND ep.orden = $3 AND t.estado = 'EN_PRODUCCION'
          AND et.estado = 'EN_CURSO' AND et.id_responsable IS NULL AND ep.id_area = $4
        RETURNING et.id_etapa_trabajo`,
      [usuario.id, codigo, orden, usuario.idArea],
    );
    if (!rows[0]) {
      throw new ErrorNegocio('Esta etapa ya no está disponible para tomar: puede que alguien más ya la haya tomado, o que no esté vigente.', 409);
    }
    await bitacora.registrar({ tipo: 'ETAPA_INICIADA', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { orden } });
    return { codigo, etapaIniciada: orden };
  }

  // HU-05 / RF-05: completar la etapa vigente; el sistema activa la siguiente o cierra el trabajo.
  // Solo quien la tomó (comenzarEtapa) puede completarla; Producción puede completar cualquiera
  // (supervisa todas las áreas), la haya tomado un operario o no.
  async function completarEtapa(usuario, codigo, orden) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT et.id_etapa_trabajo, et.estado, et.id_responsable, ep.id_area, t.id_trabajo, t.id_tipo, t.estado AS estado_trabajo
           FROM etapa_trabajo et
           JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
           JOIN trabajo t ON t.id_trabajo = et.id_trabajo
          WHERE t.codigo = $1 AND ep.orden = $2 FOR UPDATE OF et`,
        [codigo, orden],
      );
      const etapa = rows[0];
      if (!etapa) throw new ErrorNegocio('Etapa no encontrada', 404);
      if (usuario.rol === 'OPERARIO' && etapa.id_area !== usuario.idArea) {
        // Control por área (evita que un operario modifique trabajos de otra área cambiando el código en la URL)
        throw new ErrorNegocio('No tiene permisos para esta acción', 403);
      }
      if (etapa.estado_trabajo !== 'EN_PRODUCCION') throw new ErrorNegocio('El trabajo no está en producción', 409);
      if (etapa.estado !== 'EN_CURSO') throw new ErrorNegocio('La etapa no está en curso', 409);
      if (usuario.rol === 'OPERARIO' && etapa.id_responsable !== usuario.id) {
        throw new ErrorNegocio('Primero debes tomar esta etapa (botón "Comenzar etapa") antes de poder completarla.', 409);
      }

      await tx.query(
        "UPDATE etapa_trabajo SET estado = 'COMPLETADA', termino = now(), id_responsable = COALESCE(id_responsable, $1) WHERE id_etapa_trabajo = $2",
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
    // "trabajoTerminado": para que Novedades (punto 5) pueda avisar "este trabajo terminó" sin
    // inventar un tipo de evento nuevo ni adivinarlo después a partir de otros datos.
    await bitacora.registrar({
      tipo: 'ETAPA_COMPLETADA', usuario, entidad: { tipo: 'trabajo', codigo },
      detalle: { orden, trabajoTerminado: resultado.estadoTrabajo === 'TERMINADO' },
    });
    return resultado;
  }

  // Punto B1 de la revisión del equipo (19-11-2026): si alguien tomó una etapa y la abandonó (se
  // fue, se equivocó de etapa, quedó bloqueada), quien la tomó, Producción o Administración pueden
  // liberarla para que quede disponible de nuevo. El sistema modela un único responsable por etapa
  // (ver docs/CAMBIOS_RESPECTO_AL_DISENO.md): liberarla no "comparte" el trabajo ya hecho, solo
  // permite que alguien (la misma persona u otra) la vuelva a tomar desde cero.
  async function liberarEtapa(usuario, codigo, orden) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT et.id_etapa_trabajo, et.estado, et.id_responsable, ep.id_area, t.estado AS estado_trabajo
           FROM etapa_trabajo et
           JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
           JOIN trabajo t ON t.id_trabajo = et.id_trabajo
          WHERE t.codigo = $1 AND ep.orden = $2 FOR UPDATE OF et`,
        [codigo, orden],
      );
      const etapa = rows[0];
      if (!etapa) throw new ErrorNegocio('Etapa no encontrada', 404);
      if (usuario.rol === 'OPERARIO' && etapa.id_area !== usuario.idArea) {
        throw new ErrorNegocio('No tiene permisos para esta acción', 403);
      }
      if (etapa.estado_trabajo !== 'EN_PRODUCCION') throw new ErrorNegocio('El trabajo no está en producción', 409);
      if (etapa.estado !== 'EN_CURSO') throw new ErrorNegocio('La etapa no está en curso', 409);
      if (!etapa.id_responsable) throw new ErrorNegocio('Esta etapa todavía no la ha tomado nadie: no hay nada que liberar.', 409);
      if (usuario.rol === 'OPERARIO' && etapa.id_responsable !== usuario.id) {
        throw new ErrorNegocio('Solo quien tomó esta etapa (o Producción) puede liberarla.', 403);
      }
      await tx.query('UPDATE etapa_trabajo SET id_responsable = NULL WHERE id_etapa_trabajo = $1', [etapa.id_etapa_trabajo]);
      return { responsableAnterior: etapa.id_responsable };
    });
    await bitacora.registrar({
      tipo: 'ETAPA_LIBERADA', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { orden, idResponsableAnterior: resultado.responsableAnterior },
    });
    return { codigo, etapaLiberada: orden };
  }

  // RF-06 / sección 4.2: listado paginado con alcance según el rol (el permiso ya filtró el acceso a la ruta)
  // "busqueda" (por código o descripción) sirve, entre otras cosas, para elegir un trabajo de una
  // lista en vez de escribir el código a mano (punto 1 de la revisión del equipo, 18-11-2026).
  async function listar(usuario, { estado, area, busqueda, pagina = 1, limite = 20, conEtapas = false } = {}) {
    const valores = [estado || null, area || null];
    let alcance = '';
    if (usuario.rol === 'VENDEDOR') {
      valores.push(usuario.id);
      alcance = `AND t.id_vendedor = $${valores.length}`;
    } else if (usuario.rol === 'DISENO') {
      alcance = "AND t.estado IN ('SOLICITADO', 'EN_DISENO')";
    }
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      alcance += ` AND (t.codigo ILIKE $${valores.length} OR t.descripcion ILIKE $${valores.length})`;
    }
    valores.push(limite, (pagina - 1) * limite);
    const idxLimite = valores.length - 1;
    const idxOffset = valores.length;

    // Línea de tiempo de etapas (punto 9 de la revisión del equipo, 19-11-2026), opcional: mismo
    // formato que ya devuelve detalle(), para reutilizar listaEtapas() tal cual. Solo "Mis
    // solicitudes" la pide (conEtapas=true); para el resto sería peso de más en la respuesta.
    const selectEtapas = conEtapas
      ? `(SELECT COALESCE(json_agg(json_build_object(
                  'orden', ep2.orden, 'nombre', ep2.nombre, 'area', a2.nombre,
                  'estado', et2.estado, 'responsable', ur2.nombre
                ) ORDER BY ep2.orden), '[]'::json)
            FROM etapa_trabajo et2
            JOIN etapa_plantilla ep2 ON ep2.id_etapa_plantilla = et2.id_etapa_plantilla
            JOIN area a2 ON a2.id_area = ep2.id_area
            LEFT JOIN usuario ur2 ON ur2.id_usuario = et2.id_responsable
           WHERE et2.id_trabajo = t.id_trabajo)`
      : 'NULL::json';

    const { rows } = await pg.query(
      `SELECT * FROM (
          SELECT t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, t.fecha_compromiso, t.estado,
                 COALESCE(a.nombre, CASE WHEN t.estado IN ('SOLICITADO','EN_DISENO') THEN 'Diseño'
                                         WHEN t.estado = 'PENDIENTE_APROBACION' THEN 'Producción (aprobación)' END) AS area_responsable,
                 ep.nombre AS etapa_actual,
                 ${selectEtapas} AS etapas
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

  // RF-08: Producción registra qué material, cantidad y medida (por ejemplo, un color) se usa en
  // un trabajo. Es un "upsert": registrar de nuevo el mismo material corrige la cantidad o la medida
  // anterior en vez de duplicar la fila (la tabla ya tiene PRIMARY KEY (id_trabajo, id_material)).
  async function registrarMaterial(usuario, codigo, { idMaterial, cantidad, medida }) {
    const trabajo = await obtenerPorCodigo(codigo);
    const { rows: materialRows } = await pg.query('SELECT nombre, unidad FROM material WHERE id_material = $1', [idMaterial]);
    const material = materialRows[0];
    if (!material) throw new ErrorNegocio('Material no válido', 400);

    await pg.query(
      `INSERT INTO trabajo_material (id_trabajo, id_material, cantidad, medida)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_trabajo, id_material) DO UPDATE SET cantidad = EXCLUDED.cantidad, medida = EXCLUDED.medida`,
      [trabajo.id_trabajo, idMaterial, cantidad, medida || null],
    );
    await bitacora.registrar({
      tipo: 'MATERIAL_REGISTRADO', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { idMaterial, cantidad, medida: medida || null },
    });
    return { nombre: material.nombre, unidad: material.unidad, cantidad, medida: medida || null };
  }

  async function obtenerPorCodigo(codigo) {
    const { rows } = await pg.query('SELECT * FROM trabajo WHERE codigo = $1', [codigo]);
    if (!rows[0]) throw new ErrorNegocio('Trabajo no encontrado', 404);
    return rows[0];
  }

  // Punto 2 de la revisión del equipo (19-11-2026): historial humano dentro del detalle de un
  // trabajo, con el mismo alcance que ya decide quién puede ver ese trabajo (Vendedor el propio,
  // Diseño mientras le corresponde). Un operario no tiene ruta al detalle general (ve "Mis
  // actividades", acotado a su área): aquí se le permite igual, pero solo si el trabajo pasa (o
  // pasó) por su área, y sin los eventos de diseño, que no son de su incumbencia.
  async function historialDeTrabajo(usuario, codigo) {
    const trabajo = await obtenerPorCodigo(codigo);
    if (usuario.rol === 'OPERARIO') {
      const { rows } = await pg.query(
        'SELECT 1 FROM etapa_plantilla WHERE id_tipo = $1 AND id_area = $2 LIMIT 1',
        [trabajo.id_tipo, usuario.idArea],
      );
      if (!rows[0]) throw new ErrorNegocio('No tiene permisos para esta acción', 403);
      const eventos = await bitacora.consultarPorTrabajo(codigo);
      return eventos.filter((e) => !e.tipo.startsWith('DISENO_'));
    }
    verificarAlcance(usuario, trabajo);
    return bitacora.consultarPorTrabajo(codigo);
  }

  return {
    registrarSolicitud, tomarParaDiseno, actividadesDeMiArea, comenzarEtapa, completarEtapa, liberarEtapa, materiales, registrarMaterial,
    obtenerPorCodigo, listar, detalle, detener, reanudar, historialDeTrabajo,
  };
}

module.exports = { crearServicioTrabajos };
