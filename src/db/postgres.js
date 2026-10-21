'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Motor PostgreSQL embebido para desarrollo y pruebas; en producción se usa PostgreSQL gestionado
// con el mismo esquema (src/db/esquema.sql).
async function crearBaseRelacional(directorio) {
  // PGlite crea el directorio final pero no sus padres: si SST_PG_DIRECTORIO apunta a una ruta nueva
  // de varios niveles (por ejemplo ./datos-demo/pg), falla con ENOENT si no existen antes.
  // directorio viene de SST_PG_DIRECTORIO (variable de entorno fijada por quien despliega), no de una entrada del usuario
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (directorio) fs.mkdirSync(directorio, { recursive: true });
  const db = new PGlite(directorio);
  await db.waitReady;
  const existe = await db.query("SELECT to_regclass('public.trabajo') AS t");
  if (!existe.rows[0].t) {
    await db.exec(fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, 'semilla.sql'), 'utf8'));
  }
  return db;
}

module.exports = { crearBaseRelacional };
