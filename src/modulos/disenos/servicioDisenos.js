'use strict';
const crypto = require('node:crypto');
const { ObjectId, GridFSBucket } = require('mongodb');
const { ErrorNegocio } = require('../../dominio/errores');
const { validarTransicion } = require('../../dominio/flujoTrabajo');
const { validarArchivoDiseno } = require('../../dominio/archivosDiseno');

// Sube el contenido ya validado a GridFS y devuelve el ObjectId real del archivo guardado.
function subirArchivo(bucket, nombre, tipoMime, contenido, trabajoCodigo) {
  return new Promise((resolve, reject) => {
    const subida = bucket.openUploadStream(nombre, { contentType: tipoMime, metadata: { trabajoCodigo } });
    subida.once('error', reject);
    subida.once('finish', () => resolve(subida.id));
    subida.end(contenido);
  });
}

function crearServicioDisenos({ pg, mongoDb, bitacora }) {
  const propuestas = mongoDb.collection('propuestas_diseno');
  const bucket = new GridFSBucket(mongoDb, { bucketName: 'disenos' });

  // HU-02 / RF-02: registrar propuesta. El archivo real se guarda en GridFS (bucket "disenos");
  // sus metadatos en MongoDB; la versión y el estado del trabajo, en PostgreSQL.
  async function enviarPropuesta(usuario, codigo, { archivos, especificaciones, comentario }) {
    // El tamaño y la cabecera para validar la firma se miden del contenido real recibido, nunca de
    // un dato declarado por el cliente (antes de esta fase solo se recibía la cabecera: no había
    // nada real que medir). Así el límite de 15 MB tampoco se puede evadir declarando un tamaño falso.
    const validados = archivos.map((archivo) => {
      const contenido = Buffer.from(archivo.contenidoBase64, 'base64');
      const { valido, errores } = validarArchivoDiseno({
        nombre: archivo.nombre, tipoMime: archivo.tipoMime, tamanoBytes: contenido.length,
        cabeceraBase64: contenido.subarray(0, 16).toString('base64'),
      });
      if (!valido) throw new ErrorNegocio(`Archivo "${archivo.nombre}" rechazado: ${errores.join(', ')}`, 400);
      return { nombre: archivo.nombre, tipoMime: archivo.tipoMime, contenido };
    });

    const idDocumento = new ObjectId();
    const archivosGuardados = [];
    try {
      for (const v of validados) {
        const idArchivo = await subirArchivo(bucket, v.nombre, v.tipoMime, v.contenido, codigo);
        archivosGuardados.push({
          nombre: v.nombre, tipoMime: v.tipoMime, tamanoBytes: v.contenido.length,
          sha256: crypto.createHash('sha256').update(v.contenido).digest('hex'),
          archivoId: idArchivo.toHexString(),
        });
      }

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
          archivos: archivosGuardados,
          especificaciones: especificaciones || {},
          comentarios: comentario ? [{ autor: usuario.id, rol: usuario.rol, texto: comentario, fecha: new Date() }] : [],
          creadoEn: new Date(),
        });
        return { idDiseno: diseno.id_diseno, version: diseno.version, refDocumento: idDocumento.toHexString() };
      });

      await bitacora.registrar({ tipo: 'DISENO_ENVIADO', usuario, entidad: { tipo: 'trabajo', codigo }, detalle: { version: resultado.version } });
      return resultado;
    } catch (err) {
      // Si algo falla después de subir archivos a GridFS (trabajo no encontrado, transición
      // inválida, fallo de MongoDB), no deben quedar archivos huérfanos sin ningún diseño que los referencie.
      await propuestas.deleteOne({ _id: idDocumento }).catch(() => {});
      await Promise.all(archivosGuardados.map((a) => bucket.delete(ObjectId.createFromHexString(a.archivoId)).catch(() => {})));
      throw err;
    }
  }

  // Descarga el archivo real de una propuesta, verificando que el archivo pedido pertenezca de
  // verdad a ese diseño (sin esto, cualquiera con permiso DISENO_VER podría adivinar el id de un
  // archivo de otro trabajo y descargarlo igual).
  async function obtenerArchivo(idDiseno, idArchivo) {
    const { rows } = await pg.query('SELECT ref_documento FROM diseno WHERE id_diseno = $1', [idDiseno]);
    if (!rows[0]) throw new ErrorNegocio('Diseño no encontrado', 404);
    const documento = await propuestas.findOne({ _id: ObjectId.createFromHexString(rows[0].ref_documento) });
    const archivo = documento?.archivos.find((a) => a.archivoId === idArchivo);
    if (!archivo) throw new ErrorNegocio('Archivo no encontrado', 404);
    return {
      nombre: archivo.nombre,
      tipoMime: archivo.tipoMime,
      flujo: bucket.openDownloadStream(ObjectId.createFromHexString(idArchivo)),
    };
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

  // Versiones esperando decisión de Producción (sección 4.4). Contador, orden, búsqueda y
  // paginación (Parte B, a partir del aviso del equipo sobre DEF-12): sin esto, una bandeja con
  // muchas propuestas pendientes no se puede usar de verdad.
  async function pendientes({ busqueda, orden = 'fecha_compromiso', pagina = 1, limite = 20 } = {}) {
    const condiciones = ["d.estado = 'PENDIENTE'"];
    const valores = [];
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`(t.codigo ILIKE $${valores.length} OR t.descripcion ILIKE $${valores.length})`);
    }
    const whereSql = condiciones.join(' AND ');
    const ordenSql = orden === 'enviado_en' ? 'd.enviado_en ASC' : 't.fecha_compromiso ASC';

    const { rows: totalRows } = await pg.query(
      `SELECT COUNT(*)::int AS n FROM diseno d JOIN trabajo t ON t.id_trabajo = d.id_trabajo WHERE ${whereSql}`, valores,
    );
    const valoresPagina = [...valores, limite, (pagina - 1) * limite];
    const { rows } = await pg.query(
      `SELECT d.id_diseno AS "idDiseno", d.version, t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad,
              t.fecha_compromiso, u.nombre AS disenador, d.enviado_en
         FROM diseno d
         JOIN trabajo t ON t.id_trabajo = d.id_trabajo
         JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
         JOIN usuario u ON u.id_usuario = d.id_disenador
        WHERE ${whereSql}
        ORDER BY ${ordenSql}
        LIMIT $${valoresPagina.length - 1} OFFSET $${valoresPagina.length}`,
      valoresPagina,
    );
    return { total: totalRows[0].n, items: rows };
  }

  // Consulta integrada: estado relacional + documento de la propuesta
  async function detalle(idDiseno) {
    const { rows } = await pg.query(
      `SELECT d.id_diseno AS "idDiseno", d.version, d.estado, d.ref_documento, t.codigo
         FROM diseno d JOIN trabajo t ON t.id_trabajo = d.id_trabajo WHERE d.id_diseno = $1`,
      [idDiseno],
    );
    if (!rows[0]) throw new ErrorNegocio('Diseño no encontrado', 404);
    const documento = await propuestas.findOne({ _id: ObjectId.createFromHexString(rows[0].ref_documento) }, { projection: { _id: 0 } });
    return { ...rows[0], propuesta: documento };
  }

  return { enviarPropuesta, decidir, detalle, pendientes, obtenerArchivo };
}

module.exports = { crearServicioDisenos };
