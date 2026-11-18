'use strict';
// Al agregar "mfa_secreto" y "mfa_ultimo_paso" a "usuario" (src/db/esquema.sql) para la
// verificación en dos pasos (Funcionalidad 5), una base que ya existía desde antes de esta
// funcionalidad se queda sin esas columnas: crear-base-postgres.js solo aplica esquema.sql
// completo la primera vez (cuando la tabla "trabajo" todavía no existe). Este script, ejecutado a
// mano con "npm run db:agregar-mfa", usa sst_propietario (dueño del esquema) para agregarlas en
// una base que ya existe. Es idempotente: no hace nada si ya están.
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

async function principal() {
  const pg = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
  await pg.connect();
  await pg.query('ALTER TABLE usuario ADD COLUMN IF NOT EXISTS mfa_secreto VARCHAR(64)');
  await pg.query('ALTER TABLE usuario ADD COLUMN IF NOT EXISTS mfa_ultimo_paso BIGINT');
  console.log('Columnas "mfa_secreto" y "mfa_ultimo_paso" listas en "usuario".');
  await pg.end();
}

principal().catch((err) => {
  console.error('No fue posible aplicar la migración:', err.message);
  process.exit(1);
});
