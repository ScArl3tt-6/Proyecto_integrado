'use strict';
const request = require('supertest');
const { crearContexto } = require('../contexto');

describe('Restablecimiento de contraseña por enlace (Funcionalidad 4)', () => {
  let ctx;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  test('CP-62 Administración genera el enlace, la persona lo usa sin sesión y queda inservible después de usarlo', async () => {
    const koto = await ctx.iniciarSesion('koto');
    const generado = await koto.post(`/api/usuarios/${ctx.usuarios.luis.idUsuario}/restablecimiento`, {});
    expect(generado.status).toBe(201);
    expect(generado.body.token).toBeTruthy();
    expect(generado.body.minutos).toBe(30);

    const nueva = 'una frase larga y nueva de prueba';
    const usado = await request(ctx.app).post('/api/auth/restablecer').send({ token: generado.body.token, nueva });
    expect(usado.status).toBe(204);

    // Ya se puede ingresar con la contraseña nueva, no con la antigua
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.luis.correo, contrasena: ctx.usuarios.luis.contrasena })).status).toBe(401);
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.luis.correo, contrasena: nueva })).status).toBe(200);

    // El mismo enlace ya no sirve una segunda vez
    const reutilizado = await request(ctx.app).post('/api/auth/restablecer').send({ token: generado.body.token, nueva: 'otra frase larga distinta' });
    expect(reutilizado.status).toBe(400);
    expect(reutilizado.body.motivo).toBe('TOKEN_INVALIDO');
  });

  test('CP-63 el restablecimiento revoca las sesiones activas y desbloquea la cuenta', async () => {
    const koto = await ctx.iniciarSesion('koto');
    const sesionPrevia = await ctx.iniciarSesion('camila');
    expect((await sesionPrevia.get('/api/auth/sesion')).status).toBe(200);

    // Simula una cuenta bloqueada por intentos fallidos
    await ctx.pg.query("UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = now() + interval '15 minutes' WHERE id_usuario = $1", [ctx.usuarios.camila.idUsuario]);
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.camila.correo, contrasena: ctx.usuarios.camila.contrasena })).status).toBe(401);

    const generado = await koto.post(`/api/usuarios/${ctx.usuarios.camila.idUsuario}/restablecimiento`, {});
    const nueva = 'una frase larga distinta de prueba';
    expect((await request(ctx.app).post('/api/auth/restablecer').send({ token: generado.body.token, nueva })).status).toBe(204);

    expect((await sesionPrevia.get('/api/auth/sesion')).status).toBe(401);
    expect((await request(ctx.app).post('/api/auth/login').send({ correo: ctx.usuarios.camila.correo, contrasena: nueva })).status).toBe(200);
  });

  test('CP-64 solo Administración genera el enlace, y uno nuevo invalida el anterior sin usar', async () => {
    const jorge = await ctx.iniciarSesion('jorge');
    expect((await jorge.post(`/api/usuarios/${ctx.usuarios.valentina.idUsuario}/restablecimiento`, {})).status).toBe(403);

    const koto = await ctx.iniciarSesion('koto');
    const primero = await koto.post(`/api/usuarios/${ctx.usuarios.valentina.idUsuario}/restablecimiento`, {});
    const segundo = await koto.post(`/api/usuarios/${ctx.usuarios.valentina.idUsuario}/restablecimiento`, {});
    expect(primero.body.token).not.toBe(segundo.body.token);

    const nueva = 'frase larga totalmente distinta de prueba';
    const conElPrimero = await request(ctx.app).post('/api/auth/restablecer').send({ token: primero.body.token, nueva });
    expect(conElPrimero.status).toBe(400);
    expect(conElPrimero.body.motivo).toBe('TOKEN_INVALIDO');

    expect((await request(ctx.app).post('/api/auth/restablecer').send({ token: segundo.body.token, nueva })).status).toBe(204);
  });

  test('CP-65 un enlace vencido ya no sirve, y la contraseña nueva respeta la misma política', async () => {
    const koto = await ctx.iniciarSesion('koto');
    const generado = await koto.post(`/api/usuarios/${ctx.usuarios.jorge.idUsuario}/restablecimiento`, {});

    const corta = await request(ctx.app).post('/api/auth/restablecer').send({ token: generado.body.token, nueva: 'corta' });
    expect(corta.status).toBe(400);
    expect(corta.body.motivo).toBeUndefined();

    await ctx.pg.query(
      "UPDATE restablecimiento_contrasena SET expira_en = now() - interval '1 minute' WHERE id_usuario = $1 AND NOT usado",
      [ctx.usuarios.jorge.idUsuario],
    );
    const vencido = await request(ctx.app).post('/api/auth/restablecer').send({ token: generado.body.token, nueva: 'una frase larga totalmente valida' });
    expect(vencido.status).toBe(400);
    expect(vencido.body.motivo).toBe('TOKEN_INVALIDO');
  });
});
