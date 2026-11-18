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

  test('CP-73 crear cuenta por la ruta HTTP real: solo Administración, valida la política de contraseña y rechaza un correo repetido', async () => {
    const sinPermiso = await jorge.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', contrasena: 'Una frase larga válida 2026', rol: 'VENDEDOR',
    });
    expect(sinPermiso.status).toBe(403);

    const contrasenaDebil = await koto.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', contrasena: 'corta', rol: 'VENDEDOR',
    });
    expect(contrasenaDebil.status).toBe(400);

    const creada = await koto.post('/api/usuarios', {
      nombre: 'Cuenta de prueba', correo: 'cuenta-prueba-cp73@kotoduo.test', contrasena: 'Una frase larga válida 2026', rol: 'VENDEDOR',
    });
    expect(creada.status).toBe(201);
    expect(creada.body.idUsuario).toBeGreaterThan(0);

    const repetida = await koto.post('/api/usuarios', {
      nombre: 'Segunda persona', correo: 'cuenta-prueba-cp73@kotoduo.test', contrasena: 'Una frase larga distinta 2026', rol: 'VENDEDOR',
    });
    expect(repetida.status).toBe(409);

    const listado = await koto.get('/api/usuarios');
    expect(listado.body.find((u) => u.id_usuario === creada.body.idUsuario)).toMatchObject({ nombre: 'Cuenta de prueba', rol: 'VENDEDOR', activo: true });
  });
});
