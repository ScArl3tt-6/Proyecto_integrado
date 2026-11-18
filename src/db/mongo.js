'use strict';
const { MongoClient } = require('mongodb');

// Base no estructurada: propuestas de diseño (estructura variable por tipo de trabajo)
// y bitácora de eventos de auditoría (RNF-03).
const ESQUEMA_PROPUESTA = {
  bsonType: 'object',
  required: ['trabajoCodigo', 'idDiseno', 'version', 'archivos', 'creadoEn'],
  properties: {
    trabajoCodigo: { bsonType: 'string', pattern: '^KT-[0-9]{4}-[0-9]{4}$' },
    idDiseno: { bsonType: ['int', 'null'] },
    version: { bsonType: 'int', minimum: 1 },
    archivos: {
      bsonType: 'array', minItems: 1, maxItems: 10,
      items: {
        bsonType: 'object', required: ['nombre', 'tipoMime', 'tamanoBytes', 'sha256', 'archivoId'],
        properties: {
          nombre: { bsonType: 'string' },
          tipoMime: { enum: ['application/pdf', 'image/png', 'image/jpeg'] },
          tamanoBytes: { bsonType: ['int', 'long'] },
          sha256: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
          // _id (como texto hexadecimal) del archivo real guardado en GridFS, bucket "disenos" (Fase 1).
          archivoId: { bsonType: 'string', pattern: '^[0-9a-f]{24}$' },
        },
      },
    },
    especificaciones: { bsonType: 'object' },
    comentarios: { bsonType: 'array' },
    creadoEn: { bsonType: 'date' },
  },
};

async function crearBaseDocumental(uri, nombreBase) {
  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  await cliente.connect();
  const db = cliente.db(nombreBase);
  const existentes = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);

  if (!existentes.includes('propuestas_diseno')) {
    await db.createCollection('propuestas_diseno', { validator: { $jsonSchema: ESQUEMA_PROPUESTA }, validationLevel: 'strict' });
  }
  if (!existentes.includes('bitacora_eventos')) await db.createCollection('bitacora_eventos');

  await db.collection('propuestas_diseno').createIndex({ trabajoCodigo: 1, version: -1 });
  await db.collection('bitacora_eventos').createIndex({ 'entidad.codigo': 1, fecha: -1 });
  await db.collection('bitacora_eventos').createIndex({ tipo: 1, fecha: -1 });
  return { cliente, db };
}

module.exports = { crearBaseDocumental, ESQUEMA_PROPUESTA };
