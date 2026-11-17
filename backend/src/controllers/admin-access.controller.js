'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { adminPool } = require('../config/db');
const { jwtSecret } = require('../middleware/auth.middleware');
const { enviarCodigoRecuperacion, configuracionSMTP } = require('../services/admin-email.service');

const googleClient = new OAuth2Client();
const CODIGO_MINUTOS = 10;
const MAX_INTENTOS_CODIGO = 5;

function normalizarCorreo(valor) {
  return String(valor || '').trim().toLowerCase();
}

function tokenAdministrador(admin) {
  return jwt.sign({
    tipo: 'administrador',
    rol: 'administrador',
    nombre: admin.nombrecompleto,
    email: admin.correo,
    version_sesion: Number(admin.version_sesion || 1),
  }, jwtSecret(), { subject: String(admin.idadministrador), expiresIn: '8h', algorithm: 'HS256' });
}

function mensajeSolicitud() {
  return 'Si el correo corresponde a una cuenta administrativa activa, enviaremos un código de recuperación.';
}

function hashCodigo(adminId, codigo) {
  return crypto.createHmac('sha256', jwtSecret())
    .update(`${adminId}:${codigo}`)
    .digest('hex');
}

function codigoCoincide(guardado, ingresado) {
  if (!/^[a-f0-9]{64}$/i.test(String(guardado || ''))) return false;
  const esperado = Buffer.from(String(guardado), 'hex');
  const recibido = Buffer.from(String(ingresado), 'hex');
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

function correoValido(valor) {
  return valor.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function configuracionGoogle(req, res) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const correoPermitido = normalizarCorreo(process.env.ADMIN_GOOGLE_EMAIL);
  res.json({ ok: true, client_id: clientId && correoPermitido ? clientId : null });
}

async function iniciarSesionGoogle(req, res) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const correoPermitido = normalizarCorreo(process.env.ADMIN_GOOGLE_EMAIL);
  const credential = String(req.body?.credential || '');
  if (!clientId || !correoPermitido) {
    return res.status(503).json({ ok: false, message: 'Configura Google y el correo único autorizado para el administrador.' });
  }
  if (!credential || credential.length > 12000) {
    return res.status(400).json({ ok: false, message: 'No se recibió una credencial válida de Google.' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const correo = normalizarCorreo(payload?.email);
    if (!correo || payload?.email_verified !== true) {
      return res.status(401).json({ ok: false, message: 'Google no confirmó el correo de esta cuenta.' });
    }
    if (correo !== correoPermitido) {
      return res.status(403).json({ ok: false, message: 'Este correo de Google no está autorizado para el acceso administrativo.' });
    }

    const { rows } = await adminPool.query(
      `SELECT idadministrador, usuario, nombrecompleto, correo, version_sesion
         FROM administrador
        WHERE LOWER(correo) = $1 AND estado = TRUE
        LIMIT 1`,
      [correo]
    );
    const admin = rows[0];
    if (!admin) {
      return res.status(403).json({ ok: false, message: 'Esta cuenta de Google no está autorizada como administrador en MenuGo.' });
    }

    return res.json({
      ok: true,
      token: tokenAdministrador(admin),
      message: 'Inicio de sesión con Google exitoso.',
      data: {
        id_administrador: admin.idadministrador,
        usuario: admin.usuario,
        nombre: admin.nombrecompleto,
        correo: admin.correo,
        rol: 'Administrador',
      },
    });
  } catch (error) {
    console.error('No se pudo validar el inicio de sesión de Google:', error.message);
    return res.status(401).json({ ok: false, message: 'No se pudo verificar la cuenta de Google. Inténtalo nuevamente.' });
  }
}

async function solicitarRecuperacion(req, res) {
  const correo = normalizarCorreo(req.body?.correo);
  if (!correoValido(correo)) return res.json({ ok: true, message: mensajeSolicitud() });

  try {
    configuracionSMTP();
  } catch (error) {
    if (error.code === 'SMTP_CONFIG') {
      return res.status(503).json({ ok: false, message: 'El envío de correo de recuperación aún no está configurado en el servidor.' });
    }
    return res.status(503).json({ ok: false, message: 'No está disponible la recuperación por correo.' });
  }

  try {
    const { rows: admins } = await adminPool.query(
      `SELECT idadministrador, nombrecompleto, correo
         FROM administrador
        WHERE LOWER(correo) = $1 AND estado = TRUE
        LIMIT 1`,
      [correo]
    );
    const admin = admins[0];
    if (!admin) return res.json({ ok: true, message: mensajeSolicitud() });

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codigoHash = hashCodigo(admin.idadministrador, codigo);
    const { rows: guardados } = await adminPool.query(
      `INSERT INTO admin_password_recovery_codes
         (id_administrador, codigo_hash, intentos, expires_at, sent_at, consumed_at)
       VALUES ($1, $2, 0, NOW() + INTERVAL '${CODIGO_MINUTOS} minutes', NOW(), NULL)
       ON CONFLICT (id_administrador)
       DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash,
                     intentos = 0,
                     expires_at = EXCLUDED.expires_at,
                     sent_at = NOW(),
                     consumed_at = NULL
         WHERE admin_password_recovery_codes.sent_at <= NOW() - INTERVAL '60 seconds'
       RETURNING id_administrador`,
      [admin.idadministrador, codigoHash]
    );
    if (!guardados.length) return res.json({ ok: true, message: mensajeSolicitud() });

    try {
      await enviarCodigoRecuperacion({
        correo: admin.correo,
        nombre: admin.nombrecompleto,
        codigo,
        minutos: CODIGO_MINUTOS,
      });
    } catch (error) {
      await adminPool.query(
        `UPDATE admin_password_recovery_codes
            SET consumed_at = NOW()
          WHERE id_administrador = $1 AND codigo_hash = $2`,
        [admin.idadministrador, codigoHash]
      ).catch(() => {});
      console.error('No se pudo enviar el código de recuperación del administrador:', error.message);
      return res.status(503).json({ ok: false, message: 'No se pudo enviar el correo. Revisa la configuración SMTP del servidor e inténtalo nuevamente.' });
    }

    return res.json({ ok: true, message: mensajeSolicitud() });
  } catch (error) {
    console.error('Error al solicitar recuperación de administrador:', error.message);
    return res.status(500).json({ ok: false, message: 'No se pudo procesar la solicitud de recuperación.' });
  }
}

async function restablecerConCodigo(req, res) {
  const correo = normalizarCorreo(req.body?.correo);
  const codigo = String(req.body?.codigo || '').trim();
  const nuevaClave = String(req.body?.nueva_clave || '');
  if (!correoValido(correo) || !/^\d{6}$/.test(codigo)) {
    return res.status(400).json({ ok: false, message: 'El correo o el código no son válidos o el código venció.' });
  }
  if (nuevaClave.length < 12 || nuevaClave.length > 128) {
    return res.status(400).json({ ok: false, message: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' });
  }

  let cliente;
  try {
    const { rows: admins } = await adminPool.query(
      `SELECT idadministrador
         FROM administrador
        WHERE LOWER(correo) = $1 AND estado = TRUE
        LIMIT 1`,
      [correo]
    );
    const admin = admins[0];
    if (!admin) return res.status(400).json({ ok: false, message: 'El correo o el código no son válidos o el código venció.' });

    cliente = await adminPool.connect();
    await cliente.query('BEGIN');
    const { rows: codigos } = await cliente.query(
      `SELECT codigo_hash, intentos, consumed_at, (expires_at > NOW()) AS vigente
         FROM admin_password_recovery_codes
        WHERE id_administrador = $1
        FOR UPDATE`,
      [admin.idadministrador]
    );
    const registro = codigos[0];
    if (!registro || registro.consumed_at || !registro.vigente || Number(registro.intentos) >= MAX_INTENTOS_CODIGO) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'El correo o el código no son válidos o el código venció.' });
    }

    const hashIngresado = hashCodigo(admin.idadministrador, codigo);
    if (!codigoCoincide(registro.codigo_hash, hashIngresado)) {
      await cliente.query(
        `UPDATE admin_password_recovery_codes
            SET intentos = LEAST(intentos + 1, $2)
          WHERE id_administrador = $1`,
        [admin.idadministrador, MAX_INTENTOS_CODIGO]
      );
      await cliente.query('COMMIT');
      return res.status(400).json({ ok: false, message: 'El correo o el código no son válidos o el código venció.' });
    }

    const claveHash = await bcrypt.hash(nuevaClave, 12);
    await cliente.query(
      'UPDATE administrador SET clave = $1, version_sesion = version_sesion + 1 WHERE idadministrador = $2 AND estado = TRUE',
      [claveHash, admin.idadministrador]
    );
    await cliente.query(
      `UPDATE admin_password_recovery_codes
          SET consumed_at = NOW()
        WHERE id_administrador = $1`,
      [admin.idadministrador]
    );
    await cliente.query('COMMIT');
    return res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    if (cliente) await cliente.query('ROLLBACK').catch(() => {});
    console.error('Error al restablecer contraseña del administrador:', error.message);
    return res.status(500).json({ ok: false, message: 'No se pudo actualizar la contraseña.' });
  } finally {
    cliente?.release();
  }
}

module.exports = {
  configuracionGoogle,
  iniciarSesionGoogle,
  solicitarRecuperacion,
  restablecerConCodigo,
};
