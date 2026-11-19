'use strict';
const crypto = require('node:crypto');
const { ErrorNegocio } = require('../../dominio/errores');
const { validarContrasena } = require('../../dominio/politicaContrasena');

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

function crearServicioUsuarios({ pg, bitacora, autenticacion, entorno }) {
  // Alta de usuarios solo por administración (no existe autorregistro). Punto 7 de la revisión del
  // equipo (19-11-2026): Administración no debe conocer la contraseña de nadie; la ruta pública
  // (rutasUsuarios.js) ya no acepta "contrasena" en el cuerpo, así que en los hechos nunca llega
  // aquí desde la aplicación real. Sigue aceptándose como parámetro interno opcional solo para la
  // siembra de datos de demostración y la suite de pruebas (tests/contexto.js,
  // scripts/sembrar-demo.js), que sí necesitan contraseñas conocidas para iniciar sesión sin pasar
  // por el enlace. Sin ella, se guarda una contraseña aleatoria que nadie ve ni necesita conocer (la
  // cuenta queda, en los hechos, "bloqueada" hasta que su dueña entre por el enlace de primer
  // acceso, que crear() entrega junto con el id — mismo mecanismo que
  // generarEnlaceRestablecimiento, para no duplicar nada).
  async function crear(admin, { nombre, correo, contrasena, rol, area }) {
    let contrasenaFinal = contrasena;
    if (contrasenaFinal) {
      const politica = validarContrasena(contrasenaFinal, { correo, nombre });
      if (!politica.valida) throw new ErrorNegocio(`Contraseña no cumple la política: ${politica.errores.join('; ')}`, 400);
    } else {
      contrasenaFinal = crypto.randomBytes(32).toString('base64url');
    }
    const hash = await autenticacion.hashContrasena(contrasenaFinal);
    const { rows } = await pg.query(
      `INSERT INTO usuario (nombre, correo, hash_contrasena, id_rol, id_area)
       VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre = $4), (SELECT id_area FROM area WHERE nombre = $5))
       RETURNING id_usuario`,
      [nombre, correo.toLowerCase(), hash, rol, area || null],
    ).catch((err) => {
      if (String(err.message).includes('usuario_correo_key')) throw new ErrorNegocio('El correo ya está registrado', 409);
      throw err;
    });
    const idUsuario = rows[0].id_usuario;
    if (admin) await bitacora.registrar({ tipo: 'USUARIO_CREADO', usuario: admin, entidad: { tipo: 'usuario', codigo: String(idUsuario) }, detalle: { rol } });
    // Solo cuando no se dio una contraseña conocida (la ruta real de Administración, nunca la
    // siembra ni las pruebas): generar un enlace de primer acceso que nadie usará nunca sería ruido.
    if (!contrasena) {
      const primerAcceso = await generarEnlaceRestablecimiento(admin, idUsuario, { tipoEvento: 'PRIMER_ACCESO_GENERADO' });
      return { idUsuario, ...primerAcceso };
    }
    return { idUsuario };
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
      `SELECT u.id_usuario, u.nombre, u.correo, r.nombre AS rol, a.nombre AS area, u.activo, u.mfa_habilitado,
              (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()) AS bloqueado
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
         LEFT JOIN area a ON a.id_area = u.id_area
        ORDER BY u.nombre`,
    );
    const ultimos = await bitacora.ultimosAccesos(rows.map((u) => u.id_usuario));
    return rows.map((u) => ({ ...u, ultimoAcceso: ultimos[u.id_usuario] || null }));
  }

  // HU: restablecimiento de contraseña (Funcionalidad 4) y primer acceso (punto 7). Solo
  // Administración genera el enlace; quien lo recibe lo usa sin sesión en POST /api/auth/restablecer.
  // Un enlace nuevo invalida cualquier otro que haya quedado sin usar, para que solo exista uno
  // vigente a la vez. El enlace completo se arma aquí, con la URL base configurable del servidor
  // (SST_URL_BASE), no con la URL que la pantalla de Administración tenga en el navegador en ese
  // momento (que en desarrollo es "localhost" y no le sirve a quien lo recibe).
  async function generarEnlaceRestablecimiento(admin, idUsuario, { tipoEvento = 'RESTABLECIMIENTO_GENERADO' } = {}) {
    const { rows } = await pg.query('SELECT id_usuario FROM usuario WHERE id_usuario = $1', [idUsuario]);
    if (!rows[0]) throw new ErrorNegocio('Usuario no encontrado', 404);

    const token = crypto.randomBytes(32).toString('base64url');
    await pg.query('UPDATE restablecimiento_contrasena SET usado = TRUE WHERE id_usuario = $1 AND NOT usado', [idUsuario]);
    await pg.query(
      `INSERT INTO restablecimiento_contrasena (id_restablecimiento, id_usuario, hash_token, expira_en, creado_por)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval, $5)`,
      [crypto.randomUUID(), idUsuario, sha256(token), String(entorno.minutosRestablecimiento), admin.id],
    );
    await bitacora.registrar({ tipo: tipoEvento, usuario: admin, entidad: { tipo: 'usuario', codigo: String(idUsuario) } });
    return { token, minutos: entorno.minutosRestablecimiento, enlace: `${entorno.urlBase}/#/restablecer/${token}` };
  }

  // Vía de recuperación si la persona perdió el acceso a su aplicación de autenticación: solo
  // Administración, nunca la propia persona sin pasar antes el segundo factor (si pudiera
  // desactivarlo ella misma sin él, el MFA no protegería nada).
  async function desactivarMfa(admin, idUsuario) {
    const { rows } = await pg.query(
      'UPDATE usuario SET mfa_habilitado = FALSE, mfa_secreto = NULL, mfa_ultimo_paso = NULL WHERE id_usuario = $1 RETURNING id_usuario',
      [idUsuario],
    );
    if (!rows[0]) throw new ErrorNegocio('Usuario no encontrado', 404);
    await bitacora.registrar({ tipo: 'MFA_DESACTIVADO_ADMIN', usuario: admin, entidad: { tipo: 'usuario', codigo: String(idUsuario) } });
  }

  // Datos propios para el saludo personalizado del encabezado y "Mi cuenta" (punto C de la
  // revisión del equipo, 19-11-2026): nombre, correo y nombre del área, no solo el id.
  async function obtenerPerfilPropio(idUsuario) {
    const { rows } = await pg.query(
      `SELECT u.nombre, u.correo, a.nombre AS area
         FROM usuario u
         LEFT JOIN area a ON a.id_area = u.id_area
        WHERE u.id_usuario = $1`,
      [idUsuario],
    );
    return rows[0] || null;
  }

  return { crear, cambiarPerfil, cambiarEstado, listar, generarEnlaceRestablecimiento, desactivarMfa, obtenerPerfilPropio };
}

module.exports = { crearServicioUsuarios };
