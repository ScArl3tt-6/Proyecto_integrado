'use strict';
const { Pool, types } = require('pg');

// pg devuelve BIGINT y NUMERIC como texto (para no perder precisión) y DATE como objeto Date en
// huso horario local. Los servicios esperan números reales y fechas 'AAAA-MM-DD' en texto, como
// entregaba el motor embebido anterior, así que se ajustan solo esos tres tipos.
const numeroOTexto = (valor) => (valor === null ? null : Number(valor));
const comoTexto = (valor) => valor;
const tiposPersonalizados = {
  getTypeParser(oid, formato) {
    if (oid === types.builtins.INT8) return numeroOTexto;
    if (oid === types.builtins.NUMERIC) return numeroOTexto;
    if (oid === types.builtins.DATE) return comoTexto;
    return types.getTypeParser(oid, formato);
  },
};

// PostgreSQL real (16), accedido siempre con el rol de menor privilegio que corresponda
// (sst_app en producción y demostración, sst_propietario o sst_pruebas solo desde scripts/tests).
async function crearBaseRelacional(urlConexion) {
  if (!urlConexion) throw new Error('crearBaseRelacional necesita una URL de conexión (SST_PG_URL)');
  const pool = new Pool({
    connectionString: urlConexion,
    application_name: 'sst-kotoduo',
    max: 10,
    types: tiposPersonalizados,
  });
  // Falla temprano y con un mensaje claro si la URL, el host o las credenciales están mal, en vez
  // de que el primer error aparezca recién con la primera consulta de un servicio.
  await pool.query('SELECT 1');

  async function query(texto, parametros) {
    const { rows } = await pool.query(texto, parametros);
    return { rows };
  }

  async function transaction(callback) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const tx = { query: async (texto, parametros) => ({ rows: (await cliente.query(texto, parametros)).rows }) };
      const resultado = await callback(tx);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      cliente.release();
    }
  }

  // Para scripts de administración (crear-base-postgres.js): varias sentencias DDL separadas por ';'
  // en una sola llamada. pg las ejecuta todas cuando no se pasan parámetros (protocolo simple).
  async function exec(sqlMultiple) {
    await pool.query(sqlMultiple);
  }

  async function close() {
    await pool.end();
  }

  return { query, transaction, exec, close };
}

module.exports = { crearBaseRelacional };
