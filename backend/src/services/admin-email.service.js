'use strict';

const nodemailer = require('nodemailer');

function configuracionSMTP() {
  const usuario = String(process.env.SMTP_USER || '').trim();
  const clave = String(process.env.SMTP_PASSWORD || '').trim();
  if (!usuario || !clave) {
    const error = new Error('Configura SMTP_USER y SMTP_PASSWORD para enviar correos de recuperación.');
    error.code = 'SMTP_CONFIG';
    throw error;
  }

  const puerto = Number(process.env.SMTP_PORT || 465);
  const secureValue = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureValue ? ['1', 'true', 'yes'].includes(secureValue) : puerto === 465;
  return {
    host: String(process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port: puerto,
    secure,
    auth: { user: usuario, pass: clave },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { minVersion: 'TLSv1.2' },
  };
}

function escaparHTML(valor) {
  return String(valor || '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caracter]);
}

async function enviarCodigoRecuperacion({ correo, nombre, codigo, minutos = 10 }) {
  const config = configuracionSMTP();
  const transporter = nodemailer.createTransport(config);
  const nombreSeguro = escaparHTML(nombre || 'Administrador');
  const remitente = String(process.env.SMTP_FROM || process.env.SMTP_USER).trim();
  await transporter.sendMail({
    from: remitente,
    to: correo,
    subject: 'Código para recuperar el acceso de MenuGo',
    text: `Hola ${nombre || 'Administrador'},\n\nTu código para restablecer la contraseña de MenuGo es: ${codigo}\n\nVence en ${minutos} minutos y solo puede utilizarse una vez. Si no solicitaste este código, ignora este mensaje.`,
    html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>Recuperación de acceso a MenuGo</h2><p>Hola ${nombreSeguro},</p><p>Usa este código para restablecer la contraseña:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#ea580c">${codigo}</p><p>El código vence en ${minutos} minutos y solo puede utilizarse una vez.</p><p>Si no solicitaste este código, ignora este mensaje.</p></div>`,
  });
}

module.exports = { enviarCodigoRecuperacion, configuracionSMTP };
