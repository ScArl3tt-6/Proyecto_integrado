'use strict';
const { crearContexto } = require('../contexto');

describe('Listado de cuentas de Administración', () => {
  let ctx; let koto; let jorge;
  beforeAll(async () => {
    ctx = await crearContexto();
    [koto, jorge] = await Promise.all(['koto', 'jorge'].map((u) => ctx.iniciarSesion(u)));
  });
  afterAll(async () => ctx.cerrar());

  test('CP-45 el administrador lista las cuentas sin hash de contraseña, con bloqueo vigente y último acceso; el vendedor no tiene permiso', async () => {
    const res = await koto.get('/api/usuarios');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    const jorgeFila = res.body.find((u) => u.id_usuario === ctx.usuarios.jorge.idUsuario);
    expect(jorgeFila).toMatchObject({ nombre: 'Jorge Saavedra', rol: 'VENDEDOR', area: 'Ventas', activo: true, bloqueado: false });
    expect(jorgeFila.ultimoAcceso).toBeTruthy(); // ya inició sesión en el beforeAll
    expect(jorgeFila).not.toHaveProperty('hash_contrasena');

    expect((await jorge.get('/api/usuarios')).status).toBe(403);
  });

  // Punto 7 de la revisión del equipo (19-11-2026): Administración ya no fija ni conoce ninguna
  // contraseña; la ruta ni siquiera acepta ese campo, y crear una cuenta entrega de una vez un
  // enlace de primer acceso (mismo mecanismo que restablecer la contraseña).
  test('CP-73 crear cuenta por la ruta HTTP real: solo Administración, nunca acepta una contraseña, entrega un enlace de primer acceso, y rechaza un correo repetido', async () => {
    const sinPermiso = await jorge.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', rol: 'VENDEDOR',
    });
    expect(sinPermiso.status).toBe(403);

    const conContrasena = await koto.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', contrasena: 'Una frase larga válida 2026', rol: 'VENDEDOR',
    });
    expect(conContrasena.status).toBe(400); // "contrasena" ya no es un campo válido en esta ruta

    const creada = await koto.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', rol: 'VENDEDOR',
    });
    expect(creada.status).toBe(201);
    expect(creada.body.idUsuario).toBeGreaterThan(0);
    expect(creada.body).toMatchObject({ minutos: expect.any(Number) });
    expect(creada.body.enlace).toContain('/#/restablecer/');

    // El enlace de primer acceso de verdad sirve para crear la contraseña, como un restablecimiento
    const token = creada.body.enlace.split('/#/restablecer/')[1];
    const primerIngreso = await koto.post('/api/auth/restablecer', { token, nueva: 'Una contraseña elegida por la propia persona' });
    expect(primerIngreso.status).toBe(204);

    const repetida = await koto.post('/api/usuarios', {
      nombre: 'Segunda persona', correo: 'cuenta-prueba-cp73@kotoduo.test', rol: 'VENDEDOR',
    });
    expect(repetida.status).toBe(409);

    const listado = await koto.get('/api/usuarios');
    expect(listado.body.find((u) => u.id_usuario === creada.body.idUsuario)).toMatchObject({ nombre: 'Cuenta de prueba', rol: 'VENDEDOR', activo: true });
  });
});

// Punto 7 de la revisión del equipo (19-11-2026): "la URL base debe ser configurable (hoy es
// localhost)". El servidor arma el enlace completo con SU propia URL base (SST_URL_BASE), no con
// la que Administración tenga abierta en el navegador al generarlo.
describe('Enlaces de primer acceso y restablecimiento: URL base configurable', () => {
  test('CP-90 el enlace se arma con entorno.urlBase, no con un valor fijo', async () => {
    const ctxPropia = await crearContexto({ entornoExtra: { urlBase: 'https://sst.kotoduo-ejemplo.cl' } });
    try {
      const koto = await ctxPropia.iniciarSesion('koto');
      const creada = await koto.post('/api/usuarios', { nombre: 'Cuenta URL configurable', correo: 'cp90@kotoduo.test', rol: 'VENDEDOR' });
      expect(creada.status).toBe(201);
      expect(creada.body.enlace).toMatch(/^https:\/\/sst\.kotoduo-ejemplo\.cl\/#\/restablecer\/.+/);

      const enlaceRestablecer = await koto.post(`/api/usuarios/${creada.body.idUsuario}/restablecimiento`, {});
      expect(enlaceRestablecer.body.enlace.startsWith('https://sst.kotoduo-ejemplo.cl')).toBe(true);
    } finally {
      await ctxPropia.cerrar();
    }
  });
});
