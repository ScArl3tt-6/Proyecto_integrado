'use strict';
const { crearContexto, fechaEnDias } = require('../contexto');

describe('Pruebas de integración - registrar materiales de un trabajo (RF-08)', () => {
  let ctx; let jorge; let marcela; let luis;
  let codigo;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, marcela, luis] = await Promise.all(['jorge', 'marcela', 'luis'].map((u) => ctx.iniciarSesion(u)));
    const res = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: '30 gorros bordados para colegio', cantidad: 30, fechaCompromiso: fechaEnDias(12),
    });
    codigo = res.body.codigo;
  });
  afterAll(async () => ctx.cerrar());

  test('CP-49 Producción registra un material y queda visible en el listado de materiales', async () => {
    const registro = await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 1, cantidad: 4.5, medida: 'Azul marino' });
    expect(registro.status).toBe(201);
    expect(registro.body).toEqual({ nombre: 'Hilo de bordar poliéster', unidad: 'cono', cantidad: 4.5, medida: 'Azul marino' });

    const listado = await marcela.get(`/api/trabajos/${codigo}/materiales`);
    expect(listado.body).toEqual([{ nombre: 'Hilo de bordar poliéster', unidad: 'cono', cantidad: 4.5, medida: 'Azul marino' }]);
  });

  test('CP-50 rechaza material inexistente, trabajo inexistente, cantidad inválida y a quien no tiene el permiso', async () => {
    expect((await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 9999, cantidad: 1 })).status).toBe(400);
    expect((await marcela.post('/api/trabajos/KT-2026-9999/materiales', { idMaterial: 1, cantidad: 1 })).status).toBe(404);
    expect((await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 1, cantidad: 0 })).status).toBe(400);
    expect((await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 1, cantidad: -3 })).status).toBe(400);
    // Vendedor y operario pueden ver materiales (según alcance), pero no registrarlos
    expect((await jorge.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 2, cantidad: 1 })).status).toBe(403);
    expect((await luis.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 2, cantidad: 1 })).status).toBe(403);
  });

  test('CP-51 (borde) registrar de nuevo el mismo material corrige la cantidad y la medida en vez de duplicar la fila', async () => {
    await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 2, cantidad: 10, medida: 'Carta' });
    const corregido = await marcela.post(`/api/trabajos/${codigo}/materiales`, { idMaterial: 2, cantidad: 7, medida: 'Oficio' });
    expect(corregido.status).toBe(201);

    const listado = await marcela.get(`/api/trabajos/${codigo}/materiales`);
    const papel = listado.body.filter((m) => m.nombre === 'Papel transfer');
    expect(papel).toHaveLength(1);
    expect(papel[0]).toEqual({ nombre: 'Papel transfer', unidad: 'hoja', cantidad: 7, medida: 'Oficio' });
  });
});
