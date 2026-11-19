'use strict';
const request = require('supertest');
const { crearContexto } = require('../contexto');
const { VERSION } = require('../../src/version');

describe('Servicio de archivos estáticos de web/', () => {
  let ctx;
  beforeAll(async () => { ctx = await crearContexto(); });
  afterAll(async () => ctx.cerrar());

  // Punto A de la revisión del equipo (19-11-2026): detectar un servidor desactualizado respecto
  // a la pantalla depende de que CADA respuesta de la API lleve esta cabecera, siempre con el
  // mismo valor mientras el proceso no se reinicie.
  test('CP-79 toda respuesta de /api lleva "X-SST-Version", estable mientras el servidor no se reinicie', async () => {
    const unaRuta = await request(ctx.app).get('/api/inexistente');
    const otraRuta = await request(ctx.app).get('/api/auth/sesion');
    expect(unaRuta.headers['x-sst-version']).toBe(VERSION);
    expect(otraRuta.headers['x-sst-version']).toBe(VERSION);
  });

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
