'use strict';
// Borra SOLO los 14 trabajos de prueba que quedaron en la base real de demostración durante la
// verificación de GridFS/DEF-11/DEF-12 (antes de que existiera scripts/entorno-efimero.js), y
// todo lo que depende de ellos: aprobaciones de diseño, etapas, diseños (con su propuesta y sus
// archivos reales en GridFS) y los eventos de bitácora de esos códigos puntuales. NO toca
// KT-2026-0010 ni ningún otro trabajo: la lista de códigos está escrita a mano, no se calcula con
// un patrón, justamente para no borrar por error algo que el equipo haya creado.
//
// Por defecto SOLO MUESTRA qué borraría (no toca nada). Para borrar de verdad:
//   npm run db:limpiar-trabajos-prueba -- --si
const { cargarEnv } = require('../cargarEnv');
const { Client } = require('pg');
const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');

cargarEnv();

if (process.env.NODE_ENV === 'production') {
  console.error('Esto no se ejecuta en producción.');
  process.exit(1);
}

// Códigos exactos confirmados por el equipo (consulta en pgAdmin) como datos de prueba de esta
// sesión de verificación, no datos reales ni creados por el equipo.
const CODIGOS = [
  // Encontrados y confirmados por el equipo (primera ronda):
  'KT-2026-0007', 'KT-2026-0008', 'KT-2026-0009', // "Verificacion real de GridFS (Fase 1)"
  'KT-2026-0018', 'KT-2026-0019', // "Verificacion del fix de DEF-11"
  'KT-2026-0020', 'KT-2026-0021', 'KT-2026-0022', 'KT-2026-0023', 'KT-2026-0024',
  'KT-2026-0025', 'KT-2026-0026', 'KT-2026-0027', 'KT-2026-0028', // "Verificacion de vista previa de archivos (UX)"
  // Encontrados después, al investigar un conteo que no cuadraba (segunda ronda, sin confirmar
  // todavía por el equipo): "Caso de prueba DEF-11", incluido KT-2026-0010, que se había dejado
  // como "real" por error la primera vez. Ver evidencias/defectos.md para el detalle completo.
  'KT-2026-0010', 'KT-2026-0011', 'KT-2026-0012', 'KT-2026-0013', 'KT-2026-0014',
  'KT-2026-0015', 'KT-2026-0016', 'KT-2026-0017',
];
const EJECUTAR = process.argv.includes('--si');

async function principal() {
  if (!process.env.SST_PG_PROPIETARIO_URL) throw new Error('Falta SST_PG_PROPIETARIO_URL en .env.');
  const pg = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
  await pg.connect();
  const cliente = new MongoClient(process.env.SST_MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  await cliente.connect();
  const db = cliente.db(process.env.SST_MONGO_BASE || 'sst_kotoduo');
  const bucket = new GridFSBucket(db, { bucketName: 'disenos' });

  const { rows: trabajos } = await pg.query(
    'SELECT id_trabajo, codigo FROM trabajo WHERE codigo = ANY($1::text[]) ORDER BY codigo', [CODIGOS],
  );
  console.log(`Trabajos encontrados que coinciden con la lista: ${trabajos.length} de ${CODIGOS.length} esperados.`);
  if (trabajos.length !== CODIGOS.length) {
    const faltantes = CODIGOS.filter((c) => !trabajos.some((t) => t.codigo === c));
    console.log('  No encontrados (ya no existen, o el código no calza):', faltantes);
  }

  for (const t of trabajos) {
    const { rows: disenos } = await pg.query('SELECT id_diseno, ref_documento FROM diseno WHERE id_trabajo = $1', [t.id_trabajo]);
    const { rows: etapas } = await pg.query('SELECT id_etapa_trabajo FROM etapa_trabajo WHERE id_trabajo = $1', [t.id_trabajo]);
    let archivosGridfs = 0;
    for (const d of disenos) {
      const doc = await db.collection('propuestas_diseno').findOne({ _id: ObjectId.createFromHexString(d.ref_documento) });
      archivosGridfs += doc?.archivos?.length || 0;
    }
    const bitacora = await db.collection('bitacora_eventos').countDocuments({ 'entidad.codigo': t.codigo });
    console.log(`  ${t.codigo}: ${disenos.length} diseño(s), ${etapas.length} etapa(s), ${archivosGridfs} archivo(s) en GridFS, ${bitacora} evento(s) de bitácora.`);

    if (!EJECUTAR) continue;

    for (const d of disenos) {
      await pg.query('DELETE FROM aprobacion_diseno WHERE id_diseno = $1', [d.id_diseno]);
    }
    await pg.query('DELETE FROM etapa_trabajo WHERE id_trabajo = $1', [t.id_trabajo]);
    for (const d of disenos) {
      const doc = await db.collection('propuestas_diseno').findOne({ _id: ObjectId.createFromHexString(d.ref_documento) });
      for (const a of doc?.archivos || []) {
        await bucket.delete(ObjectId.createFromHexString(a.archivoId)).catch(() => {});
      }
      await db.collection('propuestas_diseno').deleteOne({ _id: ObjectId.createFromHexString(d.ref_documento) });
    }
    await pg.query('DELETE FROM diseno WHERE id_trabajo = $1', [t.id_trabajo]);
    await db.collection('bitacora_eventos').deleteMany({ 'entidad.codigo': t.codigo });
    await pg.query('DELETE FROM trabajo WHERE id_trabajo = $1', [t.id_trabajo]);
    console.log(`    -> borrado.`);
  }

  await pg.end();
  await cliente.close();
  console.log(EJECUTAR
    ? 'Listo. Se borraron los trabajos de prueba y todo lo que dependía de ellos.'
    : '\nEsto fue solo una vista previa (no se borró nada). Para borrar de verdad: npm run db:limpiar-trabajos-prueba -- --si');
}

principal().catch((err) => { console.error('No fue posible limpiar los trabajos de prueba:', err.message); process.exit(1); });
