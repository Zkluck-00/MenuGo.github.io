// Requiere el token del QR de la mesa en rutas publicas de seguimiento y solicitudes.
const { clientePool } = require('../config/db');

async function validarAccesoQrMesa(req, res, next) {
  const numero = Number(req.params.id_mesa);
  const token = String(req.query?.token || req.query?.qr_token || req.body?.qr_token || req.body?.token || '').trim();
  if (!Number.isSafeInteger(numero) || numero <= 0 || !token) {
    return res.status(403).json({ ok: false, message: 'Escanea el QR de tu mesa para continuar.' });
  }
  try {
    const { rows } = await clientePool.query(
      `SELECT id_mesa FROM mesas
       WHERE numero_mesa = $1 AND qr_token = $2 AND activo = true
         AND COALESCE(qr_activo, true) = true LIMIT 1`,
      [numero, token]
    );
    if (!rows.length) return res.status(403).json({ ok: false, message: 'El codigo QR no corresponde a esta mesa.' });
    req.mesaQr = { id_mesa: Number(rows[0].id_mesa), numero_mesa: numero };
    return next();
  } catch (error) {
    console.error('Error al validar el QR de mesa:', error);
    return res.status(503).json({ ok: false, message: 'No se pudo validar el codigo QR.' });
  }
}

module.exports = { validarAccesoQrMesa };
