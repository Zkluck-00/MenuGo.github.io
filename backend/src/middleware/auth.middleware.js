// MenuGo - autenticacion y autorizacion real por roles.
const jwt = require('jsonwebtoken');
const { adminPool } = require('../config/db');

function jwtSecret() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto || secreto.length < 32) {
    const error = new Error('Configura JWT_SECRET con al menos 32 caracteres en backend/.env.');
    error.code = 'JWT_CONFIG';
    throw error;
  }
  return secreto;
}

function normalizarRol(valor) {
  const rol = String(valor || '').trim().toLowerCase();
  if (['mesero', 'mozo', 'camarero'].includes(rol)) return 'mesero';
  if (['cocina', 'cocinero', 'cocinera', 'chef'].includes(rol)) return 'cocina';
  if (['cajero', 'cajera', 'caja'].includes(rol)) return 'cajero';
  if (['admin', 'administrador', 'administradora'].includes(rol)) return 'administrador';
  return rol;
}

function trabajadorActivo(estado) {
  return estado === true || ['activo', 'true'].includes(String(estado || '').trim().toLowerCase());
}

function credencialesRequeridas(res) {
  return res.status(401).json({ ok: false, message: 'Inicia sesion con una cuenta de personal valida.' });
}

async function autenticarPersonal(req, res, next) {
  const cabecera = String(req.headers.authorization || '');
  const match = cabecera.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return credencialesRequeridas(res);

  let payload;
  try {
    payload = jwt.verify(match[1], jwtSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    if (error.code === 'JWT_CONFIG') {
      return res.status(503).json({ ok: false, message: 'Autenticacion del servidor sin configurar.' });
    }
    return credencialesRequeridas(res);
  }

  const tipo = String(payload.tipo || '').toLowerCase();
  const rolToken = normalizarRol(payload.rol);
  const id = Number(payload.sub);
  if (!Number.isSafeInteger(id) || id <= 0 || !['personal', 'administrador'].includes(tipo)) {
    return credencialesRequeridas(res);
  }
  if (tipo === 'administrador' && rolToken !== 'administrador') return credencialesRequeridas(res);
  if (tipo === 'personal' && !['administrador', 'mesero', 'cajero', 'cocina'].includes(rolToken)) {
    return credencialesRequeridas(res);
  }

  try {
    if (tipo === 'personal') {
      const { rows } = await adminPool.query(
        'SELECT idtrabajador, rol, estado FROM trabajador WHERE idtrabajador = $1 LIMIT 1', [id]
      );
      const trabajador = rows[0];
      if (!trabajador || !trabajadorActivo(trabajador.estado) || normalizarRol(trabajador.rol) !== rolToken) {
        return credencialesRequeridas(res);
      }
      req.personal = {
        id_trabajador: id, id_administrador: null, rol: rolToken,
        nombre: String(payload.nombre || ''), email: String(payload.email || ''),
      };
    } else {
      const { rows } = await adminPool.query(
        'SELECT idadministrador, estado FROM administrador WHERE idadministrador = $1 LIMIT 1', [id]
      );
      if (!rows[0] || rows[0].estado !== true) return credencialesRequeridas(res);
      req.personal = {
        id_trabajador: null, id_administrador: id, rol: 'administrador',
        nombre: String(payload.nombre || ''), email: String(payload.email || ''),
      };
    }
    return next();
  } catch (error) {
    console.error('No se pudo validar la sesion del personal:', error);
    return res.status(503).json({ ok: false, message: 'No se pudo verificar la sesion con PostgreSQL.' });
  }
}

function autenticarPersonalOpcional(req, res, next) {
  if (!req.headers.authorization) return next();
  return autenticarPersonal(req, res, next);
}

function autorizarRoles(...rolesPermitidos) {
  const roles = rolesPermitidos.map(normalizarRol);
  return (req, res, next) => {
    if (!req.personal || !roles.includes(normalizarRol(req.personal.rol))) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para esta operacion.' });
    }
    return next();
  };
}

module.exports = {
  autenticarPersonal, autenticarPersonalOpcional, autorizarRoles,
  jwtSecret, normalizarRol,
};
