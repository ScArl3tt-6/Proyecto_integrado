'use strict';
// Al agregar "novedades_vistas_en" a "usuario" (src/db/esquema.sql) para el aviso de Novedades de
// Vendedor y Diseño (punto 5 de la revisión del equipo, 19-11-2026), una base que ya existía desde
// antes de esta funcionalidad se queda sin la columna: crear-base-postgres.js solo aplica
// esquema.sql completo la primera vez (cuando la tabla "trabajo" todavía no existe). Este script,
// ejecutado a mano con "npm run db:agregar-novedades-vistas", usa sst_propietario (dueño del
// esquema) para agregarla en una base que ya existe. Es idempotente: no hace nada si ya está.
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

async function principal() {
  const pg = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
  await pg.connect();
  await pg.query("ALTER TABLE usuario ADD COLUMN IF NOT EXISTS novedades_vistas_en TIMESTAMPTZ NOT NULL DEFAULT '-infinity'");
  console.log('Columna "novedades_vistas_en" lista en "usuario".');
  await pg.end();
}

principal().catch((err) => {
  console.error('No fue posible aplicar la migración:', err.message);
  process.exit(1);
});
