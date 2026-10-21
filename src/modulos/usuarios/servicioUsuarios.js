'use strict';
const { ErrorNegocio } = require('../../dominio/errores');
const { validarContrasena } = require('../../dominio/politicaContrasena');

function crearServicioUsuarios({ pg, bitacora, autenticacion }) {
  // Alta de usuarios solo por administración (no existe autorregistro)
  async function crear(admin, { nombre, correo, contrasena, rol, area }) {
    const politica = validarContrasena(contrasena, { correo, nombre });
    if (!politica.valida) throw new ErrorNegocio(`Contraseña no cumple la política: ${politica.errores.join('; ')}`, 400);
    const hash = await autenticacion.hashContrasena(contrasena);
    const { rows } = await pg.query(
      `INSERT INTO usuario (nombre, correo, hash_contrasena, id_rol, id_area)
       VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre = $4), (SELECT id_area FROM area WHERE nombre = $5))
       RETURNING id_usuario`,
      [nombre, correo.toLowerCase(), hash, rol, area || null],
    ).catch((err) => {
      if (String(err.message).includes('usuario_correo_key')) throw new ErrorNegocio('El correo ya está registrado', 409);
      throw err;
    });
    if (admin) await bitacora.registrar({ tipo: 'USUARIO_CREADO', usuario: admin, entidad: { tipo: 'usuario', codigo: String(rows[0].id_usuario) }, detalle: { rol } });
    return { idUsuario: rows[0].id_usuario };
  }

  // HU-07 / RF-07: cambio de perfil. Se revocan las sesiones activas para que el cambio rija de inmediato.
  async function cambiarPerfil(admin, idUsuario, { rol, area }) {
    if (admin.id === idUsuario) throw new ErrorNegocio('No puede modificar su propio perfil', 409);
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre = $1),
                            id_area = (SELECT id_area FROM area WHERE nombre = $2)
          WHERE id_usuario = $3 RETURNING id_usuario`,
        [rol, area || null, idUsuario],
      );
      if (!rows[0]) throw new ErrorNegocio('Usuario no encontrado', 404);
      const revocadas = await tx.query('UPDATE sesion SET revocada = TRUE WHERE id_usuario = $1 AND NOT revocada', [idUsuario]);
      return { idUsuario, rol, area: area || null, sesionesRevocadas: revocadas.affectedRows ?? 0 };
    });
    await bitacora.registrar({ tipo: 'PERFIL_MODIFICADO', usuario: admin, entidad: { tipo: 'usuario', codigo: String(idUsuario) }, detalle: { rol, area } });
    return resultado;
  }

  // Baja y reactivación de cuentas: al desactivar se revocan todas las sesiones de la persona
  async function cambiarEstado(admin, idUsuario, activo) {
    if (admin.id === idUsuario) throw new ErrorNegocio('No puede modificar el estado de su propia cuenta', 409);
    const resultado = await pg.transaction(async (tx) => {
      const { rows } = await tx.query('UPDATE usuario SET activo = $1 WHERE id_usuario = $2 RETURNING id_usuario', [activo, idUsuario]);
      if (!rows[0]) throw new ErrorNegocio('Usuario no encontrado', 404);
      if (!activo) await tx.query('UPDATE sesion SET revocada = TRUE WHERE id_usuario = $1 AND NOT revocada', [idUsuario]);
      return { idUsuario, activo };
    });
    await bitacora.registrar({ tipo: activo ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO', usuario: admin, entidad: { tipo: 'usuario', codigo: String(idUsuario) } });
    return resultado;
  }

  // Lista de cuentas para Administración: sin hash de contraseña, con bloqueo vigente y último acceso
  async function listar() {
    const { rows } = await pg.query(
      `SELECT u.id_usuario, u.nombre, u.correo, r.nombre AS rol, a.nombre AS area, u.activo,
              (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()) AS bloqueado
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
         LEFT JOIN area a ON a.id_area = u.id_area
        ORDER BY u.nombre`,
    );
    const ultimos = await bitacora.ultimosAccesos(rows.map((u) => u.id_usuario));
    return rows.map((u) => ({ ...u, ultimoAcceso: ultimos[u.id_usuario] || null }));
  }

  return { crear, cambiarPerfil, cambiarEstado, listar };
}

module.exports = { crearServicioUsuarios };
