'use strict';
// Prueba de rendimiento (CP-33): carga simulada de la planta con autocannon.
// Volumen: 300 trabajos registrados, 150 de ellos en producción en el área de Bordado.
const autocannon = require('autocannon');
const fs = require('node:fs');
const path = require('node:path');
const { crearContexto, fechaEnDias } = require('../tests/contexto');

const UMBRAL_P97_MS = 500;

async function poblar(pg, idVendedor) {
  for (let i = 1; i <= 300; i += 1) {
    const enProduccion = i <= 150;
    const { rows: [t] } = await pg.query(
      `INSERT INTO trabajo (codigo, id_tipo, descripcion, cantidad, fecha_compromiso, estado, id_vendedor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_trabajo`,
      [`KT-2026-${String(i).padStart(4, '0')}`, enProduccion ? 1 : 2, `Trabajo de carga ${i}`, 10 + (i % 50),
        fechaEnDias((i % 20) - 5), enProduccion ? 'EN_PRODUCCION' : 'SOLICITADO', idVendedor],
    );
    if (enProduccion) {
      await pg.query(
        `INSERT INTO etapa_trabajo (id_trabajo, id_etapa_plantilla, orden, estado, inicio)
         SELECT $1, id_etapa_plantilla, orden, CASE WHEN orden = 1 THEN 'EN_CURSO' ELSE 'PENDIENTE' END,
                CASE WHEN orden = 1 THEN now() END FROM etapa_plantilla WHERE id_tipo = 1`, [t.id_trabajo]);
    }
  }
}

function ejecutar(nombre, opciones) {
  return new Promise((resolve, reject) => {
    autocannon(opciones, (err, r) => (err ? reject(err) : resolve({
      escenario: nombre,
      conexiones: opciones.connections,
      duracionSeg: opciones.duration,
      solicitudes: r.requests.total,
      solicitudesPorSeg: Math.round(r.requests.average),
      latenciaPromedioMs: r.latency.average,
      latenciaP50Ms: r.latency.p50,
      latenciaP97_5Ms: r.latency.p97_5,
      latenciaP99Ms: r.latency.p99,
      latenciaMaxMs: r.latency.max,
      errores: r.errors + r.timeouts,
      respuestasNo2xx: r.non2xx,
      cumple: r.latency.p97_5 < UMBRAL_P97_MS && r.errors + r.timeouts === 0 && r.non2xx === 0,
    })));
  });
}

async function principal() {
  const ctx = await crearContexto();
  await poblar(ctx.pg, ctx.usuarios.jorge.idUsuario);
  const servidor = ctx.app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const cookiesDe = async (clave) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: ctx.usuarios[clave].correo, contrasena: ctx.usuarios[clave].contrasena }),
    });
    const { csrf } = await res.json();
    return { cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), csrf };
  };
  const operario = await cookiesDe('luis');
  const admin = await cookiesDe('koto');
  const vendedor = await cookiesDe('jorge');

  const resultados = [];
  resultados.push(await ejecutar('E1 Operarios consultan sus actividades (HU-04)', {
    url: `${base}/api/trabajos/mis-actividades`, connections: 25, duration: 20, headers: { cookie: operario.cookie },
  }));
  resultados.push(await ejecutar('E2 Administración consulta el panel general (HU-06)', {
    url: `${base}/api/panel`, connections: 10, duration: 20, headers: { cookie: admin.cookie },
  }));
  resultados.push(await ejecutar('E3 Vendedores registran solicitudes (HU-01)', {
    url: `${base}/api/trabajos`, method: 'POST', connections: 10, duration: 15,
    headers: { cookie: vendedor.cookie, 'x-csrf-token': vendedor.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ idTipo: 2, descripcion: 'Solicitud generada en prueba de carga', cantidad: 30, fechaCompromiso: fechaEnDias(10) }),
  }));

  servidor.close();
  await ctx.cerrar();

  const salida = {
    fecha: new Date().toISOString(),
    entorno: `Node.js ${process.version} - ${process.platform} - PostgreSQL embebido (PGlite) + MongoDB 8.3 local`,
    umbral: `p97,5 < ${UMBRAL_P97_MS} ms, 0 errores y 0 respuestas fuera de 2xx`,
    resultados,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'evidencias', 'rendimiento.json'), JSON.stringify(salida, null, 2));
  console.table(resultados.map(({ escenario, conexiones, solicitudes, solicitudesPorSeg, latenciaPromedioMs, latenciaP97_5Ms, latenciaP99Ms, errores, respuestasNo2xx, cumple }) => ({
    escenario, conexiones, solicitudes, 'sol/s': solicitudesPorSeg, 'prom ms': latenciaPromedioMs, 'p97,5 ms': latenciaP97_5Ms, 'p99 ms': latenciaP99Ms, errores, no2xx: respuestasNo2xx, cumple,
  })));
}

principal().catch((err) => { console.error(err); process.exit(1); });
