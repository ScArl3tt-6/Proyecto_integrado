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

  test('CP-44 producción ve las propuestas pendientes, con contador; diseño no tiene permiso para esa bandeja', async () => {
    const vista = await marcela.get('/api/disenos/pendientes');
    expect(vista.status).toBe(200);
    expect(vista.body.total).toBe(vista.body.items.length);
    expect(vista.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ idDiseno, codigo, disenador: 'Valentina Rojas' })]));

    const sinPermiso = await valentina.get('/api/disenos/pendientes');
    expect(sinPermiso.status).toBe(403);
  });

  // Punto 4 de la revisión del equipo (19-11-2026): la pantalla de decisión debe poder decir a
  // quién se rechaza (quién la envió y quién creó el trabajo) y qué etapa sigue si se aprueba,
  // ANTES de decidir, no solo después.
  test('CP-85 el detalle de una propuesta trae quién la envió, quién creó el trabajo, y la primera etapa si se aprueba', async () => {
    const detalle = await marcela.get(`/api/disenos/${idDiseno}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({
      codigo, vendedor: 'Jorge Saavedra', disenador: 'Valentina Rojas',
      primera_etapa: 'Impresión de gráfica', primera_etapa_area: 'Impresión gran formato',
    });
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
    const vista = await marcela.get('/api/disenos/pendientes?limite=50');
    const idsDiseno = vista.body.items.map((p) => p.idDiseno);
    const codigos = vista.body.items.map((p) => p.codigo);
    expect(idsDiseno).toHaveLength(new Set(idsDiseno).size);
    expect(codigos).toHaveLength(new Set(codigos).size);
  });

  test('CP-59 (Parte B) la bandeja de pendientes admite búsqueda por código y por descripción, orden por fecha y paginación', async () => {
    const porCodigo = await marcela.get(`/api/disenos/pendientes?busqueda=${codigo}`);
    expect(porCodigo.body.items.map((p) => p.codigo)).toEqual([codigo]);

    const porDescripcion = await marcela.get('/api/disenos/pendientes?busqueda=Letrero fachada');
    expect(porDescripcion.body.items.some((p) => p.codigo === codigo)).toBe(true);

    const sinCoincidencias = await marcela.get('/api/disenos/pendientes?busqueda=esto-no-existe-en-ningun-trabajo');
    expect(sinCoincidencias.body).toEqual({ total: 0, items: [] });

    const primeraPagina = await marcela.get('/api/disenos/pendientes?limite=1&pagina=1');
    expect(primeraPagina.body.items).toHaveLength(1);
    expect(primeraPagina.body.total).toBeGreaterThan(1);

    const ordenInvalido = await marcela.get('/api/disenos/pendientes?orden=no-es-valido');
    expect(ordenInvalido.status).toBe(400);
  });
});
