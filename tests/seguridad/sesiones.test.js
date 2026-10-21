'use strict';
const request = require('supertest');
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

// Cookie de renovación tal como la entregó el servidor (solo el par nombre=valor)
const cookieRenovacion = (cookies) => cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('sst_renovacion='));

describe('Pruebas de seguridad: sesiones, cuentas y datos', () => {
  let ctx;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  test('CP-28 renovación de sesión con rotación: el token anterior deja de servir y el cierre de sesión la invalida', async () => {
    const sesion = await ctx.iniciarSesion('valentina');
    const anterior = cookieRenovacion(sesion.cookies);

    const sinCsrf = await request(ctx.app).post('/api/auth/renovar').set('Cookie', anterior);
    expect(sinCsrf.status).toBe(403);

    const renovada = await sesion.agente.post('/api/auth/renovar').set('X-CSRF-Token', sesion.csrf);
    expect(renovada.status).toBe(204);
    expect(renovada.headers['set-cookie'].some((c) => c.startsWith('sst_acceso='))).toBe(true);
    expect((await sesion.get('/api/auth/sesion')).status).toBe(200);

    const reutilizada = await request(ctx.app).post('/api/auth/renovar').set('Cookie', `${anterior}; sst_csrf=${sesion.csrf}`).set('X-CSRF-Token', sesion.csrf);
    expect(reutilizada.status).toBe(401);

    const vigente = cookieRenovacion(renovada.headers['set-cookie']);
    await sesion.post('/api/auth/logout');
    const trasCierre = await request(ctx.app).post('/api/auth/renovar').set('Cookie', `${vigente}; sst_csrf=${sesion.csrf}`).set('X-CSRF-Token', sesion.csrf);
    expect(trasCierre.status).toBe(401);
  });

  test('CP-29 baja de cuenta: revoca las sesiones, impide el ingreso y un administrador no puede darse de baja', async () => {
    const koto = await ctx.iniciarSesion('koto');
    const jorge = await ctx.iniciarSesion('jorge');
    const camila = await ctx.iniciarSesion('camila');

    expect((await jorge.patch(`/api/usuarios/${ctx.usuarios.camila.idUsuario}/estado`, { activo: false })).status).toBe(403);
    expect((await koto.patch(`/api/usuarios/${ctx.usuarios.koto.idUsuario}/estado`, { activo: false })).status).toBe(409);

    const baja = await koto.patch(`/api/usuarios/${ctx.usuarios.camila.idUsuario}/estado`, { activo: false });
    expect(baja.status).toBe(200);
    expect((await camila.get('/api/auth/sesion')).status).toBe(401);
    const ingreso = await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.camila.correo, contrasena: ctx.usuarios.camila.contrasena });
    expect(ingreso.status).toBe(401);

    await koto.patch(`/api/usuarios/${ctx.usuarios.camila.idUsuario}/estado`, { activo: true });
    const reingreso = await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.camila.correo, contrasena: ctx.usuarios.camila.contrasena });
    expect(reingreso.status).toBe(200);
  });

  test('CP-30 cambio de contraseña: exige la actual, aplica la política y revoca las demás sesiones', async () => {
    const principal = await ctx.iniciarSesion('marcela');
    const otraSesion = await ctx.iniciarSesion('marcela');

    expect((await principal.post('/api/auth/cambiar-contrasena', { actual: 'no-es-la-clave', nueva: 'hilo-azul-sobre-polera-roja' })).status).toBe(401);
    expect((await principal.post('/api/auth/cambiar-contrasena', { actual: ctx.usuarios.marcela.contrasena, nueva: 'corta' })).status).toBe(400);
    expect((await principal.post('/api/auth/cambiar-contrasena', { actual: ctx.usuarios.marcela.contrasena, nueva: '111111111111' })).status).toBe(400);
    expect((await principal.post('/api/auth/cambiar-contrasena', { actual: ctx.usuarios.marcela.contrasena, nueva: ctx.usuarios.marcela.contrasena })).status).toBe(400);

    const nueva = 'hilo azul sobre polera roja';
    expect((await principal.post('/api/auth/cambiar-contrasena', { actual: ctx.usuarios.marcela.contrasena, nueva })).status).toBe(204);
    expect((await principal.get('/api/auth/sesion')).status).toBe(200);
    expect((await otraSesion.get('/api/auth/sesion')).status).toBe(401);
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.marcela.correo, contrasena: ctx.usuarios.marcela.contrasena })).status).toBe(401);
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.marcela.correo, contrasena: nueva })).status).toBe(200);
  });

  test('CP-31 un operario no consulta los materiales de trabajos de otra área', async () => {
    const jorge = await ctx.iniciarSesion('jorge');
    const valentina = await ctx.iniciarSesion('valentina');
    const koto = await ctx.iniciarSesion('koto');
    // La contraseña de Marcela cambió en CP-30; otra persona de producción aprueba el diseño
    await ctx.servicios.usuarios.crear(null, { nombre: 'René Prueba', correo: 'rene@kotoduo.test', contrasena: 'Una frase larga de prueba 2026', rol: 'PRODUCCION' });
    const produccion = request.agent(ctx.app);
    const login = await produccion.post('/api/auth/login').send({ correo: 'rene@kotoduo.test', contrasena: 'Una frase larga de prueba 2026' });
    expect(login.status).toBe(200);
    const aprobar = (url, cuerpo) => produccion.post(url).set('X-CSRF-Token', login.body.csrf).send(cuerpo);

    const { body: { codigo } } = await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Gorros bordados para colegio', cantidad: 20, fechaCompromiso: fechaEnDias(8) });
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const { body: { idDiseno } } = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'insignia.png', tipoMime: 'image/png', tamanoBytes: 52000, cabeceraBase64: CABECERAS.png }],
    });
    expect((await aprobar(`/api/disenos/${idDiseno}/decision`, { decision: 'APROBADO' })).status).toBe(200);

    const luis = await ctx.iniciarSesion('luis');
    const camila = await ctx.iniciarSesion('camila');
    expect((await luis.get(`/api/trabajos/${codigo}/materiales`)).status).toBe(200);
    expect((await camila.get(`/api/trabajos/${codigo}/materiales`)).status).toBe(403);
    expect((await koto.get(`/api/trabajos/${codigo}/materiales`)).status).toBe(200); // administración consulta cualquier trabajo
  });
});

describe('Pruebas de seguridad: cabeceras y límite general', () => {
  test('CP-32 las respuestas de la API no se almacenan en caché y el límite general responde 429', async () => {
    const ctx = await crearContexto({ entornoExtra: { limiteGeneral: 25 } });
    try {
      const sesion = await ctx.iniciarSesion('jorge');
      const respuesta = await sesion.get('/api/auth/sesion');
      expect(respuesta.headers['cache-control']).toBe('no-store');

      let ultima = respuesta;
      for (let i = 0; i < 40 && ultima.status !== 429; i += 1) ultima = await sesion.get('/api/auth/sesion');
      expect(ultima.status).toBe(429);
      expect(ultima.body.error).toMatch(/Demasiadas solicitudes/);
    } finally {
      await ctx.cerrar();
    }
  });
});
