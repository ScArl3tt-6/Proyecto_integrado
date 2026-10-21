'use strict';
const request = require('supertest');
const { crearContexto, fechaEnDias } = require('../contexto');

describe('Listado y detalle de trabajos con alcance por rol', () => {
  let ctx; let jorge; let valentina; let marcela; let koto; let luis; let paula;
  let codigoJorge; let codigoPaula;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, koto, luis] = await Promise.all(
      ['jorge', 'valentina', 'marcela', 'koto', 'luis'].map((u) => ctx.iniciarSesion(u)),
    );
    // Segunda vendedora, para comprobar que el alcance del vendedor no mezcla solicitudes de otra persona
    await ctx.servicios.usuarios.crear(null, {
      nombre: 'Paula Rivas', correo: 'paula@kotoduo.test', contrasena: 'cordel celeste sobre tela blanca', rol: 'VENDEDOR', area: 'Ventas',
    });
    const agente = request.agent(ctx.app);
    const login = await agente.post('/api/auth/login').send({ correo: 'paula@kotoduo.test', contrasena: 'cordel celeste sobre tela blanca' });
    paula = {
      get: (url) => agente.get(url),
      post: (url, cuerpo) => agente.post(url).set('X-CSRF-Token', login.body.csrf).send(cuerpo),
    };

    codigoJorge = (await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Poleras bordadas colegio', cantidad: 10, fechaCompromiso: fechaEnDias(5) })).body.codigo;
    codigoPaula = (await paula.post('/api/trabajos', { idTipo: 2, descripcion: 'Tazones sublimados egreso', cantidad: 15, fechaCompromiso: fechaEnDias(6) })).body.codigo;
  });
  afterAll(async () => ctx.cerrar());

  test('CP-35 el vendedor lista solo los trabajos que registró', async () => {
    const res = await jorge.get('/api/trabajos');
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.codigo)).toEqual([codigoJorge]);
  });

  test('CP-36 diseño ve solo lo pendiente de diseñar; producción ve todos los trabajos', async () => {
    const vistaDiseno = await valentina.get('/api/trabajos');
    expect(vistaDiseno.status).toBe(200);
    expect(vistaDiseno.body.map((t) => t.codigo).sort()).toEqual([codigoJorge, codigoPaula].sort());

    const vistaProduccion = await marcela.get('/api/trabajos');
    expect(vistaProduccion.body.map((t) => t.codigo)).toEqual(expect.arrayContaining([codigoJorge, codigoPaula]));
  });

  test('CP-37 el operario no tiene permiso para listar ni ver el detalle de trabajos', async () => {
    expect((await luis.get('/api/trabajos')).status).toBe(403);
    expect((await luis.get(`/api/trabajos/${codigoJorge}`)).status).toBe(403);
  });

  test('CP-38 el detalle respeta el alcance: el vendedor ve el propio y no el de otra persona', async () => {
    const propio = await jorge.get(`/api/trabajos/${codigoJorge}`);
    expect(propio.status).toBe(200);
    expect(propio.body).toMatchObject({ codigo: codigoJorge, tipo: 'Bordado', estado: 'SOLICITADO' });
    expect(propio.body.etapas).toEqual([]);

    const ajeno = await jorge.get(`/api/trabajos/${codigoPaula}`);
    expect(ajeno.status).toBe(403);

    const admin = await koto.get(`/api/trabajos/${codigoPaula}`);
    expect(admin.status).toBe(200);
  });

  test('CP-39 un estado o una página fuera de rango en el listado responde 400', async () => {
    expect((await marcela.get('/api/trabajos?estado=INEXISTENTE')).status).toBe(400);
    expect((await marcela.get('/api/trabajos?pagina=0')).status).toBe(400);
  });
});
