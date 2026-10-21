'use strict';
const request = require('supertest');
const { crearContexto } = require('../contexto');

describe('Servicio de archivos estáticos de web/', () => {
  let ctx;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  test('CP-46 la página principal se entrega con la CSP activa y /api/inexistente sigue respondiendo 404 en JSON', async () => {
    const pagina = await request(ctx.app).get('/');
    expect(pagina.status).toBe(200);
    expect(pagina.headers['content-type']).toMatch(/text\/html/);
    expect(pagina.headers['content-security-policy']).toContain("script-src 'self'");
    expect(pagina.text).toContain('<title>SST Kotoduo</title>');

    const inexistente = await request(ctx.app).get('/api/inexistente');
    expect(inexistente.status).toBe(404);
    expect(inexistente.headers['content-type']).toMatch(/application\/json/);

    const paginaInexistente = await request(ctx.app).get('/ruta-que-no-existe.html');
    expect(paginaInexistente.status).toBe(404);
    expect(paginaInexistente.headers['content-type']).toMatch(/text\/plain/);
  });
});
