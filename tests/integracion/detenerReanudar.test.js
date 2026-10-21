'use strict';
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

describe('Detener y reanudar trabajos en producción', () => {
  let ctx; let jorge; let valentina; let marcela; let koto;
  let codigo;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, koto] = await Promise.all(['jorge', 'valentina', 'marcela', 'koto'].map((u) => ctx.iniciarSesion(u)));
    codigo = (await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Chalecos bordados turno noche', cantidad: 30, fechaCompromiso: fechaEnDias(12) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const { body: { idDiseno } } = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'chaleco.pdf', tipoMime: 'application/pdf', tamanoBytes: 200000, cabeceraBase64: CABECERAS.pdf }],
    });
    await marcela.post(`/api/disenos/${idDiseno}/decision`, { decision: 'APROBADO' });
  });
  afterAll(async () => ctx.cerrar());

  test('CP-40 producción detiene un trabajo en producción con motivo y luego lo reanuda', async () => {
    const detenido = await marcela.post(`/api/trabajos/${codigo}/detener`, { motivo: 'Falta hilo del color solicitado' });
    expect(detenido.status).toBe(200);
    expect(detenido.body).toEqual({ codigo, estado: 'DETENIDO' });

    const bitacora = await koto.get(`/api/auditoria/trabajos/${codigo}`);
    expect(bitacora.body.map((e) => e.tipo)).toEqual(expect.arrayContaining(['TRABAJO_DETENIDO']));

    const reanudado = await marcela.post(`/api/trabajos/${codigo}/reanudar`, {});
    expect(reanudado.status).toBe(200);
    expect(reanudado.body).toEqual({ codigo, estado: 'EN_PRODUCCION' });
    expect((await koto.get(`/api/auditoria/trabajos/${codigo}`)).body.map((e) => e.tipo)).toEqual(expect.arrayContaining(['TRABAJO_REANUDADO']));
  });

  test('CP-41 el vendedor no tiene permiso para detener un trabajo', async () => {
    const res = await jorge.post(`/api/trabajos/${codigo}/detener`, { motivo: 'Intento sin permiso' });
    expect(res.status).toBe(403);
  });

  test('CP-42 un motivo muy corto para detener responde 400', async () => {
    const res = await marcela.post(`/api/trabajos/${codigo}/detener`, { motivo: 'no' });
    expect(res.status).toBe(400);
  });

  test('CP-43 detener un trabajo que no está en producción responde 409', async () => {
    const otro = (await jorge.post('/api/trabajos', { idTipo: 2, descripcion: 'Tazones recien solicitados', cantidad: 5, fechaCompromiso: fechaEnDias(9) })).body.codigo;
    const res = await marcela.post(`/api/trabajos/${otro}/detener`, { motivo: 'Intento sobre un trabajo solicitado' });
    expect(res.status).toBe(409);
  });
});
