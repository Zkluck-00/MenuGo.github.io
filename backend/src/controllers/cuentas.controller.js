const { meseroPool } = require("../config/db");
const { mapMetodoPago, recalcularCuenta } = require("./pedidos.controller");
const eventEmitter = require('../utils/eventEmitter');
function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
}

async function listarCuentasActivas(req, res) {
  try {
    const { rows } = await meseroPool.query(`
      SELECT c.id_cuenta,
             c.id_grupo_mesa,
             c.descripcion,
             c.tipo_cuenta,
             c.estado,
             gm.nombre_grupo,
             gm.mesa_principal,
             ARRAY_AGG(DISTINCT m.numero_mesa ORDER BY m.numero_mesa) AS mesas
      FROM cuentas c
      INNER JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
      LEFT JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
      LEFT JOIN mesas m ON m.id_mesa = gmd.id_mesa
      WHERE c.estado = 'pendiente'
      GROUP BY c.id_cuenta, gm.id_grupo_mesa
      ORDER BY c.id_cuenta DESC
    `);

    const data = [];
    for (const row of rows) {
      const detalles = await meseroPool.query(
        `SELECT dp.id_detalle_producto,
                dp.id_pedido,
                dp.tipo_producto,
                COALESCE(pl.nombre, be.nombre) AS nombre,
                COALESCE(pl.categoria, be.categoria) AS categoria,
                dp.cantidad,
                dp.precio_unitario,
                dp.subtotal,
                dp.observacion,
                p.estado AS estado_pedido,
                COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS monto_pagado
         FROM detalle_producto dp
         LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
         LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
         LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
         LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
         INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
         WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
         GROUP BY dp.id_detalle_producto, pl.nombre, pl.categoria, be.nombre, be.categoria, p.estado
         HAVING dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0
         ORDER BY dp.id_detalle_producto ASC`,
        [row.id_grupo_mesa],
      );

      if (detalles.rows.length === 0) continue;

      const totalPendiente = detalles.rows.reduce((sum, d) => sum + (Number(d.subtotal) - Number(d.monto_pagado)), 0);
      const totalPagado = detalles.rows.reduce((sum, d) => sum + Number(d.monto_pagado), 0);
      const total = totalPendiente + totalPagado;

      const pedidos = await meseroPool.query(
        `SELECT p.id_pedido, p.nombre_cliente, p.tipo_pedido, p.estado, p.fecha_creacion,
                COALESCE(SUM(dp.subtotal), 0) AS total,
                COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS pagado
         FROM pedidos p
         LEFT JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
         LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
         LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
         WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
         GROUP BY p.id_pedido
         HAVING COALESCE(SUM(dp.subtotal), 0) - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0
         ORDER BY p.fecha_creacion ASC`,
        [row.id_grupo_mesa],
      );

      data.push({
        id_cuenta: row.id_cuenta,
        id: String(row.id_cuenta),
        id_grupo_mesa: row.id_grupo_mesa,
        etiqueta: row.nombre_grupo || `Mesa ${row.mesa_principal}`,
        descripcion: row.descripcion,
        mesas: row.mesas || [],
        pedidos: pedidos.rows,
        detalles: detalles.rows.map((d) => ({
          ...d,
          precio: Number(d.precio_unitario),
          cantidad: Number(d.cantidad),
          subtotal: Number(d.subtotal),
          monto_pagado: Number(d.monto_pagado),
          pagado: Number(d.monto_pagado) >= Number(d.subtotal),
          estado_pedido: d.estado_pedido,
          puede_pagarse: d.estado_pedido === 'entregado'
        })),
        total: total,
        total_pagado: totalPagado,
        total_pendiente: totalPendiente,
        estado: row.estado,
      });
    }

    res.json({ ok: true, data });
  } catch (error) {
    console.error("Error al listar cuentas:", error);
    res.status(500).json({ ok: false, message: "Error al listar cuentas", error: error.message });
  }
}

async function registrarPago(req, res) {
  const client = await meseroPool.connect();
  try {
    const body = req.body || {};
    const idCuenta = Number(body.id_cuenta || body.cuenta_id);
    const metodo = mapMetodoPago(body.metodo_pago || body.metodoPago);
    const monto = Number(body.monto || body.total || 0);
    const detalles = body.detalles || body.items || [];
    const tipoComprobante = normalizar(body.tipo_comprobante || body.tipoComprobante || "boleta");

    if (!idCuenta || monto <= 0) {
      return res.status(400).json({ ok: false, message: "id_cuenta y monto son obligatorios" });
    }

    await client.query("BEGIN");
    const cuenta = await client.query("SELECT * FROM cuentas WHERE id_cuenta = $1 FOR UPDATE", [idCuenta]);
    if (!cuenta.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Cuenta no encontrada" });
    }

    if (detalles.length) {
      for (const detalle of detalles) {
        const idDetalle = Number(detalle.id_detalle_producto || detalle.id);
        const verificar = await client.query(
          `SELECT p.estado 
           FROM detalle_producto dp
           INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
           WHERE dp.id_detalle_producto = $1`,
          [idDetalle]
        );
        
        if (verificar.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ 
            ok: false, 
            message: "Producto no encontrado" 
          });
        }
        
        if (verificar.rows[0].estado !== 'entregado') {
          await client.query("ROLLBACK");
          return res.status(400).json({ 
            ok: false, 
            message: "No se puede pagar un producto que no ha sido entregado" 
          });
        }
      }
    } else {
      const pendientes = await client.query(
        `SELECT dp.id_detalle_producto,
                dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS pendiente,
                p.estado AS estado_pedido
         FROM detalle_producto dp
         INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
         LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
         LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
         WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
         GROUP BY dp.id_detalle_producto, dp.subtotal, p.estado
         HAVING dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0`,
        [cuenta.rows[0].id_grupo_mesa]
      );
      
      const noEntregados = pendientes.rows.filter(row => row.estado_pedido !== 'entregado');
      if (noEntregados.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          ok: false, 
          message: "No se puede pagar porque hay productos que no han sido entregados" 
        });
      }
    }

    const pago = await client.query(
      `INSERT INTO pagos (id_cuenta, metodo_pago, monto, pagado_por, estado_pago, referencia, tipo_pago, mesa_pagadora, notas)
       VALUES ($1, $2, $3, $4, 'pagado', $5, $6, $7, $8)
       RETURNING *`,
      [
        idCuenta,
        metodo,
        monto,
        body.pagado_por || body.cliente || "Cliente",
        body.referencia || body.codigo_aprobacion || null,
        detalles.length ? "parcial" : "total",
        body.mesa_pagadora || body.mesaPagadora || null,
        body.notas || "Pago registrado desde simulacion",
      ],
    );

    if (detalles.length) {
      for (const detalle of detalles) {
        await client.query(
          `INSERT INTO detalle_pago (id_pago, id_detalle_producto, monto)
           VALUES ($1, $2, $3)`,
          [pago.rows[0].id_pago, detalle.id_detalle_producto || detalle.id, Number(detalle.monto || detalle.subtotal || 0)],
        );
      }
    } else {
      const pendientes = await client.query(
        `SELECT dp.id_detalle_producto,
                dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS pendiente
         FROM detalle_producto dp
         INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
         LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
         LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
         WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
         GROUP BY dp.id_detalle_producto, dp.subtotal
         HAVING dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0`,
        [cuenta.rows[0].id_grupo_mesa],
      );
      for (const item of pendientes.rows) {
        await client.query(
          `INSERT INTO detalle_pago (id_pago, id_detalle_producto, monto)
           VALUES ($1, $2, $3)`,
          [pago.rows[0].id_pago, item.id_detalle_producto, item.pendiente],
        );
      }
    }

    if (tipoComprobante === "factura") {
      await client.query(
        `INSERT INTO comprobantes (id_pago, tipo_comprobante, dni, ruc, razon_social)
         VALUES ($1, 'factura', NULL, $2, $3)`,
        [pago.rows[0].id_pago, String(body.ruc || "00000000000").replace(/\D/g, "").padStart(11, "0").slice(0, 11), body.razon_social || body.nombre_comprobante || "Cliente"],
      );
    } else {
      await client.query(
        `INSERT INTO comprobantes (id_pago, tipo_comprobante, dni, ruc, razon_social)
         VALUES ($1, 'boleta', $2, NULL, NULL)`,
        [pago.rows[0].id_pago, String(body.dni || body.documento || "00000000").replace(/\D/g, "").padStart(8, "0").slice(0, 8)],
      );
    }

    const sumas = await client.query(
      `SELECT c.total, COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN pg.monto ELSE 0 END), 0) AS pagado
       FROM cuentas c
       LEFT JOIN pagos pg ON pg.id_cuenta = c.id_cuenta
       WHERE c.id_cuenta = $1
       GROUP BY c.id_cuenta`,
      [idCuenta],
    );

    if (sumas.rows.length && Number(sumas.rows[0].pagado) >= Number(sumas.rows[0].total)) {
      await client.query("UPDATE cuentas SET estado = 'pagada' WHERE id_cuenta = $1", [idCuenta]);
    }

    await client.query("COMMIT");
const pagoRegistrado = pago.rows[0];

eventEmitter.emitPagoRegistrado(pagoRegistrado);
eventEmitter.emitCuentaActualizada({ id_cuenta: idCuenta });

const cuentaCompleta = await client.query(
  `SELECT c.*, gm.nombre_grupo, gm.mesa_principal,
   ARRAY_AGG(DISTINCT m.numero_mesa ORDER BY m.numero_mesa) AS mesas
   FROM cuentas c
   INNER JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
   LEFT JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
   LEFT JOIN mesas m ON m.id_mesa = gmd.id_mesa
   WHERE c.id_cuenta = $1
   GROUP BY c.id_cuenta, gm.id_grupo_mesa`,
  [idCuenta]
);

if (cuentaCompleta.rows.length > 0) {
  eventEmitter.emitCuentaActualizada(cuentaCompleta.rows[0]);
}
    res.status(201).json({ ok: true, message: "Pago registrado en BD", data: pago.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al registrar pago:", error);
    res.status(400).json({ ok: false, message: "Error al registrar pago", error: error.message });
  } finally {
    client.release();
  }
}

async function listarPagos(req, res) {
  try {
    const { rows } = await meseroPool.query(`
      SELECT pg.*, c.id_grupo_mesa, co.tipo_comprobante, co.dni, co.ruc, co.razon_social
      FROM pagos pg
      INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
      LEFT JOIN comprobantes co ON co.id_pago = pg.id_pago
      ORDER BY pg.fecha_pago DESC
      LIMIT 200
    `);
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error("Error al listar pagos:", error);
    res.status(500).json({ ok: false, message: "Error al listar pagos", error: error.message });
  }
}

module.exports = { listarCuentasActivas, registrarPago, listarPagos };
