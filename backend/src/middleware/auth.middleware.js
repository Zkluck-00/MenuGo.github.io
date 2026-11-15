const jwt = require('jsonwebtoken');

function jwtSecret() {
  return process.env.JWT_SECRET || 'menugo-desarrollo-cambiar-en-produccion';
}

function normalizarRol(valor) {
  return String(valor || '').trim().toLowerCase();
}

function autenticarPersonal(req, res, next) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ ok: false, message: 'Debes iniciar sesion para usar este modulo.' });
  }

  try {
    const payload = jwt.verify(match[1], jwtSecret());
    if (payload.tipo !== 'personal' || !payload.sub || !payload.rol) {
      return res.status(401).json({ ok: false, message: 'Sesion de personal invalida.' });
    }
    req.personal = {
      id_trabajador: Number(payload.sub),
      rol: normalizarRol(payload.rol),
      nombre: payload.nombre || '',
      email: payload.email || '',
    };
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: 'La sesion vencio o no es valida. Inicia sesion nuevamente.' });
  }
}

function autorizarRoles(...rolesPermitidos) {
  const roles = rolesPermitidos.map(normalizarRol);
  return (req, res, next) => {
    if (!req.personal || !roles.includes(normalizarRol(req.personal.rol))) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para realizar esta accion.' });
    }
    next();
  };
}

module.exports = { autenticarPersonal, autorizarRoles, jwtSecret };
