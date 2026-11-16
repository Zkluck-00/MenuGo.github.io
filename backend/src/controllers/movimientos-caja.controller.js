'use strict';

// MenuGo - Commit 15/20. Movimientos MANUALES del efectivo del turno.
// Las ventas se registran en pagos, nunca aqui.
const crypto = require('node:crypto');
const { cajeroPool } = require('../config/db');

const MAX_CENTAVOS = 999999999999; // NUMERIC(12,2)
const CATEGORIAS = {
  ingreso: new Set(['reposicion', 'ajuste', 'otro']),
  retiro: new Set(['gasto', 'retiro_banco', 'ajuste', 'otro']),
};

function cajeroAutenticado(req) {
  const id = Number(req.personal?.id_trabajador);
  return req.personal?.rol === 'cajero' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function importePositivo(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error('Ingresa un monto valido con hasta dos decimales.');
  }
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error('El monto debe ser positivo y tener como maximo dos decimales.');
  }
  const [enteros, decimales = ''] = texto.split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > MAX_CENTAVOS) {
    throw new Error('El monto debe ser mayor que cero y estar dentro del limite permitido.');
  }
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function textoObligatorio(valor, campo, minimo, maximo) {
  if (typeof valor !== 'string') throw new Error(`El campo ${campo} debe ser texto.`);
  const texto = valor.trim();
  if (texto.length < minimo || texto.length > maximo) {
    throw new Error(`${campo} debe tener entre ${minimo} y ${maximo} caracteres.`);
  }
  return texto;
}

function validarEntrada(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Los datos del movimiento no son validos.');
  }
  const idValido = (typeof body.id_turno === 'number' && Number.isSafeInteger(body.id_turno)) ||
    (typeof body.id_turno === 'string' && /^[1-9]\d*$/.test(body.id_turno));
  const idTurno = Number(body.id_turno);
  if (!idValido || !Number.isSafeInteger(idTurno) || idTurno <= 0) throw new Error('Turno invalido.');
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim().toLowerCase() : '';
  const categoria = typeof body.categoria === 'string' ? body.categoria.trim().toLowerCase() : '';
  if (!CATEGORIAS[tipo] || !CATEGORIAS[tipo].has(categoria)) {
    throw new Error('El tipo y la categoria del movimiento no son compatibles.');
  }
  const monto = importePositivo(body.monto);
  const motivo = textoObligatorio(body.motivo, 'Motivo', 5, 300);
  const referencia = body.referencia === undefined || body.referencia === null || body.referencia === ''
    ? null : textoObligatorio(body.referencia, 'Referencia', 1, 100);
  if (typeof body.idempotency_key !== 'string' ||
      body.idempotency_key.length < 16 || body.idempotency_key.length > 100 ||
      body.idempotency_key !== body.idempotency_key.trim() ||
      /[\x00-\x1f\x7f]/.test(body.idempotency_key)) {
    throw new Error('La clave segura de la operacion es obligatoria. Recarga la pagina desde HTTPS o localhost.');
  }
  return { idTurno, tipo, categoria, monto, motivo, referencia, clave: body.idempotency_key };
}

function huellaMovimiento(idCajero, datos) {
  const canonico = [idCajero, datos.idTurno, datos.tipo, datos.categoria,
    datos.monto, datos.motivo, datos.referencia];
  return crypto.createHash('sha256').update(JSON.stringify(canonico)).digest('hex');
}

function informarError(res, error, operacion) {
  console.error(`Error al ${operacion} movimientos de caja:`, error);
  if (['42P01', '42703', '42883'].includes(error.code)) {
    return res.status(503).json({ ok: false, code: 'MIGRACION_MOVIMIENTOS_PENDIENTE',
      message: 'Aplica las migraciones SQL de los commits 12 y 14.' });
  }
  if (error.code === '23514') {
    return res.status(409).json({ ok: false, code: 'TURNO_NO_DISPONIBLE',
      message: 'El turno ya no acepta movimientos de efectivo.' });
  }
  if (error.code === '23505') {
    return res.status(409).json({ ok: false, code: 'MOVIMIENTO_DUPLICADO',
      message: 'La operacion ya fue registrada. Consulta el historial antes de reintentar.' });
  }
  return res.status(500).json({ ok: false, message: 'No se pudo completar la operacion de caja.' });
}

// Solo informacion del TURNO ABIERTO del cajero JWT.
// El join usa una vista preagrupada y un lateral independiente para pagos:
// nunca se multiplican movimientos x pagos al calcular el efectivo.
async function listarMovimientosCaja(req, res) {
  const idCajero = cajeroAutenticado(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Acceso exclusivo del cajero.' });
  try {
    const turno = await cajeroPool.query(`
      SELECT t.id_turno, t.id_cajero, t.estado, t.abierto_at, t.fondo_inicial,
             COALESCE(p.ventas_efectivo, 0) AS ventas_efectivo,
             COALESCE(m.total_ingresos, 0) AS total_ingresos,
             COALESCE(m.total_retiros, 0) AS total_retiros,
             COALESCE(m.cantidad_movimientos, 0) AS cantidad_movimientos,
             t.fondo_inicial + COALESCE(p.ventas_efectivo, 0)
                + COALESCE(m.total_ingresos, 0) - COALESCE(m.total_retiros, 0)
                AS efectivo_teorico
      FROM public.turnos_caja t
      LEFT JOIN public.v_resumen_movimientos_caja m ON m.id_turno = t.id_turno
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pg.monto), 0) AS ventas_efectivo
        FROM public.pagos pg
        WHERE pg.id_turno = t.id_turno
          AND pg.estado_pago = 'pagado' AND pg.metodo_pago = 'efectivo'
      ) p ON TRUE
      WHERE t.id_cajero = $1 AND t.estado = 'abierto'
      LIMIT 1
    `, [idCajero]);
    if (!turno.rows[0]) return res.json({ ok: true, hay_turno: false, data: null, movimientos: [] });

    const movimientos = await cajeroPool.query(`
      SELECT id_movimiento, id_turno, id_registrado_por, tipo, categoria,
             monto, motivo, referencia, registrado_at
      FROM public.movimientos_caja
      WHERE id_turno = $1
      ORDER BY registrado_at DESC, id_movimiento DESC
      LIMIT 100
    `, [turno.rows[0].id_turno]);
    return res.json({ ok: true, hay_turno: true, data: turno.rows[0], movimientos: movimientos.rows });
  } catch (error) {
    return informarError(res, error, 'consultar');
  }
}

// La clave se bloquea antes de consultar el registro para gestionar solicitudes
// simultaneas. El indice UNIQUE del commit 14 es la garantia definitiva.
async function registrarMovimientoCaja(req, res) {
  const idCajero = cajeroAutenticado(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Acceso exclusivo del cajero.' });
  let datos;
  try { datos = validarEntrada(req.body); }
  catch (error) { return res.status(400).json({ ok: false, message: error.message }); }

  const huella = huellaMovimiento(idCajero, datos);
  let client;
  let transaccion = false;
  try {
    client = await cajeroPool.connect();
    await client.query('BEGIN');
    transaccion = true;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [datos.clave]);

    const anterior = await client.query(`
      SELECT id_movimiento, id_turno, id_registrado_por, tipo, categoria,
             monto, motivo, referencia, registrado_at, idempotency_hash
      FROM public.movimientos_caja
      WHERE idempotency_key = $1 LIMIT 1
    `, [datos.clave]);
    if (anterior.rows[0]) {
      const previo = anterior.rows[0];
      if (previo.idempotency_hash !== huella || Number(previo.id_registrado_por) !== idCajero ||
          Number(previo.id_turno) !== datos.idTurno) {
        await client.query('ROLLBACK'); transaccion = false;
        return res.status(409).json({ ok: false, code: 'IDEMPOTENCY_CONFLICT',
          message: 'Esta clave pertenece a otra operacion. Comprueba el historial.' });
      }
      await client.query('COMMIT'); transaccion = false;
      const { idempotency_hash: _ignorado, ...registro } = previo;
      return res.status(200).json({ ok: true, repetido: true,
        message: 'El movimiento ya estaba registrado. No se duplico.', data: registro });
    }

    // FOR UPDATE serializa el movimiento con los otros movimientos y con el
    // futuro cierre de turno. Nunca permite operar sobre otro trabajador.
    const turno = await client.query(`
      SELECT id_turno, estado, fondo_inicial
      FROM public.turnos_caja
      WHERE id_turno = $1 AND id_cajero = $2
      FOR UPDATE
    `, [datos.idTurno, idCajero]);
    if (!turno.rows[0] || turno.rows[0].estado !== 'abierto') {
      await client.query('ROLLBACK'); transaccion = false;
      return res.status(409).json({ ok: false, code: 'TURNO_CAJA_REQUERIDO',
        message: 'Abre tu turno de caja antes de registrar un movimiento.' });
    }

    // Un retiro no puede dejar el efectivo teorico por debajo de cero.
    // Se calculan ventas de efectivo y movimientos por separado, nunca JOIN
    // de ambas tablas sin preagrupar.
    if (datos.tipo === 'retiro') {
      const caja = await client.query(`
        SELECT saldo.disponible, saldo.disponible >= $2::numeric AS suficiente
        FROM (
          SELECT t.fondo_inicial
               + COALESCE((SELECT SUM(pg.monto) FROM public.pagos pg
                  WHERE pg.id_turno = t.id_turno AND pg.estado_pago = 'pagado'
                    AND pg.metodo_pago = 'efectivo'), 0)
               + COALESCE((SELECT SUM(m.monto) FROM public.movimientos_caja m
                  WHERE m.id_turno = t.id_turno AND m.tipo = 'ingreso'), 0)
               - COALESCE((SELECT SUM(m.monto) FROM public.movimientos_caja m
                  WHERE m.id_turno = t.id_turno AND m.tipo = 'retiro'), 0)
               AS disponible
          FROM public.turnos_caja t
          WHERE t.id_turno = $1
        ) saldo
      `, [datos.idTurno, datos.monto]);
      // La comparacion se ejecuta en NUMERIC de PostgreSQL: no usa floats JS.
      if (caja.rows[0]?.suficiente !== true) {
        await client.query('ROLLBACK'); transaccion = false;
        return res.status(409).json({ ok: false, code: 'EFECTIVO_INSUFICIENTE',
          message: 'El retiro supera el efectivo teorico disponible en el turno.' });
      }
    }

    const nuevo = await client.query(`
      INSERT INTO public.movimientos_caja
        (id_turno, id_registrado_por, tipo, categoria, monto, motivo,
         referencia, idempotency_key, idempotency_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id_movimiento, id_turno, id_registrado_por,
                tipo, categoria, monto, motivo, referencia, registrado_at
    `, [datos.idTurno, idCajero, datos.tipo, datos.categoria, datos.monto,
      datos.motivo, datos.referencia, datos.clave, huella]);
    await client.query('COMMIT'); transaccion = false;
    return res.status(201).json({ ok: true, repetido: false,
      message: 'Movimiento registrado correctamente.', data: nuevo.rows[0] });
  } catch (error) {
    if (client && transaccion) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('No fue posible revertir la transaccion de movimientos:', rollbackError);
      }
    }
    return informarError(res, error, 'registrar');
  } finally {
    if (client) client.release();
  }
}

module.exports = { listarMovimientosCaja, registrarMovimientoCaja };
