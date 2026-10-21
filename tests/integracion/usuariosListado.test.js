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
});
