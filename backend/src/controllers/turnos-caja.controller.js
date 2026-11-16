'use strict';

// MenuGo - Commit 13: apertura y consulta de turnos de caja.
// El id del cajero procede SIEMPRE del JWT autenticado, nunca del request body.
const { cajeroPool } = require('../config/db');

const MAX_FONDO_CENTAVOS = 999999999999; // NUMERIC(12,2)
const COLUMNAS_TURNO = `
  t.id_turno, t.id_cajero, t.estado, t.abierto_at,
  t.fondo_inicial, t.observaciones,
  COALESCE(p.cantidad_pagos, 0)::int AS cantidad_pagos,
  COALESCE(p.total_cobrado, 0) AS total_cobrado,
  COALESCE(p.ventas_efectivo, 0) AS ventas_efectivo
`;

function obtenerCajeroSesion(req) {
  const id = Number(req.personal?.id_trabajador);
  return Number.isSafeInteger(id) && id > 0 && req.personal?.rol === 'cajero'
    ? id : null;
}

function validarFondoInicial(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error('Ingresa el fondo inicial en soles (hasta dos decimales).');
  }
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error('El fondo inicial debe ser un numero no negativo, con hasta dos decimales.');
  }
  const [enteros, decimales = ''] = texto.split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > MAX_FONDO_CENTAVOS) {
    throw new Error('El fondo inicial supera el limite permitido.');
  }
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function validarObservaciones(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new Error('Las observaciones deben ser texto.');
  const texto = valor.trim();
  if (texto.length > 500) throw new Error('Las observaciones no pueden superar 500 caracteres.');
  return texto || null;
}

function errorTurnos(res, error, accion) {
  console.error(`Error al ${accion} turno de caja:`, error);
  if (['42P01', '42703', '42P10'].includes(error.code)) {
    return res.status(503).json({
      ok: false,
      code: 'MIGRACION_TURNOS_PENDIENTE',
      message: 'La estructura de turnos no esta disponible. Aplica la migracion SQL del commit 12.',
    });
  }
  return res.status(500).json({ ok: false, message: `No se pudo ${accion} el turno de caja.` });
}

// Devuelve solamente el turno del trabajador autenticado. Las ventas se
// calculan por pagos.id_turno (no por fecha, para no mezclar turnos).
async function obtenerTurnoActual(req, res) {
  const idCajero = obtenerCajeroSesion(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo un cajero autenticado puede consultar su turno.' });
  try {
    const { rows } = await cajeroPool.query(`
      SELECT ${COLUMNAS_TURNO}
      FROM public.turnos_caja t
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cantidad_pagos,
               COALESCE(SUM(pg.monto), 0) AS total_cobrado,
               COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'efectivo'), 0) AS ventas_efectivo
        FROM public.pagos pg
        WHERE pg.id_turno = t.id_turno AND pg.estado_pago = 'pagado'
      ) p ON true
      WHERE t.id_cajero = $1 AND t.estado = 'abierto'
      LIMIT 1
    `, [idCajero]);
    return res.json({ ok: true, hay_turno: Boolean(rows[0]), data: rows[0] || null });
  } catch (error) {
    return errorTurnos(res, error, 'consultar');
  }
}

// La unicidad del indice parcial del commit 12 evita aperturas duplicadas
// incluso si dos pestañas presionan el boton al mismo tiempo.
async function abrirTurnoCaja(req, res) {
  const idCajero = obtenerCajeroSesion(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo un cajero autenticado puede abrir un turno.' });
  let fondoInicial, observaciones;
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Datos de apertura invalidos.');
    }
    fondoInicial = validarFondoInicial(body.fondo_inicial);
    observaciones = validarObservaciones(body.observaciones);
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message });
  }
  try {
    const { rows } = await cajeroPool.query(`
      INSERT INTO public.turnos_caja
        (id_cajero, estado, fondo_inicial, observaciones)
      VALUES ($1, 'abierto', $2, $3)
      ON CONFLICT (id_cajero) WHERE estado = 'abierto'
      DO NOTHING
      RETURNING id_turno, id_cajero, estado, abierto_at, fondo_inicial, observaciones
    `, [idCajero, fondoInicial, observaciones]);

    if (rows.length) {
      return res.status(201).json({
        ok: true,
        message: 'Turno abierto correctamente.',
        data: { ...rows[0], cantidad_pagos: 0, total_cobrado: '0.00', ventas_efectivo: '0.00' },
      });
    }

    // Conflicto seguro: no se crea otro turno, ni se cambia su fondo.
    return res.status(409).json({
      ok: false,
      code: 'TURNO_YA_ABIERTO',
      message: 'Ya tienes un turno abierto. Consulta tu turno actual antes de registrar otra apertura.',
    });
  } catch (error) {
    return errorTurnos(res, error, 'abrir');
  }
}

module.exports = { abrirTurnoCaja, obtenerTurnoActual };
