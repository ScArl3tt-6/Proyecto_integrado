'use strict';
const crypto = require('node:crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { validarContrasena } = require('../../dominio/politicaContrasena');
const { ErrorNegocio } = require('../../dominio/errores');

const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

function crearServicioAutenticacion({ pg, entorno, bitacora }) {
  // Hash simulado para igualar tiempos cuando el correo no existe (evita enumeración de usuarios)
  const hashSimulado = argon2.hash(crypto.randomBytes(16).toString('hex'), OPCIONES_ARGON2);

  async function hashContrasena(contrasena) {
    return argon2.hash(contrasena, OPCIONES_ARGON2);
  }

  function firmarAcceso(idSesion, idUsuario) {
    return jwt.sign({ sid: idSesion }, entorno.secretoJwt, {
      algorithm: 'HS256', subject: String(idUsuario), issuer: 'sst-kotoduo', expiresIn: `${entorno.minutosAcceso}m`,
    });
  }

  async function iniciarSesion({ correo, contrasena, ip }) {
    const { rows } = await pg.query(
      `SELECT u.id_usuario, u.hash_contrasena, u.activo, u.intentos_fallidos, u.bloqueado_hasta, r.nombre AS rol
         FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.correo = $1`,
      [correo.toLowerCase()],
    );
    const usuario = rows[0];

    if (!usuario) {
      await argon2.verify(await hashSimulado, contrasena).catch(() => false);
      return { ok: false, motivo: 'CREDENCIALES' };
    }
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      await bitacora.registrar({ tipo: 'ACCESO_BLOQUEADO', usuario: { id: usuario.id_usuario, rol: usuario.rol }, entidad: { tipo: 'usuario', codigo: String(usuario.id_usuario) }, ip });
      return { ok: false, motivo: 'BLOQUEADO' };
    }

    const coincide = usuario.activo && (await argon2.verify(usuario.hash_contrasena, contrasena));
    if (!coincide) {
      const intentos = usuario.intentos_fallidos + 1;
      const bloquear = intentos >= entorno.intentosMaximos;
      await pg.query(
        `UPDATE usuario SET intentos_fallidos = $1,
                bloqueado_hasta = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_hasta END
          WHERE id_usuario = $4`,
        [bloquear ? 0 : intentos, bloquear, String(entorno.minutosBloqueo), usuario.id_usuario],
      );
      await bitacora.registrar({ tipo: bloquear ? 'CUENTA_BLOQUEADA' : 'ACCESO_FALLIDO', usuario: { id: usuario.id_usuario, rol: usuario.rol }, entidad: { tipo: 'usuario', codigo: String(usuario.id_usuario) }, ip });
      return { ok: false, motivo: 'CREDENCIALES' };
    }

    await pg.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1', [usuario.id_usuario]);
    const idSesion = crypto.randomUUID();
    const tokenRenovacion = crypto.randomBytes(32).toString('base64url');
    await pg.query(
      `INSERT INTO sesion (id_sesion, id_usuario, hash_token, expira_en)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
      [idSesion, usuario.id_usuario, sha256(tokenRenovacion), String(entorno.horasSesion)],
    );
    const tokenAcceso = firmarAcceso(idSesion, usuario.id_usuario);
    await bitacora.registrar({ tipo: 'ACCESO_EXITOSO', usuario: { id: usuario.id_usuario, rol: usuario.rol }, entidad: { tipo: 'usuario', codigo: String(usuario.id_usuario) }, ip });
    return { ok: true, tokenAcceso, tokenRenovacion, csrf: crypto.randomBytes(24).toString('base64url'), rol: usuario.rol };
  }

  // Renovación con rotación: cada token de renovación sirve una sola vez; el anterior queda inválido
  async function renovarSesion({ tokenRenovacion, ip }) {
    const { rows } = await pg.query(
      `SELECT s.id_sesion, s.id_usuario, s.expira_en, s.revocada, u.activo, r.nombre AS rol
         FROM sesion s JOIN usuario u ON u.id_usuario = s.id_usuario JOIN rol r ON r.id_rol = u.id_rol
        WHERE s.hash_token = $1`,
      [sha256(tokenRenovacion)],
    );
    const sesion = rows[0];
    if (!sesion || sesion.revocada || !sesion.activo || new Date(sesion.expira_en) < new Date()) return { ok: false };
    const nuevoToken = crypto.randomBytes(32).toString('base64url');
    await pg.query('UPDATE sesion SET hash_token = $1 WHERE id_sesion = $2', [sha256(nuevoToken), sesion.id_sesion]);
    await bitacora.registrar({ tipo: 'SESION_RENOVADA', usuario: { id: sesion.id_usuario, rol: sesion.rol }, entidad: { tipo: 'usuario', codigo: String(sesion.id_usuario) }, ip });
    return { ok: true, tokenAcceso: firmarAcceso(sesion.id_sesion, sesion.id_usuario), tokenRenovacion: nuevoToken };
  }

  // El cambio de contraseña exige la actual, aplica la política y revoca las demás sesiones de la persona
  async function cambiarContrasena(usuarioSesion, { actual, nueva }) {
    const { rows } = await pg.query('SELECT hash_contrasena, correo, nombre FROM usuario WHERE id_usuario = $1', [usuarioSesion.id]);
    const u = rows[0];
    if (!u || !(await argon2.verify(u.hash_contrasena, actual))) throw new ErrorNegocio('La contraseña actual no es correcta', 401);
    if (actual === nueva) throw new ErrorNegocio('La nueva contraseña debe ser distinta de la actual', 400);
    const politica = validarContrasena(nueva, { correo: u.correo, nombre: u.nombre });
    if (!politica.valida) throw new ErrorNegocio(`Contraseña no cumple la política: ${politica.errores.join('; ')}`, 400);
    const hash = await hashContrasena(nueva);
    await pg.query('UPDATE usuario SET hash_contrasena = $1 WHERE id_usuario = $2', [hash, usuarioSesion.id]);
    await pg.query('UPDATE sesion SET revocada = TRUE WHERE id_usuario = $1 AND id_sesion <> $2 AND NOT revocada', [usuarioSesion.id, usuarioSesion.sid]);
    await bitacora.registrar({ tipo: 'CONTRASENA_CAMBIADA', usuario: usuarioSesion, entidad: { tipo: 'usuario', codigo: String(usuarioSesion.id) } });
  }

  async function cerrarSesion(usuario) {
    await pg.query('UPDATE sesion SET revocada = TRUE WHERE id_sesion = $1', [usuario.sid]);
    await bitacora.registrar({ tipo: 'CIERRE_SESION', usuario, entidad: { tipo: 'usuario', codigo: String(usuario.id) } });
  }

  return { hashContrasena, iniciarSesion, renovarSesion, cambiarContrasena, cerrarSesion };
}

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

module.exports = { crearServicioAutenticacion };
