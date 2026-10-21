'use strict';

// MenuGo - Commit 16/20: arqueo fisico y cierre transaccional de turnos.
// Los importes se suman en PostgreSQL NUMERIC, no con floats de JavaScript.
const crypto = require('node:crypto');
const { cajeroPool } = require('../config/db');

const MAX_CENTAVOS = 999999999999; // NUMERIC(12,2)

function cajeroDelJwt(req) {
  const id = Number(req.personal?.id_trabajador);
  return req.personal?.rol === 'cajero' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validarTurno(id) {
  const texto = String(id ?? '');
  if (!/^[1-9]\d*$/.test(texto) || !Number.isSafeInteger(Number(texto))) {
    throw new Error('Identificador del turno invalido.');
  }
  return Number(texto);
}

function validarEfectivoContado(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error('Ingresa el efectivo contado en soles.');
  }
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error('El efectivo contado debe ser no negativo y tener hasta dos decimales.');
  }
  const [enteros, decimales = ''] = texto.split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > MAX_CENTAVOS) {
    throw new Error('El efectivo contado supera el limite permitido.');
  }
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function validarObservacionesCierre(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new Error('Las observaciones deben ser texto.');
  const nota = valor.trim();
  if (nota.length > 500) throw new Error('Las observaciones no pueden exceder 500 caracteres.');
  return nota || null;
}

function validarClaveCierre(valor) {
  if (typeof valor !== 'string' || valor.length < 16 || valor.length > 100 ||
      valor.trim() !== valor || /[\x00-\x1f\x7f]/.test(valor)) {
    throw new Error('Es necesaria una clave segura para evitar cierres duplicados. Usa HTTPS o localhost.');
  }
  return valor;
}

function huellaCierre(idCajero, idTurno, contado, observaciones) {
  return crypto.createHash('sha256').update(JSON.stringify([
    idCajero, idTurno, contado, observaciones,
  ])).digest('hex');
}

// Dos agregados independientes: evita el producto cartesiano pagos x movimientos.
// Las ventas digitales se muestran en el reporte pero NO aumentan el efectivo.
const RESUMEN_TURNO_SQL = `
  SELECT t.id_turno, t.id_cajero, t.estado, t.abierto_at, t.cerrado_at,
         t.fondo_inicial, t.efectivo_esperado, t.efectivo_contado,
         t.diferencia, t.observaciones, t.observaciones_cierre,
         COALESCE(p.cantidad_pagos, 0)::integer AS cantidad_pagos,
         COALESCE(p.total_cobrado, 0) AS total_cobrado,
         COALESCE(p.ventas_efectivo, 0) AS ventas_efectivo,
         COALESCE(p.ventas_yape, 0) AS ventas_yape,
         COALESCE(p.ventas_plin, 0) AS ventas_plin,
         COALESCE(p.ventas_tarjeta_credito, 0) AS ventas_tarjeta_credito,
         COALESCE(p.ventas_tarjeta_debito, 0) AS ventas_tarjeta_debito,
         COALESCE(m.total_ingresos, 0) AS total_ingresos,
         COALESCE(m.total_retiros, 0) AS total_retiros,
         COALESCE(m.cantidad_movimientos, 0)::integer AS cantidad_movimientos,
         (t.fondo_inicial + COALESCE(p.ventas_efectivo, 0)
           + COALESCE(m.total_ingresos, 0) - COALESCE(m.total_retiros, 0)) AS efectivo_teorico
  FROM public.turnos_caja t
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cantidad_pagos,
           COALESCE(SUM(pg.monto), 0) AS total_cobrado,
           COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'efectivo'), 0) AS ventas_efectivo,
           COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'yape'), 0) AS ventas_yape,
           COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'plin'), 0) AS ventas_plin,
           COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'tarjeta_credito'), 0) AS ventas_tarjeta_credito,
           COALESCE(SUM(pg.monto) FILTER (WHERE pg.metodo_pago = 'tarjeta_debito'), 0) AS ventas_tarjeta_debito
    FROM public.pagos pg
    WHERE pg.id_turno = t.id_turno AND pg.estado_pago = 'pagado'
  ) p ON TRUE
  LEFT JOIN public.v_resumen_movimientos_caja m ON m.id_turno = t.id_turno
`;

function informarError(res, error, accion) {
  console.error(`Error de ${accion} de caja:`, error);
  if (['42P01', '42703', '42883'].includes(error.code)) {
    return res.status(503).json({ ok: false, code: 'MIGRACION_CIERRE_PENDIENTE',
      message: 'Aplica las migraciones de los commits 12, 14 y 16 en Neon.' });
  }
  if (error.code === '23505') {
    return res.status(409).json({ ok: false, code: 'CLAVE_CIERRE_REUTILIZADA',
      message: 'Esta clave se ha usado en otro cierre. Consulta el historial.' });
  }
  if (error.code === '23514') {
    return res.status(409).json({ ok: false, code: 'CIERRE_INVALIDO',
      message: 'El turno no cumple las condiciones para el arqueo.' });
  }
  return res.status(500).json({ ok: false, message: `No se pudo ${accion} el turno.` });
}

async function consultarArqueoActual(req, res) {
  const idCajero = cajeroDelJwt(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo un cajero puede consultar su arqueo.' });
  try {
    const { rows } = await cajeroPool.query(`${RESUMEN_TURNO_SQL}
      WHERE t.id_cajero = $1 AND t.estado = 'abierto'
      ORDER BY t.abierto_at DESC LIMIT 1`, [idCajero]);
    return res.json({ ok: true, hay_turno: Boolean(rows[0]), data: rows[0] || null });
  } catch (error) { return informarError(res, error, 'consultar el arqueo'); }
}

async function listarTurnosCerrados(req, res) {
  const idCajero = cajeroDelJwt(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo un cajero puede consultar sus cierres.' });
  try {
    const { rows } = await cajeroPool.query(`${RESUMEN_TURNO_SQL}
      WHERE t.id_cajero = $1 AND t.estado = 'cerrado'
      ORDER BY t.cerrado_at DESC, t.id_turno DESC LIMIT 20`, [idCajero]);
    return res.json({ ok: true, data: rows });
  } catch (error) { return informarError(res, error, 'consultar los cierres'); }
}

async function cerrarTurnoCaja(req, res) {
  const idCajero = cajeroDelJwt(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo un cajero puede cerrar su turno.' });

  let idTurno, contado, observaciones, clave;
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new Error('Datos de arqueo invalidos.');
    }
    idTurno = validarTurno(req.params?.id);
    contado = validarEfectivoContado(req.body.efectivo_contado);
    observaciones = validarObservacionesCierre(req.body.observaciones_cierre);
    clave = validarClaveCierre(req.body.idempotency_key);
  } catch (error) { return res.status(400).json({ ok: false, message: error.message }); }

  const huella = huellaCierre(idCajero, idTurno, contado, observaciones);
  let client;
  let transaccion = false;
  try {
    client = await cajeroPool.connect();
    await client.query('BEGIN');
    transaccion = true;

    // FOR UPDATE espera los pagos FOR SHARE y los movimientos FOR UPDATE
    // del commit 13/15; no permite que se cierre mientras otro opera.
    const resultado = await client.query(`
      SELECT id_turno, id_cajero, estado, cierre_idempotency_key, cierre_idempotency_hash
      FROM public.turnos_caja
      WHERE id_turno = $1 AND id_cajero = $2
      FOR UPDATE
    `, [idTurno, idCajero]);
    const turno = resultado.rows[0];
    if (!turno) {
      await client.query('ROLLBACK'); transaccion = false;
      return res.status(404).json({ ok: false, message: 'No se encontro este turno para tu usuario.' });
    }
    if (turno.estado === 'cerrado') {
      if (turno.cierre_idempotency_key !== clave || turno.cierre_idempotency_hash !== huella) {
        await client.query('ROLLBACK'); transaccion = false;
        return res.status(409).json({ ok: false, code: 'TURNO_YA_CERRADO',
          message: 'El turno ya fue cerrado mediante otra operacion. Consulta el historial.' });
      }
      const repetido = await client.query(`${RESUMEN_TURNO_SQL}
        WHERE t.id_turno = $1 AND t.id_cajero = $2`, [idTurno, idCajero]);
      await client.query('COMMIT'); transaccion = false;
      return res.status(200).json({ ok: true, repetido: true,
        message: 'Este turno ya estaba cerrado; no se registro otro cierre.', data: repetido.rows[0] });
    }
    if (turno.estado !== 'abierto') {
      await client.query('ROLLBACK'); transaccion = false;
      return res.status(409).json({ ok: false, message: 'El turno no se encuentra abierto.' });
    }

    // Calculo definitivo DESPUES del bloqueo, en la misma transaccion.
    const resumen = await client.query(`${RESUMEN_TURNO_SQL}
      WHERE t.id_turno = $1 AND t.id_cajero = $2`, [idTurno, idCajero]);
    const efectivoEsperado = resumen.rows[0]?.efectivo_teorico;
    if (efectivoEsperado === undefined || efectivoEsperado === null || Number(efectivoEsperado) < 0) {
      await client.query('ROLLBACK'); transaccion = false;
      return res.status(409).json({ ok: false, code: 'SALDO_TEORICO_INVALIDO',
        message: 'El saldo esperado no es valido. Revisa los movimientos del turno.' });
    }

    // El UPDATE almacena esperado, contado y diferencia con NUMERIC exacto.
    const { rows } = await client.query(`
      UPDATE public.turnos_caja
      SET estado = 'cerrado', cerrado_at = CURRENT_TIMESTAMP,
          efectivo_esperado = $3::numeric,
          efectivo_contado = $4::numeric,
          diferencia = $4::numeric - $3::numeric,
          observaciones_cierre = $5,
          cierre_idempotency_key = $6,
          cierre_idempotency_hash = $7
      WHERE id_turno = $1 AND id_cajero = $2 AND estado = 'abierto'
      RETURNING id_turno, estado, cerrado_at, efectivo_esperado, efectivo_contado,
                diferencia, observaciones_cierre
    `, [idTurno, idCajero, efectivoEsperado, contado, observaciones, clave, huella]);
    if (!rows[0]) throw new Error('No se pudo confirmar el cierre del turno.');
    await client.query('COMMIT'); transaccion = false;
    return res.status(201).json({ ok: true, repetido: false,
      message: 'Arqueo registrado y turno cerrado correctamente.',
      data: { ...resumen.rows[0], ...rows[0] } });
  } catch (error) {
    if (client && transaccion) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('Error al revertir cierre de caja:', rollbackError);
      }
    }
    return informarError(res, error, 'cerrar');
  } finally {
    if (client) client.release();
  }
}

module.exports = { consultarArqueoActual, listarTurnosCerrados, cerrarTurnoCaja };
