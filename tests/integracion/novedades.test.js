'use strict';
const request = require('supertest');
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

// Punto 5 de la revisión del equipo (19-11-2026): novedades para Vendedor y Diseño, a partir de
// eventos que ya existen (sin correo ni servicios nuevos): rechazo, aprobación, cambio de etapa o
// término de una solicitud propia.
describe('Novedades: aviso visible (contador + lista) para Vendedor y Diseño', () => {
  let ctx; let jorge; let valentina; let marcela; let luis;
  let codigo; let idDiseno;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, luis] = await Promise.all(
      ['jorge', 'valentina', 'marcela', 'luis'].map((u) => ctx.iniciarSesion(u)),
    );
    codigo = (await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Gorros bordados para novedades', cantidad: 5, fechaCompromiso: fechaEnDias(9) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const envio = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'gorro.pdf', tipoMime: 'application/pdf', contenidoBase64: CABECERAS.pdf }],
    });
    idDiseno = envio.body.idDiseno;
  });
  afterAll(async () => ctx.cerrar());

  test('CP-86 Producción y Operario no tienen permiso para ver novedades (es solo de Vendedor y Diseño)', async () => {
    expect((await marcela.get('/api/auditoria/novedades')).status).toBe(403);
    expect((await luis.get('/api/auditoria/novedades')).status).toBe(403);
  });

  test('CP-87 Vendedor y Diseño ven la aprobación de la propuesta como novedad, con contador de no vistas', async () => {
    const antes = await jorge.get('/api/auditoria/novedades');
    expect(antes.body).toMatchObject({ noVistas: 0, eventos: [] }); // todavía no hay nada que avisar

    await marcela.post(`/api/disenos/${idDiseno}/decision`, { decision: 'APROBADO' });

    const jorgeNovedades = await jorge.get('/api/auditoria/novedades');
    expect(jorgeNovedades.body.noVistas).toBe(1);
    expect(jorgeNovedades.body.eventos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'DISENO_APROBADO', entidad: { tipo: 'trabajo', codigo } })]));

    const valentinaNovedades = await valentina.get('/api/auditoria/novedades');
    expect(valentinaNovedades.body.noVistas).toBe(1);
    expect(valentinaNovedades.body.eventos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'DISENO_APROBADO' })]));

    // Marcarlas como vistas baja el contador a 0 para lo ya visto
    await jorge.post('/api/auditoria/novedades/vistas', {});
    expect((await jorge.get('/api/auditoria/novedades')).body.noVistas).toBe(0);
    // A valentina no le afecta que jorge haya marcado las suyas como vistas
    expect((await valentina.get('/api/auditoria/novedades')).body.noVistas).toBe(1);
  });

  test('CP-88 Vendedor ve cuando el trabajo termina; Diseño también (aunque ya no puede ver el detalle)', async () => {
    await luis.post(`/api/trabajos/${codigo}/etapas/1/comenzar`, {});
    await luis.post(`/api/trabajos/${codigo}/etapas/1/completar`, {});
    await luis.post(`/api/trabajos/${codigo}/etapas/2/comenzar`, {});
    await luis.post(`/api/trabajos/${codigo}/etapas/2/completar`, {});
    await luis.post(`/api/trabajos/${codigo}/etapas/3/comenzar`, {});
    await luis.post(`/api/trabajos/${codigo}/etapas/3/completar`, {}); // última etapa: el trabajo queda TERMINADO

    for (const agente of [jorge, valentina]) {
      const { body } = await agente.get('/api/auditoria/novedades');
      const terminado = body.eventos.find((e) => e.tipo === 'ETAPA_COMPLETADA' && e.detalle?.trabajoTerminado);
      expect(terminado).toBeTruthy();
    }

    // Diseño no puede ver el detalle del trabajo (ya está TERMINADO, fuera de su alcance), pero sí se entera por Novedades
    expect((await valentina.get(`/api/trabajos/${codigo}`)).status).toBe(403);
  });

  test('CP-89 Diseño no ve novedades de propuestas que no envió él mismo', async () => {
    const otroCodigo = (await jorge.post('/api/trabajos', { idTipo: 2, descripcion: 'Tazones para otra diseñadora', cantidad: 3, fechaCompromiso: fechaEnDias(12) })).body.codigo;
    await ctx.servicios.usuarios.crear(null, {
      nombre: 'Otra Disenadora', correo: 'otra-disenadora-cp89@kotoduo.test', contrasena: 'cordel celeste sobre tela blanca', rol: 'DISENO', area: 'Diseño',
    });
    const otraAgente = await iniciarSesionDirecta(ctx, 'otra-disenadora-cp89@kotoduo.test', 'cordel celeste sobre tela blanca');
    await otraAgente.post(`/api/trabajos/${otroCodigo}/tomar-diseno`);
    const envioOtra = await otraAgente.post(`/api/disenos/trabajos/${otroCodigo}`, {
      archivos: [{ nombre: 'tazon.pdf', tipoMime: 'application/pdf', contenidoBase64: CABECERAS.pdf }],
    });
    await marcela.post(`/api/disenos/${envioOtra.body.idDiseno}/decision`, { decision: 'APROBADO' });

    const novedadesValentina = await valentina.get('/api/auditoria/novedades');
    expect(novedadesValentina.body.eventos.some((e) => e.entidad.codigo === otroCodigo)).toBe(false);
  });
});

async function iniciarSesionDirecta(ctx, correo, contrasena) {
  const agente = request.agent(ctx.app);
  const res = await agente.post('/api/auth/login').send({ correo, contrasena });
  if (res.status !== 200) throw new Error(`No fue posible iniciar sesión: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    get: (url) => agente.get(url),
    post: (url, cuerpo) => agente.post(url).set('X-CSRF-Token', res.body.csrf).send(cuerpo),
  };
}
