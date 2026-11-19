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

  test('CP-58 (DEF-12) ningún trabajo aparece más de una vez en el listado, incluido uno ya en producción con una etapa en curso', async () => {
    const { body: trabajo } = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: 'Trabajo en produccion para probar duplicados en el listado', cantidad: 5, fechaCompromiso: fechaEnDias(10),
    });
    await valentina.post(`/api/trabajos/${trabajo.codigo}/tomar-diseno`);
    const { body: diseno } = await valentina.post(`/api/disenos/trabajos/${trabajo.codigo}`, {
      archivos: [{ nombre: 'listado.pdf', tipoMime: 'application/pdf', contenidoBase64: Buffer.from('%PDF-1.7').toString('base64') }],
    });
    await marcela.post(`/api/disenos/${diseno.idDiseno}/decision`, { decision: 'APROBADO' });

    const res = await koto.get('/api/trabajos?limite=50');
    expect(res.status).toBe(200);
    const codigos = res.body.map((t) => t.codigo);
    expect(codigos.filter((c) => c === trabajo.codigo)).toHaveLength(1);
    expect(codigos).toHaveLength(new Set(codigos).size);

    const panel = await koto.get('/api/panel');
    const codigosPanel = Object.values(panel.body.grupos).flat().map((t) => t.codigo);
    expect(codigosPanel.filter((c) => c === trabajo.codigo)).toHaveLength(1);
  });

  test('CP-76 "busqueda" filtra el listado por código o por descripción (para elegir un trabajo de una lista)', async () => {
    const porCodigo = await koto.get(`/api/trabajos?busqueda=${codigoPaula}&limite=50`);
    expect(porCodigo.body.map((t) => t.codigo)).toEqual([codigoPaula]);

    const porDescripcion = await koto.get('/api/trabajos?busqueda=sublimados&limite=50');
    expect(porDescripcion.body.map((t) => t.codigo)).toContain(codigoPaula);
    expect(porDescripcion.body.map((t) => t.codigo)).not.toContain(codigoJorge);

    const sinCoincidencias = await koto.get('/api/trabajos?busqueda=esto-no-deberia-existir-en-ningun-trabajo');
    expect(sinCoincidencias.body).toEqual([]);
  });

  // Punto 2 de la revisión del equipo (19-11-2026): historial humano dentro del detalle, con el
  // mismo alcance por rol que ya decide el detalle, y acotado para Operario (su área, sin eventos
  // de diseño), que no tiene ruta al detalle general (CP-37).
  test('CP-84 el historial respeta el alcance por rol, y a Operario le llega acotado a su área sin eventos de diseño', async () => {
    expect((await jorge.get(`/api/trabajos/${codigoJorge}/historial`)).status).toBe(200);
    expect((await koto.get(`/api/trabajos/${codigoPaula}/historial`)).status).toBe(200); // Administración ve cualquiera

    const ajeno = await jorge.get(`/api/trabajos/${codigoPaula}/historial`);
    expect(ajeno.status).toBe(403); // otra persona vendedora, no es su propia solicitud

    // Mientras está en SOLICITADO/EN_DISENO, Diseño sí puede verlo
    await valentina.post(`/api/trabajos/${codigoJorge}/tomar-diseno`);
    const historialDiseno = await valentina.get(`/api/trabajos/${codigoJorge}/historial`);
    expect(historialDiseno.status).toBe(200);
    expect(historialDiseno.body.map((e) => e.tipo)).toEqual(expect.arrayContaining(['TRABAJO_CREADO', 'DISENO_INICIADO']));

    const { body: diseno } = await valentina.post(`/api/disenos/trabajos/${codigoJorge}`, {
      archivos: [{ nombre: 'cp84.pdf', tipoMime: 'application/pdf', contenidoBase64: Buffer.from('%PDF-1.7').toString('base64') }],
    });
    await marcela.post(`/api/disenos/${diseno.idDiseno}/decision`, { decision: 'APROBADO' }); // pasa a EN_PRODUCCION

    // Producción/Administración ven todo, incluidos los eventos de diseño
    const historialProduccion = await marcela.get(`/api/trabajos/${codigoJorge}/historial`);
    expect(historialProduccion.status).toBe(200);
    expect(historialProduccion.body.map((e) => e.tipo)).toEqual(expect.arrayContaining(['DISENO_ENVIADO', 'DISENO_APROBADO']));

    // Operario de la MISMA área (Bordado, idTipo 1): ve el historial, pero sin eventos de diseño
    const historialOperario = await luis.get(`/api/trabajos/${codigoJorge}/historial`);
    expect(historialOperario.status).toBe(200);
    expect(historialOperario.body.some((e) => e.tipo.startsWith('DISENO_'))).toBe(false);
    expect(historialOperario.body.map((e) => e.tipo)).toContain('TRABAJO_CREADO');

    // Operario de OTRA área (codigoPaula es idTipo 2, Sublimación; luis es de Bordado): sin acceso
    expect((await luis.get(`/api/trabajos/${codigoPaula}/historial`)).status).toBe(403);
  });

  // Punto 9 de la revisión del equipo (19-11-2026): "Mis solicitudes" pide la línea de tiempo de
  // etapas junto con el listado (conEtapas=true); por defecto no viene, para no cargar de más al
  // resto de las pantallas que usan el mismo listado.
  test('CP-91 "conEtapas" agrega la línea de tiempo de etapas al listado, con el mismo formato que el detalle', async () => {
    const sinEtapas = await jorge.get(`/api/trabajos?busqueda=${codigoJorge}`);
    expect(sinEtapas.body[0].etapas).toBeFalsy(); // por defecto, no viene

    const conEtapas = await jorge.get(`/api/trabajos?busqueda=${codigoJorge}&conEtapas=true`);
    const fila = conEtapas.body[0];
    expect(fila.etapas.length).toBeGreaterThan(0);
    expect(fila.etapas[0]).toMatchObject({ orden: 1, nombre: 'Preparación de matriz de bordado', area: 'Bordado', estado: 'EN_CURSO' });

    // Mismas etapas y mismos campos que usa listaEtapas() (orden, nombre, area, estado, responsable),
    // aunque detalle() además incluya "inicio"/"termino", que esa vista no necesita
    const detalle = await jorge.get(`/api/trabajos/${codigoJorge}`);
    expect(fila.etapas).toEqual(detalle.body.etapas.map((e) => ({ orden: e.orden, nombre: e.nombre, area: e.area, estado: e.estado, responsable: e.responsable })));
  });
});
