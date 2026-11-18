'use strict';
const request = require('supertest');
const { generateSync } = require('otplib');
const { crearContexto } = require('../contexto');

describe('Verificación en dos pasos por TOTP (Funcionalidad 5)', () => {
  let ctx;
  let contador = 0;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  // Cuentas propias por prueba (en vez de reutilizar las 6 del seed): koto y marcela son las
  // únicas ADMINISTRADOR/PRODUCCION del seed, y activar o bloquear MFA sobre ellas dejaría a las
  // pruebas siguientes sin una cuenta "limpia" para iniciar sesión de la forma simple de siempre.
  async function crearCuentaElegible(rol) {
    contador += 1;
    const correo = `mfa-prueba-${rol.toLowerCase()}-${contador}@kotoduo.test`;
    const contrasena = `Clave segura de verificación número ${contador} del 2026`;
    const { idUsuario } = await ctx.servicios.usuarios.crear(null, { nombre: `Prueba MFA ${contador}`, correo, contrasena, rol });
    return { correo, contrasena, idUsuario };
  }

  async function iniciarSesionDirecta(correo, contrasena) {
    const agente = request.agent(ctx.app);
    const res = await agente.post('/api/auth/login').send({ correo, contrasena });
    if (res.status !== 200) throw new Error(`No fue posible iniciar sesión: ${res.status}`);
    return { csrf: res.body.csrf, post: (url, cuerpo) => agente.post(url).set('X-CSRF-Token', res.body.csrf).send(cuerpo) };
  }

  async function activarMfaPara(correo, contrasena) {
    const sesion = await iniciarSesionDirecta(correo, contrasena);
    const { body: { secreto } } = await sesion.post('/api/auth/mfa/iniciar', {});
    const codigo = generateSync({ secret: secreto });
    const confirmar = await sesion.post('/api/auth/mfa/confirmar', { codigo });
    expect(confirmar.status).toBe(204);
    // Despeja el "último paso usado" (quedó marcado por el código de confirmación) para que un
    // código nuevo generado justo después, dentro de la misma ventana real de 30 segundos, no se
    // tope con el anti-reuso por error: son dos pasos distintos (activar vs. iniciar sesión).
    await ctx.pg.query('UPDATE usuario SET mfa_ultimo_paso = NULL WHERE correo = $1', [correo.toLowerCase()]);
    return { sesion, secreto };
  }

  test('CP-66 solo Administración y Producción pueden activar MFA; hace falta un código real para confirmarlo', async () => {
    const jorge = await ctx.iniciarSesion('jorge');
    expect((await jorge.post('/api/auth/mfa/iniciar', {})).status).toBe(403);

    const marcela = await ctx.iniciarSesion('marcela');
    const iniciar = await marcela.post('/api/auth/mfa/iniciar', {});
    expect(iniciar.status).toBe(201);
    expect(iniciar.body.secreto).toBeTruthy();
    expect(iniciar.body.qr).toMatch(/^data:image\/png;base64,/);

    const conCodigoFalso = await marcela.post('/api/auth/mfa/confirmar', { codigo: '000000' });
    expect(conCodigoFalso.status).toBe(400);

    const codigo = generateSync({ secret: iniciar.body.secreto });
    expect((await marcela.post('/api/auth/mfa/confirmar', { codigo })).status).toBe(204);

    const eventos = await ctx.mongoDb.collection('bitacora_eventos').find({ 'entidad.codigo': String(ctx.usuarios.marcela.idUsuario), tipo: 'MFA_ACTIVADO' }).toArray();
    expect(eventos.length).toBe(1);
  });

  test('CP-67 con MFA activado, el ingreso exige un segundo paso real y no deja reutilizar el mismo código', async () => {
    const cuenta = await crearCuentaElegible('ADMINISTRADOR');
    const { secreto } = await activarMfaPara(cuenta.correo, cuenta.contrasena);

    const login = await request(ctx.app).post('/api/auth/login').send({ correo: cuenta.correo, contrasena: cuenta.contrasena });
    expect(login.status).toBe(200);
    expect(login.body.requiereMfa).toBe(true);
    expect(login.body.desafio).toBeTruthy();
    expect(login.headers['set-cookie']).toBeUndefined(); // ninguna cookie de sesión todavía

    const codigo = generateSync({ secret: secreto });
    const verificar = await request(ctx.app).post('/api/auth/login/verificar').send({ desafio: login.body.desafio, codigo });
    expect(verificar.status).toBe(200);
    expect(verificar.body.rol).toBe('ADMINISTRADOR');
    expect(verificar.headers['set-cookie'].some((c) => c.startsWith('sst_acceso='))).toBe(true);

    // El mismo código, aunque siga siendo "válido" por la ventana de tiempo, ya no sirve una segunda vez
    const login2 = await request(ctx.app).post('/api/auth/login').send({ correo: cuenta.correo, contrasena: cuenta.contrasena });
    const reutilizado = await request(ctx.app).post('/api/auth/login/verificar').send({ desafio: login2.body.desafio, codigo });
    expect(reutilizado.status).toBe(401);
  });

  test('CP-68 un código incorrecto en el ingreso cuenta como intento fallido y puede bloquear la cuenta', async () => {
    const cuenta = await crearCuentaElegible('PRODUCCION');
    await activarMfaPara(cuenta.correo, cuenta.contrasena);
    const login = await request(ctx.app).post('/api/auth/login').send({ correo: cuenta.correo, contrasena: cuenta.contrasena });
    const { desafio } = login.body;

    for (let i = 0; i < 4; i += 1) {
      const fallo = await request(ctx.app).post('/api/auth/login/verificar').send({ desafio, codigo: '000000' });
      expect(fallo.status).toBe(401);
    }
    // El 5º intento fallido bloquea la cuenta (mismo contador que una contraseña incorrecta)
    await request(ctx.app).post('/api/auth/login/verificar').send({ desafio, codigo: '000000' });
    const conClaveCorrecta = await request(ctx.app).post('/api/auth/login').send({ correo: cuenta.correo, contrasena: cuenta.contrasena });
    expect(conClaveCorrecta.status).toBe(401);
  });

  test('CP-69 desactivar el MFA propio exige la contraseña actual; Administración puede desactivarlo sin ella', async () => {
    const propia = await crearCuentaElegible('PRODUCCION');
    const { sesion } = await activarMfaPara(propia.correo, propia.contrasena);

    const sinClave = await sesion.post('/api/auth/mfa/desactivar', { contrasena: 'no-es-la-clave' });
    expect(sinClave.status).toBe(401);

    const objetivo = await crearCuentaElegible('PRODUCCION');
    const jorge = await ctx.iniciarSesion('jorge');
    expect((await jorge.post(`/api/usuarios/${objetivo.idUsuario}/mfa/desactivar`, {})).status).toBe(403);

    expect((await sesion.post('/api/auth/mfa/desactivar', { contrasena: propia.contrasena })).status).toBe(204);
    const loginSinMfa = await request(ctx.app).post('/api/auth/login').send({ correo: propia.correo, contrasena: propia.contrasena });
    expect(loginSinMfa.body.requiereMfa).toBeUndefined();
    expect(loginSinMfa.body.rol).toBe('PRODUCCION');

    // Camino de Administración, para la persona que perdió el acceso a su aplicación de autenticación
    await activarMfaPara(objetivo.correo, objetivo.contrasena);
    const koto = await ctx.iniciarSesion('koto');
    expect((await koto.post(`/api/usuarios/${objetivo.idUsuario}/mfa/desactivar`, {})).status).toBe(204);
    const loginObjetivo = await request(ctx.app).post('/api/auth/login').send({ correo: objetivo.correo, contrasena: objetivo.contrasena });
    expect(loginObjetivo.body.requiereMfa).toBeUndefined();

    const eventos = await ctx.mongoDb.collection('bitacora_eventos').find({ 'entidad.codigo': String(objetivo.idUsuario), tipo: 'MFA_DESACTIVADO_ADMIN' }).toArray();
    expect(eventos.length).toBe(1);
  });

  test('CP-70 el otpauth:// URI incluye explícitamente el algoritmo, los dígitos y el período', async () => {
    const cuenta = await crearCuentaElegible('ADMINISTRADOR');
    const sesion = await iniciarSesionDirecta(cuenta.correo, cuenta.contrasena);
    const { body: { otpauth, secreto } } = await sesion.post('/api/auth/mfa/iniciar', {});
    expect(otpauth).toContain(`secret=${secreto}`);
    expect(otpauth).toMatch(/algorithm=SHA1/);
    expect(otpauth).toMatch(/digits=6/);
    expect(otpauth).toMatch(/period=30/);
  });

  test('CP-71 el secreto pendiente es estable: recargar "Mi cuenta" antes de confirmar no genera otro', async () => {
    const cuenta = await crearCuentaElegible('PRODUCCION');
    const sesion = await iniciarSesionDirecta(cuenta.correo, cuenta.contrasena);
    const primero = await sesion.post('/api/auth/mfa/iniciar', {});
    const segundo = await sesion.post('/api/auth/mfa/iniciar', {});
    expect(primero.body.secreto).toBe(segundo.body.secreto);

    // Cancelar sí limpia el secreto pendiente: la siguiente activación genera uno distinto
    expect((await sesion.post('/api/auth/mfa/cancelar', {})).status).toBe(204);
    const tercero = await sesion.post('/api/auth/mfa/iniciar', {});
    expect(tercero.body.secreto).not.toBe(primero.body.secreto);
  });

  test('CP-72 tolera hasta un paso de 30s de diferencia de reloj (pasado o futuro) al verificar', async () => {
    const cuenta = await crearCuentaElegible('PRODUCCION');
    const { secreto } = await activarMfaPara(cuenta.correo, cuenta.contrasena);

    const ahora = Math.floor(Date.now() / 1000);
    const codigoDelPasoAnterior = generateSync({ secret: secreto, epoch: ahora - 30 });

    const login = await request(ctx.app).post('/api/auth/login').send({ correo: cuenta.correo, contrasena: cuenta.contrasena });
    const verificar = await request(ctx.app).post('/api/auth/login/verificar').send({ desafio: login.body.desafio, codigo: codigoDelPasoAnterior });
    expect(verificar.status).toBe(200);
  });
});
