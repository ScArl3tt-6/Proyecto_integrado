'use strict';
const crypto = require('node:crypto');
const { ObjectId } = require('mongodb');
const { ErrorNegocio } = require('../../dominio/errores');
const { validarTransicion } = require('../../dominio/flujoTrabajo');
const { validarArchivoDiseno } = require('../../dominio/archivosDiseno');

function crearServicioDisenos({ pg, mongoDb, bitacora }) {
  const propuestas = mongoDb.collection('propuestas_diseno');

  // HU-02 / RF-02: registrar propuesta. Metadatos en MongoDB; versión y estado en PostgreSQL.
  async function enviarPropuesta(usuario, codigo, { archivos, especificaciones, comentario }) {
    for (const archivo of archivos) {
      const { valido, errores } = validarArchivoDiseno(archivo);
      if (!valido) throw new ErrorNegocio(`Archivo "${archivo.nombre}" rechazado: ${errores.join(', ')}`, 400);
    }
    const idDocumento = new ObjectId();

    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query('SELECT id_trabajo, estado FROM trabajo WHERE codigo = $1 FOR UPDATE', [codigo]);
      const trabajo = rows[0];
      if (!trabajo) throw new ErrorNegocio('Trabajo no encontrado', 404);
      validarTransicion(trabajo.estado, 'PENDIENTE_APROBACION');

      const { rows: [{ version }] } = await tx.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM diseno WHERE id_trabajo = $1', [trabajo.id_trabajo],
      );
      const { rows: [diseno] } = await tx.query(
        `INSERT INTO diseno (id_trabajo, version, id_disenador, ref_documento)
         VALUES ($1, $2, $3, $4) RETURNING id_diseno, version`,
        [trabajo.id_trabajo, version, usuario.id, idDocumento.toHexString()],
      );
      await tx.query("UPDATE trabajo SET estado = 'PENDIENTE_APROBACION', actualizado_en = now() WHERE id_trabajo = $1", [trabajo.id_trabajo]);

      // Si MongoDB falla, la excepción revierte la transacción relacional (no quedan referencias huérfanas)
      await propuestas.insertOne({
        _id: idDocumento,
        trabajoCodigo: codigo,
        idDiseno: diseno.id_diseno,
        version: diseno.version,
        archivos: archivos.map((a) => ({
          nombre: a.nombre, tipoMime: a.tipoMime, tamanoBytes: a.tamanoBytes,
          sha256: crypto.createHash('sha256').update(Buffer.from(a.cabeceraBase64, 'base64')).digest('hex'),
        })),
        especificaciones: especificaciones || {},
        comentarios: comentario ? [{ autor: usuario.id, rol: usuario.rol, texto: comentario, fecha: new Date() }] : [],
        creadoEn: new Date(),
      });
      return { idDiseno: diseno.id_diseno, version: diseno.version, refDocumento: idDocumento.toHexString() };
    }).catch(async (err) => {
      await propuestas.deleteOne({ _id: idDocumento }).catch(() => {});
      throw err;
    });

    await bitacora.registrar({ tipo: 'DISENO_ENVIADO', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { version: resultado.version } });
    return resultado;
  }

  // HU-03 / RF-03: aprobar o rechazar; registra usuario, fecha y hora. Al aprobar se generan las etapas productivas.
  async function decidir(usuario, idDiseno, { decision, motivo }) {
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT d.id_diseno, d.estado, t.id_trabajo, t.codigo, t.id_tipo, t.estado AS estado_trabajo
           FROM diseno d JOIN trabajo t ON t.id_trabajo = d.id_trabajo WHERE d.id_diseno = $1 FOR UPDATE`,
        [idDiseno],
      );
      const diseno = rows[0];
      if (!diseno) throw new ErrorNegocio('Diseño no encontrado', 404);
      if (diseno.estado !== 'PENDIENTE') throw new ErrorNegocio('El diseño ya tiene una decisión registrada', 409);

      const nuevoEstado = validarTransicion(diseno.estado_trabajo, decision === 'APROBADO' ? 'EN_PRODUCCION' : 'EN_DISENO');
      const { rows: [aprobacion] } = await tx.query(
        `INSERT INTO aprobacion_diseno (id_diseno, id_aprobador, decision, motivo)
         VALUES ($1, $2, $3, $4) RETURNING decidido_en`,
        [idDiseno, usuario.id, decision, motivo || null],
      );
      await tx.query('UPDATE diseno SET estado = $1 WHERE id_diseno = $2', [decision, idDiseno]);
      await tx.query('UPDATE trabajo SET estado = $1, actualizado_en = now() WHERE id_trabajo = $2', [nuevoEstado, diseno.id_trabajo]);

      if (decision === 'APROBADO') {
        await tx.query(
          `INSERT INTO etapa_trabajo (id_trabajo, id_etapa_plantilla, orden, estado, inicio)
           SELECT $1, id_etapa_plantilla, orden,
                  CASE WHEN orden = 1 THEN 'EN_CURSO' ELSE 'PENDIENTE' END,
                  CASE WHEN orden = 1 THEN now() END
             FROM etapa_plantilla WHERE id_tipo = $2 ORDER BY orden`,
          [diseno.id_trabajo, diseno.id_tipo],
        );
      }
      return { codigo: diseno.codigo, decision, estadoTrabajo: nuevoEstado, decididoEn: aprobacion.decidido_en };
    });
    await bitacora.registrar({
      tipo: decision === 'APROBADO' ? 'DISENO_APROBADO' : 'DISENO_RECHAZADO',
      usuario, entidad: { tipo: 'trabajo', codigo: resultado.codigo }, detalle: { idDiseno, motivo: motivo || null },
    });
    return resultado;
  }

  // Versiones esperando decisión de Producción (sección 4.4)
  async function pendientes() {
    const { rows } = await pg.query(
      `SELECT d.id_diseno AS "idDiseno", d.version, t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, u.nombre AS disenador, d.enviado_en
         FROM diseno d
         JOIN trabajo t ON t.id_trabajo = d.id_trabajo
         JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
         JOIN usuario u ON u.id_usuario = d.id_disenador
        WHERE d.estado = 'PENDIENTE'
        ORDER BY d.enviado_en ASC`,
    );
    return rows;
  }

  // Consulta integrada: estado relacional + documento de la propuesta
  async function detalle(idDiseno) {
    const { rows } = await pg.query(
      `SELECT d.id_diseno, d.version, d.estado, d.ref_documento, t.codigo
         FROM diseno d JOIN trabajo t ON t.id_trabajo = d.id_trabajo WHERE d.id_diseno = $1`,
      [idDiseno],
    );
    if (!rows[0]) throw new ErrorNegocio('Diseño no encontrado', 404);
    const documento = await propuestas.findOne({ _id: ObjectId.createFromHexString(rows[0].ref_documento) }, { projection: { _id: 0 } });
    return { ...rows[0], propuesta: documento };
  }

  return { enviarPropuesta, decidir, detalle, pendientes };
}

module.exports = { crearServicioDisenos };
