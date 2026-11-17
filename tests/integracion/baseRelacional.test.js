'use strict';
// Prueba directa de src/db/postgres.js: exec() no la llama ningún servicio hoy (la aplicación de
// esquema.sql/semilla.sql se movió a scripts/db/crear-base-postgres.js, con su propia conexión),
// pero el enunciado de la Fase 0 pide conservarla en la interfaz para los scripts de administración
// (varias sentencias DDL separadas por punto y coma en una sola llamada). Se prueba por separado
// para no dejarla sin cobertura.
const crypto = require('node:crypto');
const { Client } = require('pg');
const { cargarEnv } = require('../../scripts/cargarEnv');
const { crearBaseRelacional } = require('../../src/db/postgres');

cargarEnv();

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en .env (ejecuta "npm run db:crear" antes de correr las pruebas)`);
  return valor;
}

describe('src/db/postgres.js: exec() para scripts de administración', () => {
  let nombreBase;
  let urlBase;

  beforeAll(async () => {
    const urlPruebas = requerida('SST_PG_PRUEBAS_URL');
    nombreBase = `sst_prueba_${crypto.randomBytes(4).toString('hex')}`;
    const administracion = new Client({ connectionString: urlPruebas });
    await administracion.connect();
    await administracion.query(`CREATE DATABASE ${nombreBase}`);
    await administracion.end();
    const url = new URL(urlPruebas);
    url.pathname = `/${nombreBase}`;
    urlBase = url.toString();
  });

  afterAll(async () => {
    const urlPruebas = requerida('SST_PG_PRUEBAS_URL');
    const administracion = new Client({ connectionString: urlPruebas });
    await administracion.connect();
    await administracion.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
    await administracion.end();
  });

  test('CP-47 exec() aplica varias sentencias DDL separadas por punto y coma en una sola llamada', async () => {
    const pg = await crearBaseRelacional(urlBase);
    try {
      await pg.exec(`
        CREATE TABLE prueba_exec_a (id INT PRIMARY KEY);
        CREATE TABLE prueba_exec_b (id INT PRIMARY KEY, ref INT REFERENCES prueba_exec_a(id));
      `);
      const { rows } = await pg.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name IN ('prueba_exec_a', 'prueba_exec_b') ORDER BY table_name",
      );
      expect(rows.map((r) => r.table_name)).toEqual(['prueba_exec_a', 'prueba_exec_b']);
    } finally {
      await pg.close();
    }
  });

  test('CP-48 crearBaseRelacional() exige una URL de conexión', async () => {
    await expect(crearBaseRelacional()).rejects.toThrow('crearBaseRelacional necesita una URL de conexión');
  });
});
