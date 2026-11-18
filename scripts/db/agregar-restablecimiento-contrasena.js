'use strict';
// Al agregar la tabla "restablecimiento_contrasena" (src/db/esquema.sql) para el restablecimiento
// de contraseña por enlace (Funcionalidad 4), una base que ya existía desde antes de esta
// funcionalidad se queda sin ella: crear-base-postgres.js solo aplica esquema.sql completo la
// primera vez (cuando la tabla "trabajo" todavía no existe). Este script, ejecutado a mano con
// "npm run db:agregar-restablecimiento", usa sst_propietario (dueño del esquema) para crearla en
// una base que ya existe. Es idempotente: no hace nada si la tabla ya está.
const { Client } = require('pg');
const { cargarEnv } = require('../cargarEnv');

cargarEnv();

async function principal() {
  const pg = new Client({ connectionString: process.env.SST_PG_PROPIETARIO_URL });
  await pg.connect();
  await pg.query(`
    CREATE TABLE IF NOT EXISTS restablecimiento_contrasena (
      id_restablecimiento  UUID PRIMARY KEY,
      id_usuario           INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      hash_token           CHAR(64) NOT NULL UNIQUE,
      expira_en            TIMESTAMPTZ NOT NULL,
      usado                BOOLEAN NOT NULL DEFAULT FALSE,
      creado_por           INTEGER NOT NULL REFERENCES usuario(id_usuario),
      creado_en            TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('Tabla "restablecimiento_contrasena" lista.');
  await pg.end();
}

principal().catch((err) => {
  console.error('No fue posible aplicar la migración:', err.message);
  process.exit(1);
});
