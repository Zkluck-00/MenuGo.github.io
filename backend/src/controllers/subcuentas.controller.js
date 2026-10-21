'use strict';

// MenuGo - Commit 18: participantes y asignacion de importes por producto.
// Las reglas finales de disponibilidad se validan en los triggers del commit 17.
const { cajeroPool } = require('../config/db');

const MAX_CENTAVOS = 999999999999;

function idPositivo(valor, etiqueta) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id < 1 || !/^\d+$/.test(String(valor))) {
    throw new Error(`${etiqueta} invalido.`);
  }
  return id;
}

function validarCajero(req) {
  const id = Number(req.personal?.id_trabajador);
  return req.personal?.rol === 'cajero' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function importeValido(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error('El importe asignado debe ser numerico y tener hasta dos decimales.');
  }
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error('El importe asignado debe ser positivo y tener hasta dos decimales.');
  }
  const [entera, decimal = ''] = texto.split('.');
  const centavos = Number(entera) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > MAX_CENTAVOS) {
    throw new Error('El importe asignado esta fuera de los limites permitidos.');
  }
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function cantidadValida(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (!['string', 'number'].includes(typeof valor)) throw new Error('Cantidad asignada invalida.');
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(texto) || !(Number(texto) > 0) || Number(texto) >= 10000000) {
    throw new Error('La cantidad debe ser positiva, con hasta tres decimales.');
  }
  return texto;
}

function nombreValido(valor) {
  if (typeof valor !== 'string') throw new Error('Ingresa el nombre de la persona.');
  const nombre = valor.trim();
  if (!nombre || nombre.length > 80 || /[\u0000-\u001f\u007f]/.test(nombre)) {
    throw new Error('El nombre debe tener entre 1 y 80 caracteres, sin saltos de linea.');
  }
  return nombre;
}

function cuerpoValido(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('Envia un cuerpo JSON valido.');
  }
  return valor;
}

function enviarError(res, error) {
  if (error.validacion) return res.status(400).json({ ok: false, message: error.message });
  if (error.code === '23505') {
    return res.status(409).json({ ok: false, code: 'DUPLICADO', message: 'Ya existe esa persona o asignacion en la cuenta.' });
  }
  if (['23503', '23514', '23502'].includes(error.code)) {
    return res.status(409).json({ ok: false, code: 'ASIGNACION_NO_PERMITIDA', message: 'La operacion excede el saldo disponible o incumple las reglas de la cuenta. Revisa los importes.' });
  }
  if (['42P01', '42703', '42883'].includes(error.code)) {
    return res.status(503).json({ ok: false, code: 'MIGRACION_SUBCUENTAS_PENDIENTE', message: 'Ejecuta la migracion de subcuentas del commit 17.' });
  }
  console.error('Error al gestionar subcuentas:', error);
  return res.status(500).json({ ok: false, message: 'No se pudo completar la operacion de subcuentas.' });
}

function errorValidacion(error) {
  error.validacion = true;
  return error;
}

async function bloquearCuenta(client, idCuenta) {
  const { rows } = await client.query(
    'SELECT id_cuenta, id_grupo_mesa, estado FROM public.cuentas WHERE id_cuenta = $1 FOR UPDATE',
    [idCuenta]
  );
  return rows[0] || null;
}

async function bloquearParticipante(client, idCuenta, idSubcuenta) {
  const { rows } = await client.query(
    'SELECT id_subcuenta, id_cuenta, nombre, estado FROM public.subcuentas WHERE id_cuenta = $1 AND id_subcuenta = $2 FOR UPDATE',
    [idCuenta, idSubcuenta]
  );
  return rows[0] || null;
}

// Consultar un resumen mas todas las asignaciones y los importes no repartidos.
// La vista v_distribucion_cuenta NO incluye los pagos ya cubiertos en personas
// dentro de disponible_para_asignar; los reserva hasta completar la venta.
async function listarSubcuentas(req, res) {
  let idCuenta;
  try { idCuenta = idPositivo(req.params.id, 'Cuenta'); }
  catch (error) { return res.status(400).json({ ok: false, message: error.message }); }
  if (!validarCajero(req)) return res.status(403).json({ ok: false, message: 'Solo el cajero puede consultar cuentas divididas.' });
  try {
    const { rows: cuentas } = await cajeroPool.query(
      'SELECT id_cuenta, id_grupo_mesa, estado FROM public.cuentas WHERE id_cuenta = $1', [idCuenta]
    );
    if (!cuentas.length) return res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' });
    const [participantes, asignaciones, productos] = await Promise.all([
      cajeroPool.query(`
        SELECT id_subcuenta, id_cuenta, nombre, estado, creada_at,
               total_asignado, total_pagado, total_pendiente
          FROM public.v_subcuentas_resumen
         WHERE id_cuenta = $1 ORDER BY id_subcuenta`, [idCuenta]),
      cajeroPool.query(`
        SELECT sd.id_subcuenta_detalle, sd.id_subcuenta, sd.id_detalle_producto,
               sd.monto_asignado, sd.cantidad_asignada, sd.creada_at,
               COALESCE(SUM(dpg.monto) FILTER (WHERE pg.estado_pago = 'pagado'), 0)::NUMERIC(12,2) AS monto_pagado,
               (sd.monto_asignado - COALESCE(SUM(dpg.monto) FILTER (WHERE pg.estado_pago = 'pagado'), 0))::NUMERIC(12,2) AS monto_pendiente
          FROM public.subcuenta_detalle sd
          JOIN public.subcuentas s ON s.id_subcuenta = sd.id_subcuenta
          LEFT JOIN public.pagos pg ON pg.id_subcuenta = sd.id_subcuenta
                                  AND pg.estado_pago = 'pagado'
          LEFT JOIN public.detalle_pago dpg ON dpg.id_pago = pg.id_pago
                                          AND dpg.id_detalle_producto = sd.id_detalle_producto
         WHERE s.id_cuenta = $1
         GROUP BY sd.id_subcuenta_detalle
         ORDER BY sd.id_subcuenta, sd.id_detalle_producto`, [idCuenta]),
      cajeroPool.query(`
        SELECT d.id_detalle_producto, d.id_pedido, d.cantidad, d.precio_unitario,
               d.subtotal, d.pagado_sin_subcuenta, d.total_asignado,
               d.disponible_para_asignar, p.estado AS estado_pedido,
               COALESCE(pl.nombre, be.nombre, 'Producto') AS nombre
          FROM public.v_distribucion_cuenta d
          JOIN public.detalle_producto dp ON dp.id_detalle_producto = d.id_detalle_producto
          JOIN public.pedidos p ON p.id_pedido = dp.id_pedido
          LEFT JOIN public.platos pl ON pl.id_plato = dp.id_plato
          LEFT JOIN public.bebidas be ON be.id_bebida = dp.id_bebida
         WHERE d.id_cuenta = $1 ORDER BY d.id_detalle_producto`, [idCuenta]),
    ]);
    return res.json({
      ok: true,
      data: {
        cuenta: cuentas[0],
        subcuentas: participantes.rows.map(p => ({
          ...p, detalles: asignaciones.rows.filter(d => Number(d.id_subcuenta) === Number(p.id_subcuenta)),
        })),
        productos: productos.rows,
      },
    });
  } catch (error) { return enviarError(res, error); }
}

async function crearSubcuenta(req, res) {
  const idCajero = validarCajero(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo el cajero puede crear participantes.' });
  let idCuenta, nombre;
  try {
    idCuenta = idPositivo(req.params.id, 'Cuenta');
    nombre = nombreValido(cuerpoValido(req.body).nombre);
  } catch (error) { return enviarError(res, errorValidacion(error)); }

  const client = await cajeroPool.connect().catch(error => {
    console.error('No se pudo conectar a PostgreSQL:', error);
    return null;
  });
  if (!client) return res.status(503).json({ ok: false, message: 'La base de datos no esta disponible.' });
  try {
    await client.query('BEGIN');
    const cuenta = await bloquearCuenta(client, idCuenta);
    if (!cuenta) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' }); }
    if (cuenta.estado !== 'pendiente') { await client.query('ROLLBACK'); return res.status(409).json({ ok: false, message: 'La cuenta ya no permite dividirse.' }); }
    const { rows } = await client.query(`
      INSERT INTO public.subcuentas (id_cuenta, nombre, id_creada_por)
      VALUES ($1, $2, $3)
      RETURNING id_subcuenta, id_cuenta, nombre, estado, creada_at
    `, [idCuenta, nombre, idCajero]);
    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Participante creado.', data: rows[0] });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return enviarError(res, error);
  } finally { client.release(); }
}

async function asignarProducto(req, res) {
  const idCajero = validarCajero(req);
  if (!idCajero) return res.status(403).json({ ok: false, message: 'Solo el cajero puede asignar productos.' });
  let idCuenta, idSubcuenta, idDetalle, monto, cantidad;
  try {
    idCuenta = idPositivo(req.params.id, 'Cuenta');
    idSubcuenta = idPositivo(req.params.idSubcuenta, 'Participante');
    const body = cuerpoValido(req.body);
    idDetalle = idPositivo(body.id_detalle_producto, 'Producto');
    monto = importeValido(body.monto_asignado);
    cantidad = cantidadValida(body.cantidad_asignada);
  } catch (error) { return enviarError(res, errorValidacion(error)); }

  let client;
  try {
    client = await cajeroPool.connect();
    await client.query('BEGIN');
    const cuenta = await bloquearCuenta(client, idCuenta);
    if (!cuenta) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' }); }
    const persona = await bloquearParticipante(client, idCuenta, idSubcuenta);
    if (!persona) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Participante no encontrado en esta cuenta.' }); }
    if (cuenta.estado !== 'pendiente' || persona.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'La cuenta o la persona ya no admite asignaciones.' });
    }
    // No agregar asignaciones mientras hay pagos: evita reinterpretar un
    // importe ya facturado, incluso si el trigger permite nuevos INSERT.
    const pagado = await client.query(`
      SELECT EXISTS(SELECT 1 FROM public.pagos
                    WHERE id_subcuenta = $1 AND estado_pago IN ('pendiente','pagado')) AS tiene_pagos
    `, [idSubcuenta]);
    if (pagado.rows[0]?.tiene_pagos) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'No se agregan productos a una persona que ya recibio pagos.' });
    }
    const { rows } = await client.query(`
      INSERT INTO public.subcuenta_detalle
        (id_subcuenta, id_detalle_producto, monto_asignado, cantidad_asignada)
      VALUES ($1, $2, $3, $4)
      RETURNING id_subcuenta_detalle, id_subcuenta, id_detalle_producto,
                monto_asignado, cantidad_asignada, creada_at
    `, [idSubcuenta, idDetalle, monto, cantidad]);
    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Importe asignado correctamente.', data: rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    return enviarError(res, error);
  } finally { if (client) client.release(); }
}

// Permite corregir una asignacion antes del primer pago de esa persona.
async function eliminarAsignacion(req, res) {
  if (!validarCajero(req)) return res.status(403).json({ ok: false, message: 'Solo el cajero puede corregir asignaciones.' });
  let idCuenta, idSubcuenta, idAsignacion;
  try {
    idCuenta = idPositivo(req.params.id, 'Cuenta');
    idSubcuenta = idPositivo(req.params.idSubcuenta, 'Participante');
    idAsignacion = idPositivo(req.params.idAsignacion, 'Asignacion');
  } catch (error) { return enviarError(res, errorValidacion(error)); }
  let client;
  try {
    client = await cajeroPool.connect();
    await client.query('BEGIN');
    const cuenta = await bloquearCuenta(client, idCuenta);
    if (!cuenta) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' }); }
    const persona = await bloquearParticipante(client, idCuenta, idSubcuenta);
    if (!persona) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Participante no encontrado.' }); }
    if (cuenta.estado !== 'pendiente' || persona.estado !== 'pendiente') {
      await client.query('ROLLBACK'); return res.status(409).json({ ok: false, message: 'La cuenta ya no permite cambios.' });
    }
    const { rows } = await client.query(`
      DELETE FROM public.subcuenta_detalle
       WHERE id_subcuenta_detalle = $1 AND id_subcuenta = $2
      RETURNING id_subcuenta_detalle
    `, [idAsignacion, idSubcuenta]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, message: 'Asignacion no encontrada.' }); }
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Asignacion retirada.', data: rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    return enviarError(res, error);
  } finally { if (client) client.release(); }
}

module.exports = { listarSubcuentas, crearSubcuenta, asignarProducto, eliminarAsignacion };
