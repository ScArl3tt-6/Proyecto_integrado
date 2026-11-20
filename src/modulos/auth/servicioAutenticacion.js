'use strict';
const crypto = require('node:crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { generateSecret, verify: verificarCodigoMfaOtplib } = require('otplib');
const QRCode = require('qrcode');
const { validarContrasena } = require('../../dominio/politicaContrasena');
const { ErrorNegocio } = require('../../dominio/errores');

const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const EMISOR_MFA = 'SST Kotoduo';
// La verificación en dos pasos es, por ahora, para los dos roles con las acciones más sensibles
// (gestión de cuentas y aprobación de diseños); ver la pantalla de Ingreso y PLAN_FASES.md.
const ROLES_CON_MFA = new Set(['ADMINISTRADOR', 'PRODUCCION']);

// Parámetros de TOTP (RFC 6238) explícitos y fijos, en vez de depender de los valores por defecto
// de la librería (que podrían cambiar entre versiones sin que el código lo note): se usan tanto al
// construir el otpauth:// URI como al verificar, para que el QR y la verificación real nunca puedan
// quedar desincronizados entre sí.
const MFA_ALGORITMO = 'sha1';
const MFA_DIGITOS = 6;
const MFA_PERIODO_SEGUNDOS = 30;
// ±1 paso de 30 s (RFC 6238 sección 5.2): tolera que el reloj del teléfono y el del servidor no
// coincidan exactamente, en cualquiera de los dos sentidos.
const MFA_TOLERANCIA_SEGUNDOS = MFA_PERIODO_SEGUNDOS;

function construirOtpauthUri({ issuer, label, secreto }) {
  const ruta = `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`;
  const parametros = [
    `secret=${encodeURIComponent(secreto)}`,
    `issuer=${encodeURIComponent(issuer)}`,
    `algorithm=${MFA_ALGORITMO.toUpperCase()}`,
    `digits=${MFA_DIGITOS}`,
    `period=${MFA_PERIODO_SEGUNDOS}`,
  ].join('&');
  return `otpauth://totp/${ruta}?${parametros}`;
}

function verificarCodigoMfa({ secret, token, afterTimeStep }) {
  return verificarCodigoMfaOtplib({
    secret, token, afterTimeStep,
    algorithm: MFA_ALGORITMO, digits: MFA_DIGITOS, period: MFA_PERIODO_SEGUNDOS, epochTolerance: MFA_TOLERANCIA_SEGUNDOS,
  });
}

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

  // Cola común de "contraseña ya verificada, falta crear la sesión": la usan tanto el ingreso
  // directo (sin MFA) como el segundo paso del ingreso con MFA.
  async function crearSesion(usuario, ip) {
    const idSesion = crypto.randomUUID();
    const tokenRenovacion = crypto.randomBytes(32).toString('base64url');
    await pg.query(
      `INSERT INTO sesion (id_sesion, id_usuario, hash_token, expira_en)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
      [idSesion, usuario.id_usuario, sha256(tokenRenovacion), String(entorno.horasSesion)],
    );
    const tokenAcceso = firmarAcceso(idSesion, usuario.id_usuario);
    await bitacora.registrar({ tipo: 'ACCESO_EXITOSO', usuario: { id: usuario.id_usuario, rol: usuario.rol }, entidad: { tipo: 'usuario', codigo: String(usuario.id_usuario) }, ip });
    return { tokenAcceso, tokenRenovacion, csrf: crypto.randomBytes(24).toString('base64url'), rol: usuario.rol };
  }

  // Un "desafío" firmado y de corta duración: prueba que la contraseña ya se verificó, sin ser
  // un token de acceso real (issuer/claim propios) ni crear ninguna sesión todavía.
  function firmarDesafioMfa(idUsuario) {
    return jwt.sign({ paso: 'mfa', sub: String(idUsuario) }, entorno.secretoJwt, {
      algorithm: 'HS256', issuer: 'sst-kotoduo', expiresIn: `${entorno.minutosDesafioMfa}m`,
    });
  }

  async function iniciarSesion({ correo, contrasena, ip }) {
    const { rows } = await pg.query(
      `SELECT u.id_usuario, u.hash_contrasena, u.activo, u.mfa_habilitado, u.intentos_fallidos, u.bloqueado_hasta, r.nombre AS rol
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

    // La contraseña ya es correcta: si la cuenta tiene MFA activado, todavía no se crea la sesión
    if (usuario.mfa_habilitado) {
      return { ok: true, requiereMfa: true, desafio: firmarDesafioMfa(usuario.id_usuario) };
    }
    return { ok: true, ...(await crearSesion(usuario, ip)) };
  }

  // Segundo paso del ingreso cuando la cuenta tiene MFA: el "desafío" prueba que la contraseña ya
  // se verificó; un código incorrecto o repetido cuenta como intento fallido, igual que una
  // contraseña incorrecta (mismo contador y el mismo bloqueo de la cuenta).
  async function completarIngresoMfa({ desafio, codigo, ip }) {
    let payload;
    try {
      payload = jwt.verify(desafio, entorno.secretoJwt, { algorithms: ['HS256'], issuer: 'sst-kotoduo' });
      if (payload.paso !== 'mfa' || !payload.sub) throw new Error('paso inválido');
    } catch {
      return { ok: false };
    }

    const { rows } = await pg.query(
      `SELECT u.id_usuario, u.activo, u.mfa_habilitado, u.mfa_secreto, u.mfa_ultimo_paso,
              u.intentos_fallidos, u.bloqueado_hasta, r.nombre AS rol
         FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
      [Number(payload.sub)],
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo || !usuario.mfa_habilitado) return { ok: false };
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) return { ok: false, motivo: 'BLOQUEADO' };

    // afterTimeStep delega en la propia librería el anti-reuso (rechaza un paso ya consumido),
    // en vez de comparar el conteo a mano después de verificar.
    const resultado = await verificarCodigoMfa({
      secret: usuario.mfa_secreto, token: codigo,
      afterTimeStep: usuario.mfa_ultimo_paso === null ? undefined : Number(usuario.mfa_ultimo_paso),
    });
    if (!resultado.valid) {
      const intentos = usuario.intentos_fallidos + 1;
      const bloquear = intentos >= entorno.intentosMaximos;
      await pg.query(
        `UPDATE usuario SET intentos_fallidos = $1,
                bloqueado_hasta = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_hasta END
          WHERE id_usuario = $4`,
        [bloquear ? 0 : intentos, bloquear, String(entorno.minutosBloqueo), usuario.id_usuario],
      );
      await bitacora.registrar({ tipo: bloquear ? 'CUENTA_BLOQUEADA' : 'MFA_FALLIDO', usuario: { id: usuario.id_usuario, rol: usuario.rol }, entidad: { tipo: 'usuario', codigo: String(usuario.id_usuario) }, ip });
      return { ok: false };
    }

    await pg.query(
      'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, mfa_ultimo_paso = $1 WHERE id_usuario = $2',
      [String(resultado.timeStep), usuario.id_usuario],
    );
    return { ok: true, ...(await crearSesion(usuario, ip)) };
  }

  // Activación de MFA (Funcionalidad 5), en dos pasos: generar el secreto no lo activa todavía;
  // hace falta un código válido para confirmar que la persona configuró bien su aplicación.
  async function iniciarMfa(usuarioSesion) {
    if (!ROLES_CON_MFA.has(usuarioSesion.rol)) {
      throw new ErrorNegocio('La verificación en dos pasos está disponible para Administración y Producción.', 403);
    }
    const { rows } = await pg.query('SELECT correo, mfa_habilitado, mfa_secreto FROM usuario WHERE id_usuario = $1', [usuarioSesion.id]);
    const u = rows[0];
    if (u.mfa_habilitado) throw new ErrorNegocio('La verificación en dos pasos ya está activada en tu cuenta.', 409);

    // Si ya había una activación en curso (recargó la página, o volvió a "Mi cuenta" sin terminar),
    // se reutiliza el mismo secreto: generar uno nuevo invalidaría en silencio el QR que la persona
    // ya pudo haber escaneado con su aplicación.
    const secreto = u.mfa_secreto || await generateSecret();
    if (!u.mfa_secreto) {
      await pg.query('UPDATE usuario SET mfa_secreto = $1, mfa_ultimo_paso = NULL WHERE id_usuario = $2', [secreto, usuarioSesion.id]);
    }
    const otpauth = construirOtpauthUri({ issuer: EMISOR_MFA, label: u.correo, secreto });
    const qr = await QRCode.toDataURL(otpauth, { width: 220 });
    return { secreto, otpauth, qr };
  }

  // Cancela una activación en curso sin dejar un secreto abandonado en la base. No afecta a una
  // cuenta que ya tiene el MFA activado (para eso existe desactivarMfaPropio, que sí pide la contraseña).
  async function cancelarMfa(usuarioSesion) {
    await pg.query(
      'UPDATE usuario SET mfa_secreto = NULL, mfa_ultimo_paso = NULL WHERE id_usuario = $1 AND NOT mfa_habilitado',
      [usuarioSesion.id],
    );
  }

  async function confirmarMfa(usuarioSesion, codigo) {
    const { rows } = await pg.query('SELECT mfa_secreto, mfa_habilitado, mfa_ultimo_paso FROM usuario WHERE id_usuario = $1', [usuarioSesion.id]);
    const u = rows[0];
    if (!u.mfa_secreto || u.mfa_habilitado) {
      throw new ErrorNegocio('No hay ninguna activación en curso. Vuelve a empezar desde "Mi cuenta".', 409);
    }
    const resultado = await verificarCodigoMfa({
      secret: u.mfa_secreto, token: codigo,
      afterTimeStep: u.mfa_ultimo_paso === null ? undefined : Number(u.mfa_ultimo_paso),
    });
    if (!resultado.valid) {
      throw new ErrorNegocio('Código incorrecto o vencido. Genera uno nuevo desde tu aplicación y vuelve a intentarlo.', 400);
    }
    await pg.query('UPDATE usuario SET mfa_habilitado = TRUE, mfa_ultimo_paso = $1 WHERE id_usuario = $2', [String(resultado.timeStep), usuarioSesion.id]);
    await bitacora.registrar({ tipo: 'MFA_ACTIVADO', usuario: usuarioSesion, entidad: { tipo: 'usuario', codigo: String(usuarioSesion.id) } });
  }

  // Exige la contraseña actual, igual que cambiarContrasena: evita que una sesión robada por
  // un rato pueda quitar la segunda verificación sin saber la contraseña.
  async function desactivarMfaPropio(usuarioSesion, contrasenaActual) {
    const { rows } = await pg.query('SELECT hash_contrasena FROM usuario WHERE id_usuario = $1', [usuarioSesion.id]);
    if (!rows[0] || !(await argon2.verify(rows[0].hash_contrasena, contrasenaActual))) {
      throw new ErrorNegocio('La contraseña actual no es correcta', 401);
    }
    await pg.query('UPDATE usuario SET mfa_habilitado = FALSE, mfa_secreto = NULL, mfa_ultimo_paso = NULL WHERE id_usuario = $1', [usuarioSesion.id]);
    await bitacora.registrar({ tipo: 'MFA_DESACTIVADO', usuario: usuarioSesion, entidad: { tipo: 'usuario', codigo: String(usuarioSesion.id) } });
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

  // Consume el enlace que generó Administración (Funcionalidad 4): sin sesión, solo con el token.
  // No distingue "no existe" de "venció" o "ya se usó": decirlo abriría la puerta a probar tokens
  // al tanteo para saber cuáles sí existieron alguna vez.
  async function restablecerContrasena({ token, nueva, ip }) {
    const { rows } = await pg.query(
      `SELECT r.id_restablecimiento, r.id_usuario, r.expira_en, r.usado, u.correo, u.nombre, u.activo, rl.nombre AS rol
         FROM restablecimiento_contrasena r
         JOIN usuario u ON u.id_usuario = r.id_usuario
         JOIN rol rl ON rl.id_rol = u.id_rol
        WHERE r.hash_token = $1`,
      [sha256(token)],
    );
    const registro = rows[0];
    if (!registro || registro.usado || !registro.activo || new Date(registro.expira_en) < new Date()) {
      return { ok: false };
    }

    const politica = validarContrasena(nueva, { correo: registro.correo, nombre: registro.nombre });
    if (!politica.valida) throw new ErrorNegocio(`Contraseña no cumple la política: ${politica.errores.join('; ')}`, 400);

    const hash = await hashContrasena(nueva);
    await pg.query(
      'UPDATE usuario SET hash_contrasena = $1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $2',
      [hash, registro.id_usuario],
    );
    await pg.query('UPDATE restablecimiento_contrasena SET usado = TRUE WHERE id_restablecimiento = $1', [registro.id_restablecimiento]);
    await pg.query('UPDATE sesion SET revocada = TRUE WHERE id_usuario = $1 AND NOT revocada', [registro.id_usuario]);
    await bitacora.registrar({
      tipo: 'CONTRASENA_RESTABLECIDA',
      usuario: { id: registro.id_usuario, rol: registro.rol },
      entidad: { tipo: 'usuario', codigo: String(registro.id_usuario) },
      ip,
    });
    return { ok: true };
  }

  return {
    hashContrasena, iniciarSesion, completarIngresoMfa, renovarSesion, cambiarContrasena, cerrarSesion,
    restablecerContrasena, iniciarMfa, cancelarMfa, confirmarMfa, desactivarMfaPropio,
  };
}

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

module.exports = { crearServicioAutenticacion };
