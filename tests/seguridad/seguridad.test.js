'use strict';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

describe('Pruebas de seguridad (amenazas de la sección 7.4)', () => {
  let ctx; let jorge; let valentina; let marcela; let camila; let koto; let codigoBordado;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, camila, koto] = await Promise.all(
      ['jorge', 'valentina', 'marcela', 'camila', 'koto'].map((u) => ctx.iniciarSesion(u)),
    );
    // Trabajo de bordado aprobado y en producción, para probar el acceso desde otra área
    codigoBordado = (await jorge.post('/api/trabajos', { idTipo: 1, descripcion: 'Gorros bordados colegio', cantidad: 60, fechaCompromiso: fechaEnDias(8) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigoBordado}/tomar-diseno`);
    const { body: { idDiseno } } = await valentina.post(`/api/disenos/trabajos/${codigoBordado}`, {
      archivos: [{ nombre: 'insignia.png', tipoMime: 'image/png', tamanoBytes: 52000, cabeceraBase64: CABECERAS.png }],
    });
    await marcela.post(`/api/disenos/${idDiseno}/decision`, { decision: 'APROBADO' });
  });
  afterAll(async () => ctx.cerrar());

  test('CP-17 inyección SQL: la entrada maliciosa se rechaza o se almacena como texto', async () => {
    const login = await request(ctx.app).post('/api/auth/login').send({ correo: "' OR '1'='1' --", contrasena: 'x' });
    expect(login.status).toBe(400);

    const carga = "Poleras'); DROP TABLE trabajo; --";
    const res = await jorge.post('/api/trabajos', { idTipo: 2, descripcion: carga, cantidad: 5, fechaCompromiso: fechaEnDias(5) });
    expect(res.status).toBe(201);
    const { rows } = await ctx.pg.query('SELECT descripcion FROM trabajo WHERE codigo = $1', [res.body.codigo]);
    expect(rows[0].descripcion).toBe(carga);
    expect((await ctx.pg.query("SELECT to_regclass('public.trabajo') AS t")).rows[0].t).toBe('trabajo');
  });

  test('CP-18 inyección NoSQL: operadores de MongoDB en lugar de texto se rechazan', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ correo: { $ne: null }, contrasena: { $gt: '' } });
    expect(res.status).toBe(400);
    expect(res.body.campos).toEqual(expect.arrayContaining(['correo', 'contrasena']));
  });

  test('CP-19 sin sesión o con token alterado no se accede a la API', async () => {
    expect((await request(ctx.app).get('/api/panel')).status).toBe(401);
    const tokenNone = jwt.sign({ sid: 'x' }, '', { algorithm: 'none', subject: '1', issuer: 'sst-kotoduo' });
    const conNone = await request(ctx.app).get('/api/panel').set('Cookie', `sst_acceso=${tokenNone}`);
    expect(conNone.status).toBe(401);
    const tokenFalso = jwt.sign({ sid: 'x' }, 'secreto-adivinado-por-un-atacante-123456', { subject: '1', issuer: 'sst-kotoduo' });
    expect((await request(ctx.app).get('/api/panel').set('Cookie', `sst_acceso=${tokenFalso}`)).status).toBe(401);
  });

  test('CP-20 CSRF: una operación sin el token anti-CSRF se rechaza', async () => {
    const res = await jorge.agente.post('/api/trabajos').send({ idTipo: 1, descripcion: 'Solicitud desde sitio externo', cantidad: 1, fechaCompromiso: fechaEnDias(2) });
    expect(res.status).toBe(403);
    const otroToken = await jorge.agente.post('/api/trabajos').set('X-CSRF-Token', 'token-inventado').send({});
    expect(otroToken.status).toBe(403);
  });

  test('CP-21 control de acceso por rol (RBAC) y separación de funciones', async () => {
    expect((await camila.post('/api/trabajos', { idTipo: 1, descripcion: 'Intento de operario', cantidad: 1, fechaCompromiso: fechaEnDias(2) })).status).toBe(403);
    expect((await jorge.post('/api/disenos/1/decision', { decision: 'APROBADO' })).status).toBe(403);
    expect((await koto.post('/api/disenos/1/decision', { decision: 'APROBADO' })).status).toBe(403);
    expect((await jorge.get('/api/panel')).status).toBe(403);
    expect((await valentina.patch(`/api/usuarios/${ctx.usuarios.valentina.idUsuario}/perfil`, { rol: 'ADMINISTRADOR' })).status).toBe(403);
  });

  test('CP-22 un operario no puede avanzar etapas de otra área modificando la URL', async () => {
    const res = await camila.post(`/api/trabajos/${codigoBordado}/etapas/1/completar`);
    expect(res.status).toBe(403);
    const { rows } = await ctx.pg.query(
      `SELECT et.estado FROM etapa_trabajo et JOIN trabajo t ON t.id_trabajo = et.id_trabajo WHERE t.codigo = $1 AND et.orden = 1`, [codigoBordado]);
    expect(rows[0].estado).toBe('EN_CURSO');
  });

  test('CP-23 fuerza bruta: la cuenta se bloquea tras 5 intentos y los mensajes no revelan si el usuario existe', async () => {
    const { correo, contrasena } = ctx.usuarios.valentina;
    const inexistente = await request(ctx.app).post('/api/auth/login').send({ correo: 'nadie@kotoduo.test', contrasena: 'cualquier-cosa' });
    const incorrecta = await request(ctx.app).post('/api/auth/login').send({ correo, contrasena: 'clave-incorrecta-1' });
    expect(inexistente.body).toEqual(incorrecta.body);

    for (let i = 0; i < 4; i += 1) await request(ctx.app).post('/api/auth/login').send({ correo, contrasena: `incorrecta-${i}` });
    const conClaveCorrecta = await request(ctx.app).post('/api/auth/login').send({ correo, contrasena });
    expect(conClaveCorrecta.status).toBe(401);

    const eventos = await ctx.mongoDb.collection('bitacora_eventos').find({ 'entidad.codigo': String(ctx.usuarios.valentina.idUsuario) }).toArray();
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['CUENTA_BLOQUEADA', 'ACCESO_BLOQUEADO']));
  });

  test('CP-24 asignación masiva: la solicitud rechaza datos de contacto o de pago del cliente (RF-01)', async () => {
    const res = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: 'Poleras bordadas', cantidad: 10, fechaCompromiso: fechaEnDias(4),
      telefonoCliente: '+56 9 1234 5678', montoTotal: 250000, estado: 'TERMINADO',
    });
    expect(res.status).toBe(400);
    expect(res.body.campos).toEqual(['(general)']);
  });

  test('CP-25 XSS: el comentario se guarda como texto y la API envía cabeceras de protección', async () => {
    const codigo = (await jorge.post('/api/trabajos', { idTipo: 5, descripcion: 'Pendón evento', cantidad: 2, fechaCompromiso: fechaEnDias(6) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const carga = '<img src=x onerror="alert(document.cookie)">';
    const envio = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
      archivos: [{ nombre: 'pendon.pdf', tipoMime: 'application/pdf', tamanoBytes: 1200000, cabeceraBase64: CABECERAS.pdf }], comentario: carga,
    });
    const detalle = await marcela.get(`/api/disenos/${envio.body.idDiseno}`);
    expect(detalle.headers['content-type']).toMatch(/application\/json/);
    expect(detalle.headers['content-security-policy']).toContain("script-src 'self'");
    expect(detalle.headers['x-content-type-options']).toBe('nosniff');
    expect(detalle.headers['x-powered-by']).toBeUndefined();
    expect(detalle.body.propuesta.comentarios[0].texto).toBe(carga);
  });

  test('CP-26 carga de archivos: se rechazan SVG y archivos con firma falsa', async () => {
    const codigo = (await jorge.post('/api/trabajos', { idTipo: 4, descripcion: 'Trofeos grabados', cantidad: 12, fechaCompromiso: fechaEnDias(9) })).body.codigo;
    await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
    const svg = await valentina.post(`/api/disenos/trabajos/${codigo}`, { archivos: [{ nombre: 'logo.svg', tipoMime: 'image/svg+xml', tamanoBytes: 3000, cabeceraBase64: CABECERAS.svg }] });
    expect(svg.status).toBe(400);
    const falso = await valentina.post(`/api/disenos/trabajos/${codigo}`, { archivos: [{ nombre: 'trofeo.pdf', tipoMime: 'application/pdf', tamanoBytes: 3000, cabeceraBase64: CABECERAS.png }] });
    expect(falso.status).toBe(400);
    expect(falso.body.error).toMatch(/no corresponde al tipo declarado/);
  });

  test('CP-27 los errores no exponen detalles internos', async () => {
    const res = await jorge.agente.post('/api/trabajos').set('X-CSRF-Token', 'x').set('Content-Type', 'application/json').send('{"idTipo": 1,');
    expect([400, 403]).toContain(res.status);
    const malformado = await request(ctx.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"correo":');
    expect(malformado.status).toBe(400);
    expect(JSON.stringify(malformado.body)).not.toMatch(/at .*\.js|SyntaxError|stack/i);
    const inexistente = await koto.get('/api/ruta-que-no-existe');
    expect(inexistente.status).toBe(404);
  });
});
