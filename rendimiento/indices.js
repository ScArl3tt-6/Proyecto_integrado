'use strict';
// Evidencia de optimización medible (3.1.2.4): en una base PostgreSQL temporal con 5.000 trabajos
// sintéticos, compara el plan y el tiempo de las tres consultas más frecuentes CON y SIN los
// índices de src/db/esquema.sql. La base se crea y se borra con el rol sst_pruebas (igual que las
// pruebas automáticas); nunca se toca la base real sst_kotoduo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { cargarEnv } = require('../scripts/cargarEnv');

cargarEnv();

const lineas = [];
const log = (t = '') => { lineas.push(t); console.log(t); };

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en .env (ejecuta "npm run db:crear" primero)`);
  return valor;
}

// Los índices que participan en las tres consultas de este reporte. Se identifican por nombre,
// tal como quedaron definidos al final de src/db/esquema.sql.
const INDICES = {
  idx_etapa_trabajo_estado: "CREATE INDEX idx_etapa_trabajo_estado ON etapa_trabajo(estado, id_etapa_plantilla)",
  idx_etapa_plantilla_area: 'CREATE INDEX idx_etapa_plantilla_area ON etapa_plantilla(id_area)',
  idx_trabajo_estado: 'CREATE INDEX idx_trabajo_estado ON trabajo(estado)',
  idx_trabajo_compromiso: 'CREATE INDEX idx_trabajo_compromiso ON trabajo(estado, fecha_compromiso)',
};

const CONSULTAS = [
  {
    nombre: 'Actividades del área (HU-04): operario de Bordado consultando su trabajo vigente',
    sql: `SELECT t.codigo, tt.nombre AS tipo, t.descripcion, t.cantidad, t.fecha_compromiso, t.estado AS estado_trabajo,
                 ep.orden, ep.nombre AS etapa_actual, et.estado AS estado_etapa
            FROM etapa_trabajo et
            JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
            JOIN trabajo t ON t.id_trabajo = et.id_trabajo
            JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
           WHERE ep.id_area = 3 AND et.estado = 'EN_CURSO' AND t.estado = 'EN_PRODUCCION'
           ORDER BY t.fecha_compromiso ASC
           LIMIT 20`,
  },
  {
    nombre: 'Panel general (HU-06): resumen de todos los trabajos agrupados por estado',
    sql: `SELECT t.codigo, tt.nombre AS tipo, t.estado, t.fecha_compromiso,
                 COALESCE(a.nombre, CASE WHEN t.estado IN ('SOLICITADO','EN_DISENO') THEN 'Diseño'
                                         WHEN t.estado = 'PENDIENTE_APROBACION' THEN 'Producción (aprobación)' END) AS area_responsable
            FROM trabajo t
            JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
            LEFT JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo AND et.estado = 'EN_CURSO'
            LEFT JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
            LEFT JOIN area a ON a.id_area = ep.id_area
           ORDER BY t.fecha_compromiso ASC`,
  },
  {
    nombre: 'Listado por estado (sección 4.2): producción filtrando trabajos EN_PRODUCCION',
    sql: `SELECT codigo, estado, fecha_compromiso FROM trabajo
           WHERE ($1::varchar IS NULL OR estado = $1)
           ORDER BY fecha_compromiso ASC
           LIMIT 20`,
    parametros: ['EN_PRODUCCION'],
  },
];

async function crearBaseTemporal() {
  const urlPruebas = requerida('SST_PG_PRUEBAS_URL');
  const nombreBase = `sst_indices_${crypto.randomBytes(4).toString('hex')}`;
  const administracion = new Client({ connectionString: urlPruebas });
  await administracion.connect();
  await administracion.query(`CREATE DATABASE ${nombreBase}`);
  await administracion.end();

  const url = new URL(urlPruebas);
  url.pathname = `/${nombreBase}`;
  return { url: url.toString(), nombreBase, urlPruebas };
}

async function destruirBaseTemporal({ nombreBase, urlPruebas }) {
  const administracion = new Client({ connectionString: urlPruebas });
  await administracion.connect();
  await administracion.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
  await administracion.end();
}

async function poblar(cliente) {
  // 300 vendedores "sintéticos" (un id de usuario es obligatorio como id_vendedor) y 5000 trabajos,
  // 40% de ellos EN_PRODUCCION con una etapa EN_CURSO en el área de Bordado (id_area = 3), para que
  // las tres consultas tengan datos realistas que recorrer.
  await cliente.query(`
    INSERT INTO usuario (nombre, correo, hash_contrasena, id_rol)
    SELECT 'Vendedor sintético ' || g, 'vendedor' || g || '@sintetico.test', 'x', (SELECT id_rol FROM rol WHERE nombre = 'VENDEDOR')
      FROM generate_series(1, 5) AS g`);
  const { rows: vendedores } = await cliente.query('SELECT id_usuario FROM usuario');
  const idVendedor = vendedores[0].id_usuario;

  await cliente.query(`
    INSERT INTO trabajo (codigo, id_tipo, descripcion, cantidad, fecha_compromiso, estado, id_vendedor)
    SELECT 'KT-2026-' || LPAD(g::text, 5, '0'),
           1 + (g % 5),
           'Trabajo sintético número ' || g,
           1 + (g % 100),
           CURRENT_DATE + ((g % 60) - 30),
           (ARRAY['SOLICITADO','EN_DISENO','PENDIENTE_APROBACION','EN_PRODUCCION','DETENIDO','TERMINADO'])[1 + (g % 6)],
           $1
      FROM generate_series(1, 5000) AS g`, [idVendedor]);

  // Para los trabajos que quedaron EN_PRODUCCION con tipo Bordado (id_tipo = 1), se agrega la
  // primera etapa EN_CURSO en el área de Bordado, igual que hace servicioDisenos.decidir() al aprobar.
  await cliente.query(`
    INSERT INTO etapa_trabajo (id_trabajo, id_etapa_plantilla, orden, estado, inicio)
    SELECT t.id_trabajo, ep.id_etapa_plantilla, ep.orden, 'EN_CURSO', now()
      FROM trabajo t
      JOIN etapa_plantilla ep ON ep.id_tipo = t.id_tipo AND ep.orden = 1
     WHERE t.estado = 'EN_PRODUCCION' AND t.id_tipo = 1`);

  const { rows: conteo } = await cliente.query("SELECT COUNT(*)::int AS n FROM trabajo WHERE estado = 'EN_PRODUCCION'");
  return conteo[0].n;
}

async function medir(cliente, consulta) {
  const { rows } = await cliente.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${consulta.sql}`, consulta.parametros);
  const texto = rows.map((r) => r['QUERY PLAN']).join('\n');
  const tiempo = /Execution Time: ([\d.]+) ms/.exec(texto)?.[1];
  return { texto, tiempoMs: tiempo ? Number(tiempo) : null };
}

async function conIndices(cliente, presentes) {
  const resultados = [];
  for (const consulta of CONSULTAS) {
    const resultado = await medir(cliente, consulta);
    resultados.push({ nombre: consulta.nombre, ...resultado });
  }
  return resultados;
}

async function principal() {
  const basePrueba = await crearBaseTemporal();
  const cliente = new Client({ connectionString: basePrueba.url });
  await cliente.connect();
  await cliente.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'esquema.sql'), 'utf8'));
  await cliente.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'semilla.sql'), 'utf8'));

  log('=== Evidencia de optimización: índices de PostgreSQL ===');
  log(`Base temporal: ${basePrueba.nombreBase}`);
  const enProduccion = await poblar(cliente);
  await cliente.query('ANALYZE'); // para que el planificador use estadísticas reales, no las de una tabla vacía
  log(`Trabajos sintéticos: 5000 (de ellos, ${enProduccion} en estado EN_PRODUCCION)\n`);

  log('--- CON los índices de esquema.sql ---');
  const conIndice = await conIndices(cliente);
  conIndice.forEach((r) => { log(`\n[${r.nombre}]`); log(`Tiempo de ejecución: ${r.tiempoMs} ms`); log(r.texto); });

  log('\n--- Quitando los índices relevantes (DROP INDEX) ---');
  for (const nombre of Object.keys(INDICES)) {
    await cliente.query(`DROP INDEX IF EXISTS ${nombre}`);
    log(`  ${nombre} eliminado.`);
  }
  await cliente.query('ANALYZE');

  log('\n--- SIN los índices ---');
  const sinIndice = await conIndices(cliente);
  sinIndice.forEach((r) => { log(`\n[${r.nombre}]`); log(`Tiempo de ejecución: ${r.tiempoMs} ms`); log(r.texto); });

  log('\n=== Comparación ===');
  for (let i = 0; i < CONSULTAS.length; i += 1) {
    const con = conIndice[i].tiempoMs;
    const sin = sinIndice[i].tiempoMs;
    const diferencia = con !== null && sin !== null ? (((sin - con) / sin) * 100).toFixed(1) : 'N/D';
    log(`${CONSULTAS[i].nombre}`);
    log(`  con índices: ${con} ms · sin índices: ${sin} ms · mejora: ${diferencia === 'N/D' ? 'N/D' : `${diferencia}%`}`);
    if (con !== null && sin !== null && con >= sin) {
      log('  NOTA: con esta cantidad de filas, el índice no mostró una mejora medible (puede deberse a que el planificador igual optó por un recorrido secuencial). Se deja constancia tal cual, sin maquillarlo.');
    }
  }

  // Recrea los índices eliminados, por si alguien reutiliza esta misma conexión para algo más.
  for (const sentencia of Object.values(INDICES)) await cliente.query(sentencia);
  await cliente.end();
  await destruirBaseTemporal(basePrueba);

  fs.writeFileSync(path.join(__dirname, '..', 'evidencias', 'indices_postgresql.txt'), lineas.join('\n'));
  console.log('\nEvidencia guardada en evidencias/indices_postgresql.txt');
}

principal().catch((err) => { console.error('No fue posible generar la evidencia de índices:', err.message); process.exit(1); });
