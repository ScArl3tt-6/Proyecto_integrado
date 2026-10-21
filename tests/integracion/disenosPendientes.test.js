'use strict';
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

describe('Propuestas de diseño pendientes de decisión', () => {
  let ctx; let jorge; let valentina; let marcela;
  let codigo; let idDiseno;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela] = await Promise.all(['jorge', 'valentina', 'marcela'].map((u) => ctx.iniciarSesion(u)));
    codigo = (await jorge.post('/api/trabajos', { idTipo: 3, descripcion: 'Letrero fachada local nuevo', cantidad: 1, fechaCompromiso: fechaEnDias(20) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const envio = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'letrero.pdf', tipoMime: 'application/pdf', tamanoBytes: 300000, cabeceraBase64: CABECERAS.pdf }],
    });
    idDiseno = envio.body.idDiseno;
  });
  afterAll(async () => ctx.cerrar());

  test('CP-44 producción ve las propuestas pendientes; diseño no tiene permiso para esa bandeja', async () => {
    const vista = await marcela.get('/api/disenos/pendientes');
    expect(vista.status).toBe(200);
    expect(vista.body).toEqual(expect.arrayContaining([expect.objectContaining({ idDiseno, codigo, disenador: 'Valentina Rojas' })]));

    const sinPermiso = await valentina.get('/api/disenos/pendientes');
    expect(sinPermiso.status).toBe(403);
  });
});
