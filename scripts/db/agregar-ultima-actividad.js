'use strict';
// Al agregar "ultima_actividad" a la tabla "sesion" (src/db/esquema.sql) para el cierre de sesión
// por inactividad, una base que ya existía desde antes de esta funcionalidad se queda sin la
// columna: crear-base-postgres.js solo aplica esquema.sql completo la primera vez (cuando la tabla
// "trabajo" todavía no existe). Este script, ejecutado a mano con "npm run db:agregar-ultima-actividad",
// usa sst_propietario (dueño del esquema) para agregarla en una base que ya existe. Es idempotente:
// no hace nada si la columna ya está.
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

async function principal() {
  const pg = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
  await pg.connect();
  await pg.query('ALTER TABLE sesion ADD COLUMN IF NOT EXISTS ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now()');
  console.log('Columna "ultima_actividad" lista en "sesion".');
  await pg.end();
}

principal().catch((err) => {
  console.error('No fue posible aplicar la migración:', err.message);
  process.exit(1);
});
