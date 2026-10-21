'use strict';
const request = require('supertest');
const { crearContexto } = require('../contexto');

describe('Catálogos de referencia', () => {
  let ctx;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  test('CP-34 cualquier perfil autenticado obtiene los tipos de trabajo activos y las áreas; sin sesión no se accede', async () => {
    const operario = await ctx.iniciarSesion('luis');
    const res = await operario.get('/api/catalogos');
    expect(res.status).toBe(200);
    expect(res.body.tipos).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Bordado' })]));
    expect(res.body.areas).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Ventas' })]));

    const sinSesion = await request(ctx.app).get('/api/catalogos');
    expect(sinSesion.status).toBe(401);
  });
});
