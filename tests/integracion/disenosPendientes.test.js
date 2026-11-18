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
      archivos: [{ nombre: 'letrero.pdf', tipoMime: 'application/pdf', contenidoBase64: CABECERAS.pdf }],
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

  test('CP-57 (DEF-12) ninguna propuesta aparece más de una vez en la bandeja de pendientes', async () => {
    for (let i = 0; i < 3; i += 1) {
      const otro = await jorge.post('/api/trabajos', {
        idTipo: 1, descripcion: `Trabajo adicional ${i} para probar duplicados`, cantidad: 2, fechaCompromiso: fechaEnDias(15),
      });
      await valentina.post(`/api/trabajos/${otro.body.codigo}/tomar-diseno`);
      await valentina.post(`/api/disenos/trabajos/${otro.body.codigo}`, {
        archivos: [{ nombre: `adicional-${i}.pdf`, tipoMime: 'application/pdf', contenidoBase64: CABECERAS.pdf }],
      });
    }
    const vista = await marcela.get('/api/disenos/pendientes');
    const idsDiseno = vista.body.map((p) => p.idDiseno);
    const codigos = vista.body.map((p) => p.codigo);
    expect(idsDiseno).toHaveLength(new Set(idsDiseno).size);
    expect(codigos).toHaveLength(new Set(codigos).size);
  });
});
