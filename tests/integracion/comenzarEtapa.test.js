'use strict';
const request = require('supertest');
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

// Punto 3 de la revisión del equipo (18-11-2026): "Comenzar etapa" debe ser atómica (si dos
// operarios la toman a la vez, solo uno gana), visible para el resto como "En curso por <nombre>",
// y solo quien la tomó (o Producción) puede completarla.
describe('Comenzar etapa: reclamo atómico y completarla solo quien la tomó', () => {
  let ctx; let jorge; let valentina; let marcela; let luis;
  let codigo;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, luis] = await Promise.all(['jorge', 'valentina', 'marcela', 'luis'].map((u) => ctx.iniciarSesion(u)));
    codigo = (await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Gorros bordados para prueba de concurrencia', cantidad: 10, fechaCompromiso: fechaEnDias(9) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const { body: { idDiseno } } = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'gorro.pdf', tipoMime: 'application/pdf', contenidoBase64: CABECERAS.pdf }],
    });
    await marcela.post(`/api/disenos/${idDiseno}/decision`, { decision: 'APROBADO' });
  });
  afterAll(async () => ctx.cerrar());

  test('CP-74 dos operarios de la misma área toman la misma etapa a la vez: solo uno gana (concurrencia real)', async () => {
    const { idUsuario: idOtro } = await ctx.servicios.usuarios.crear(null, {
      nombre: 'Otro Operario Bordado', correo: 'otro-bordado-cp74@kotoduo.test', contrasena: 'Clave segura de prueba número uno', rol: 'OPERARIO', area: 'Bordado',
    });
    const agenteOtro = await iniciarSesionDirecta(ctx, 'otro-bordado-cp74@kotoduo.test', 'Clave segura de prueba número uno');

    // Antes de tomarla: aparece en "Mis actividades" sin responsable, y nadie puede completarla todavía
    const antes = await luis.get('/api/trabajos/mis-actividades');
    expect(antes.body[0]).toMatchObject({ codigo, id_responsable: null, responsable: null });
    expect((await luis.post(`/api/trabajos/${codigo}/etapas/1/completar`, {})).status).toBe(409);

    // Dos operarios de la MISMA área intentan tomar la MISMA etapa al mismo tiempo (concurrencia real, no simulada)
    const [resLuis, resOtro] = await Promise.all([
      luis.post(`/api/trabajos/${codigo}/etapas/1/comenzar`, {}),
      agenteOtro.post(`/api/trabajos/${codigo}/etapas/1/comenzar`, {}),
    ]);
    const resultados = [resLuis.status, resOtro.status].sort();
    expect(resultados).toEqual([200, 409]); // exactamente uno gana

    const ganoLuis = resLuis.status === 200;

    // El resto del área ahora la ve "En curso por <nombre>", no disponible para tomar
    const despues = await luis.get('/api/trabajos/mis-actividades');
    expect(despues.body[0].responsable).toBe(ganoLuis ? 'Luis Cárdenas' : 'Otro Operario Bordado');
    expect(despues.body[0].id_responsable).toBe(ganoLuis ? ctx.usuarios.luis.idUsuario : idOtro);

    // Quien perdió la carrera no puede completarla; quien la tomó, sí
    const perdedor = ganoLuis ? agenteOtro : luis;
    const ganador = ganoLuis ? luis : agenteOtro;
    expect((await perdedor.post(`/api/trabajos/${codigo}/etapas/1/completar`, {})).status).toBe(409);
    expect((await ganador.post(`/api/trabajos/${codigo}/etapas/1/completar`, {})).status).toBe(200);
  });

  test('CP-75 Producción puede completar una etapa sin haberla tomado; un operario nuevo no puede completar la de otro', async () => {
    // Etapa 2 queda EN_CURSO tras CP-74; nadie la ha tomado todavía
    const sinTomarProduccion = await marcela.post(`/api/trabajos/${codigo}/etapas/2/completar`, {});
    expect(sinTomarProduccion.status).toBe(200); // Producción no necesita tomarla primero

    // Etapa 3: la toma luis
    await luis.post(`/api/trabajos/${codigo}/etapas/3/comenzar`, {});
    await ctx.servicios.usuarios.crear(null, {
      nombre: 'Operario Recien Creado', correo: 'operario-nuevo-cp75@kotoduo.test', contrasena: 'Otra clave segura de prueba', rol: 'OPERARIO', area: 'Bordado',
    });
    const agenteNuevo = await iniciarSesionDirecta(ctx, 'operario-nuevo-cp75@kotoduo.test', 'Otra clave segura de prueba');
    const intento = await agenteNuevo.post(`/api/trabajos/${codigo}/etapas/3/completar`, {});
    expect(intento.status).toBe(409);
    expect((await luis.post(`/api/trabajos/${codigo}/etapas/3/completar`, {})).status).toBe(200);
  });
});

async function iniciarSesionDirecta(ctx, correo, contrasena) {
  const agente = request.agent(ctx.app);
  const res = await agente.post('/api/auth/login').send({ correo, contrasena });
  if (res.status !== 200) throw new Error(`No fue posible iniciar sesión: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    csrf: res.body.csrf,
    get: (url) => agente.get(url),
    post: (url, cuerpo) => agente.post(url).set('X-CSRF-Token', res.body.csrf).send(cuerpo),
  };
}
