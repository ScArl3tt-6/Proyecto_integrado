'use strict';
// Genera la evidencia funcional de las bases estructurada (PostgreSQL) y no estructurada (MongoDB)
// a partir de un flujo real ejecutado sobre la API (secciones 6.3, 6.4 y 6.5 del informe).
const fs = require('node:fs');
const path = require('node:path');
const { crearContexto, CABECERAS, fechaEnDias } = require('../tests/contexto');

const lineas = [];
const log = (t = '') => { lineas.push(t); console.log(t); };
const tabla = (rows) => {
  if (!rows.length) return log('(sin filas)');
  const cols = Object.keys(rows[0]);
  const fmt = (v) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v === null ? 'NULL' : String(v));
  const anchos = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c]).length)));
  log(cols.map((c, i) => c.padEnd(anchos[i])).join(' | '));
  log(anchos.map((a) => '-'.repeat(a)).join('-+-'));
  rows.forEach((r) => log(cols.map((c, i) => fmt(r[c]).padEnd(anchos[i])).join(' | ')));
};

async function principal() {
  const ctx = await crearContexto();
  const [jorge, valentina, marcela, luis] = await Promise.all(['jorge', 'valentina', 'marcela', 'luis'].map((u) => ctx.iniciarSesion(u)));

  const { body: t } = await jorge.post('/api/trabajos', { idTipo: 1, descripcion: '40 poleras piqué bordadas Club Deportivo Los Aromos', cantidad: 40, fechaCompromiso: fechaEnDias(10) });
  await valentina.post(`/api/trabajos/${t.codigo}/tomar-diseno`);
  const { body: d } = await valentina.post(`/api/disenos/trabajos/${t.codigo}`, {
    archivos: [{ nombre: 'escudo_aromos_v1.pdf', tipoMime: 'application/pdf', tamanoBytes: 482133, cabeceraBase64: CABECERAS.pdf }],
    especificaciones: { tecnica: 'Bordado', ubicacion: 'Pecho izquierdo', medidas: '9 x 7 cm', colores: ['Azul marino', 'Blanco'], puntadas: 11800 },
    comentario: 'Se ajustó el escudo a 9 cm de ancho',
  });
  await marcela.post(`/api/disenos/${d.idDiseno}/decision`, { decision: 'APROBADO' });
  await luis.post(`/api/trabajos/${t.codigo}/etapas/1/completar`);
  await ctx.pg.query(`INSERT INTO trabajo_material (id_trabajo, id_material, cantidad, medida)
    SELECT id_trabajo, 1, 3, 'Azul marino / blanco' FROM trabajo WHERE codigo = $1`, [t.codigo]);

  log('=== 6.3 BASE ESTRUCTURADA (PostgreSQL) ===');
  log('\n-- Tablas creadas en el esquema public');
  tabla((await ctx.pg.query(`SELECT table_name AS tabla FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).rows);

  log('\n-- Claves foráneas e integridad referencial');
  tabla((await ctx.pg.query(`
    SELECT tc.table_name AS tabla, kcu.column_name AS columna, ccu.table_name AS referencia, rc.delete_rule AS al_eliminar
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' ORDER BY 1, 2`)).rows);

  log('\n-- Consulta: estado, etapa vigente y siguiente actividad del trabajo');
  tabla((await ctx.pg.query(`
    SELECT t.codigo, t.estado, et.orden, ep.nombre AS etapa, et.estado AS estado_etapa, u.nombre AS responsable
      FROM trabajo t JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo
      JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
      LEFT JOIN usuario u ON u.id_usuario = et.id_responsable
     WHERE t.codigo = $1 ORDER BY et.orden`, [t.codigo])).rows);

  log('\n-- Consulta: trazabilidad de la aprobación del diseño (RF-03)');
  tabla((await ctx.pg.query(`
    SELECT t.codigo, d.version, a.decision, u.nombre AS aprobador, a.decidido_en
      FROM aprobacion_diseno a JOIN diseno d ON d.id_diseno = a.id_diseno
      JOIN trabajo t ON t.id_trabajo = d.id_trabajo JOIN usuario u ON u.id_usuario = a.id_aprobador`)).rows);

  log('\n-- Pruebas de restricciones (deben fallar)');
  const intentos = [
    ['Etapa para un trabajo inexistente (FK)', "INSERT INTO etapa_trabajo (id_trabajo, id_etapa_plantilla, orden) VALUES (9999, 1, 1)"],
    ['Cantidad igual a cero (CHECK)', `INSERT INTO trabajo (codigo, id_tipo, descripcion, cantidad, fecha_compromiso, id_vendedor) VALUES ('KT-2026-9999', 1, 'x', 0, '2026-12-01', 1)`],
    ['Estado fuera del dominio (CHECK)', `UPDATE trabajo SET estado = 'ENTREGADO' WHERE codigo = '${t.codigo}'`],
    ['Rechazo sin motivo (CHECK)', `INSERT INTO aprobacion_diseno (id_diseno, id_aprobador, decision) VALUES (${d.idDiseno}, 2, 'RECHAZADO')`],
    ['Eliminar un trabajo con historial (RESTRICT)', `DELETE FROM trabajo WHERE codigo = '${t.codigo}'`],
    ['Correo duplicado (UNIQUE)', "INSERT INTO usuario (nombre, correo, hash_contrasena, id_rol) VALUES ('Copia', 'jorge@kotoduo.test', 'x', 4)"],
  ];
  for (const [nombre, sql] of intentos) {
    try { await ctx.pg.query(sql); log(`  [NO RECHAZADO] ${nombre}`); } catch (e) { log(`  [RECHAZADO] ${nombre}: ${e.message}`); }
  }

  log('\n=== 6.4 BASE NO ESTRUCTURADA (MongoDB) ===');
  const propuesta = await ctx.mongoDb.collection('propuestas_diseno').findOne({ trabajoCodigo: t.codigo });
  log('\n-- db.propuestas_diseno.findOne({ trabajoCodigo: "' + t.codigo + '" })');
  log(JSON.stringify(propuesta, null, 2));

  log('\n-- Validador $jsonSchema: inserción de un SVG directamente en la colección (debe fallar)');
  try {
    await ctx.mongoDb.collection('propuestas_diseno').insertOne({ trabajoCodigo: t.codigo, idDiseno: 99, version: 9, creadoEn: new Date(),
      archivos: [{ nombre: 'logo.svg', tipoMime: 'image/svg+xml', tamanoBytes: 100, sha256: 'a'.repeat(64) }] });
    log('  [NO RECHAZADO]');
  } catch (e) { log(`  [RECHAZADO] ${e.message}`); }

  log('\n-- db.bitacora_eventos.find({ "entidad.codigo": "' + t.codigo + '" }).sort({ fecha: 1 })');
  const eventos = await ctx.mongoDb.collection('bitacora_eventos').find({ 'entidad.codigo': t.codigo }, { projection: { _id: 0, ip: 0 } }).sort({ fecha: 1 }).toArray();
  tabla(eventos.map((e) => ({ tipo: e.tipo, rol: e.usuario?.rol, fecha: e.fecha, detalle: JSON.stringify(e.detalle) })));

  log('\n-- Agregación: eventos por tipo (aggregate)');
  tabla(await ctx.mongoDb.collection('bitacora_eventos').aggregate([
    { $group: { _id: '$tipo', total: { $sum: 1 } } }, { $sort: { total: -1 } }, { $project: { _id: 0, tipo: '$_id', total: 1 } },
  ]).toArray());

  log('\n-- Índices de las colecciones');
  for (const c of ['propuestas_diseno', 'bitacora_eventos']) {
    const idx = await ctx.mongoDb.collection(c).indexes();
    log(`  ${c}: ${idx.map((i) => JSON.stringify(i.key)).join(', ')}`);
  }

  log('\n=== 6.5 CONSULTA INTEGRADA (GET /api/disenos/:id) ===');
  const integrado = await marcela.get(`/api/disenos/${d.idDiseno}`);
  log(JSON.stringify(integrado.body, null, 2));

  await ctx.cerrar();
  fs.writeFileSync(path.join(__dirname, '..', 'evidencias', 'evidencia_bases_datos.txt'), lineas.join('\n'));
}

principal().catch((e) => { console.error(e); process.exit(1); });
