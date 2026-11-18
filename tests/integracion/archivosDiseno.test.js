'use strict';
const { crearContexto, fechaEnDias } = require('../contexto');

describe('Pruebas de integración - archivo real de una propuesta de diseño en GridFS (Fase 1)', () => {
  let ctx; let jorge; let valentina; let marcela;
  let codigo; let idDiseno; let archivoId;
  let contenidoReal;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela] = await Promise.all(['jorge', 'valentina', 'marcela'].map((u) => ctx.iniciarSesion(u)));

    // Contenido real, no solo la firma: así la comparación byte a byte de CP-52 demuestra que se
    // guardó el archivo completo en GridFS, no solo sus primeros bytes (como antes de esta fase).
    const firmaPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const relleno = Buffer.from('Logo bordado club deportivo, versión final aprobada. '.repeat(100));
    contenidoReal = Buffer.concat([firmaPdf, relleno]);

    const { body: trabajo } = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: 'Poleras bordadas con logo nuevo', cantidad: 15, fechaCompromiso: fechaEnDias(10),
    });
    codigo = trabajo.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const envio = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'logo_final.pdf', tipoMime: 'application/pdf', contenidoBase64: contenidoReal.toString('base64') }],
    });
    idDiseno = envio.body.idDiseno;
    const doc = await ctx.mongoDb.collection('propuestas_diseno').findOne({ idDiseno });
    archivoId = doc.archivos[0].archivoId;
  });
  afterAll(async () => ctx.cerrar());

  test('CP-52 producción descarga el archivo real y su contenido coincide byte a byte con lo subido por diseño', async () => {
    const res = await marcela.get(`/api/disenos/${idDiseno}/archivos/${archivoId}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(res.body, contenidoReal)).toBe(0);
  });

  test('CP-53 rechaza descargar sin el permiso, un archivo de otro diseño, un diseño inexistente y un id con formato inválido', async () => {
    expect((await jorge.get(`/api/disenos/${idDiseno}/archivos/${archivoId}`)).status).toBe(403);

    const otro = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: 'Otro trabajo sin relación', cantidad: 5, fechaCompromiso: fechaEnDias(10),
    });
    await valentina.post(`/api/trabajos/${otro.body.codigo}/tomar-diseno`);
    const envioOtro = await valentina.post(`/api/disenos/trabajos/${otro.body.codigo}`, {
      archivos: [{ nombre: 'otro.pdf', tipoMime: 'application/pdf', contenidoBase64: contenidoReal.toString('base64') }],
    });
    // archivoId real, pero pedido junto al idDiseno de OTRO trabajo: no debe entregarlo (protección contra IDOR)
    expect((await marcela.get(`/api/disenos/${idDiseno}/archivos/${archivoId.replace(/.$/, archivoId.at(-1) === '0' ? '1' : '0')}`)).status).toBe(404);
    expect((await marcela.get(`/api/disenos/${envioOtro.body.idDiseno}/archivos/${archivoId}`)).status).toBe(404);

    expect((await marcela.get(`/api/disenos/999999/archivos/${archivoId}`)).status).toBe(404);
    expect((await marcela.get(`/api/disenos/${idDiseno}/archivos/no-es-un-id-valido`)).status).toBe(400);
  });

  test('CP-54 (borde) si el trabajo no existe, no queda ningún archivo huérfano en GridFS', async () => {
    const antes = await ctx.mongoDb.collection('disenos.files').countDocuments();
    const res = await valentina.post('/api/disenos/trabajos/KT-2026-9999', {
      archivos: [{ nombre: 'huerfano.pdf', tipoMime: 'application/pdf', contenidoBase64: contenidoReal.toString('base64') }],
    });
    expect(res.status).toBe(404);
    expect(await ctx.mongoDb.collection('disenos.files').countDocuments()).toBe(antes);
  });
});
