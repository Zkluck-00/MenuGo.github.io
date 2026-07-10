const { adminPool } = require("../config/db");
const bcrypt = require('bcryptjs');
const eventEmitter = require('../utils/eventEmitter');

function toNumber(value) {
  return Number(value || 0);
}

function fechaValidaISO(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''));
}

function ventasDetalleCTE(extraWhere = '') {
  return `
    WITH ventas_detalle AS (
      SELECT pg.id_pago,
             pg.fecha_pago,
             dp.id_pedido,
             dp.id_detalle_producto,
             COALESCE(pl.nombre, be.nombre, 'Producto') AS nombre_producto,
             dp.cantidad,
             dpg.monto
      FROM pagos pg
      INNER JOIN detalle_pago dpg ON dpg.id_pago = pg.id_pago
      INNER JOIN detalle_producto dp ON dp.id_detalle_producto = dpg.id_detalle_producto
      LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
      LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
      WHERE pg.estado_pago = 'pagado' ${extraWhere}

      UNION ALL

      SELECT pg.id_pago,
             pg.fecha_pago,
             dp.id_pedido,
             dp.id_detalle_producto,
             COALESCE(pl.nombre, be.nombre, 'Producto') AS nombre_producto,
             dp.cantidad,
             CASE
               WHEN cuenta_total.total_detalle > 0 THEN pg.monto * (dp.subtotal / cuenta_total.total_detalle)
               ELSE 0
             END AS monto
      FROM pagos pg
      INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
      INNER JOIN pedidos p ON p.id_grupo_mesa = c.id_grupo_mesa AND p.estado <> 'cancelado'
      INNER JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
      LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
      LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
      JOIN LATERAL (
        SELECT COALESCE(SUM(dp2.subtotal), 0) AS total_detalle
        FROM pedidos p2
        INNER JOIN detalle_producto dp2 ON dp2.id_pedido = p2.id_pedido
        WHERE p2.id_grupo_mesa = c.id_grupo_mesa
          AND p2.estado <> 'cancelado'
      ) cuenta_total ON true
      WHERE pg.estado_pago = 'pagado' ${extraWhere}
        AND NOT EXISTS (SELECT 1 FROM detalle_pago dpg2 WHERE dpg2.id_pago = pg.id_pago)
    )
  `;
}

function esCategoriaBebida(categoria, tipoProducto) {
  const valor = String(tipoProducto || categoria || '').trim().toLowerCase();
  return ['bebida', 'bebidas', 'gaseosa', 'gaseosas'].includes(valor);
}

function codigoProducto(prefix, nombre) {
  const slug = String(nombre || 'producto')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18) || 'producto';
  return `${prefix}-${slug}-${Date.now()}`;
}

function parseProductoId(id) {
  const valor = String(id || '').trim();
  if (!valor) return { tipo: null, id: null };
  
  const match = valor.match(/^(plato|bebida)-(\d+)$/i);
  if (match) {
    return { tipo: match[1].toLowerCase(), id: Number(match[2]) };
  }
  
  const soloNumero = Number(valor);
  if (Number.isInteger(soloNumero) && soloNumero > 0) {
    return { tipo: 'plato', id: soloNumero };
  }
  
  return { tipo: null, id: null, codigo: valor };
}
async function buscarProductoAdmin(valorId) {
  const valor = String(valorId || "").trim();

  if (!valor) return null;

  const parsed = parseProductoId(valor);

  if (parsed.tipo === "plato" && parsed.id) {
    const { rows } = await adminPool.query(
      `SELECT id_plato AS id_real,
              codigo_plato AS codigo_producto,
              'plato' AS tipo_producto
       FROM platos
       WHERE id_plato = $1
       LIMIT 1`,
      [parsed.id]
    );

    if (rows.length > 0) return rows[0];
  }

  if (parsed.tipo === "bebida" && parsed.id) {
    const { rows } = await adminPool.query(
      `SELECT id_bebida AS id_real,
              codigo_bebida AS codigo_producto,
              'bebida' AS tipo_producto
       FROM bebidas
       WHERE id_bebida = $1
       LIMIT 1`,
      [parsed.id]
    );

    if (rows.length > 0) return rows[0];
  }

  if (/^\d+$/.test(valor)) {
    const plato = await adminPool.query(
      `SELECT id_plato AS id_real,
              codigo_plato AS codigo_producto,
              'plato' AS tipo_producto
       FROM platos
       WHERE id_plato = $1
       LIMIT 1`,
      [Number(valor)]
    );

    if (plato.rows.length > 0) return plato.rows[0];

    const bebida = await adminPool.query(
      `SELECT id_bebida AS id_real,
              codigo_bebida AS codigo_producto,
              'bebida' AS tipo_producto
       FROM bebidas
       WHERE id_bebida = $1
       LIMIT 1`,
      [Number(valor)]
    );

    if (bebida.rows.length > 0) return bebida.rows[0];
  }

  const platoPorCodigo = await adminPool.query(
    `SELECT id_plato AS id_real,
            codigo_plato AS codigo_producto,
            'plato' AS tipo_producto
     FROM platos
     WHERE codigo_plato = $1
        OR codigo_plato LIKE $2
     LIMIT 1`,
    [valor, `${valor}%`]
  );

  if (platoPorCodigo.rows.length > 0) return platoPorCodigo.rows[0];

  const bebidaPorCodigo = await adminPool.query(
    `SELECT id_bebida AS id_real,
            codigo_bebida AS codigo_producto,
            'bebida' AS tipo_producto
     FROM bebidas
     WHERE codigo_bebida = $1
        OR codigo_bebida LIKE $2
     LIMIT 1`,
    [valor, `${valor}%`]
  );

  if (bebidaPorCodigo.rows.length > 0) return bebidaPorCodigo.rows[0];

  return null;
}

function emitirProductoActualizado(producto) {
  if (typeof eventEmitter.emitProductoActualizado === "function") {
    eventEmitter.emitProductoActualizado(producto);
  } else {
    eventEmitter.emit("producto:actualizado", producto);
  }
}

function emitirProductoEliminado(producto) {
  if (typeof eventEmitter.emitProductoEliminado === "function") {
    eventEmitter.emitProductoEliminado(producto);
  } else {
    eventEmitter.emit("producto:eliminado", producto);
  }
}


async function passwordCoincide(claveIngresada, claveGuardada) {
  if (!claveGuardada) return false;
  const guardada = String(claveGuardada);
  if (guardada.startsWith('$2a$') || guardada.startsWith('$2b$') || guardada.startsWith('$2y$')) {
    return bcrypt.compare(String(claveIngresada || ''), guardada);
  }
  return String(claveIngresada || '') === guardada;
}


function estadoTrabajadorActivo(valor) {
  return valor === true || valor === 'true' || String(valor || '').toLowerCase() === 'activo';
}

function normalizarRolAcceso(rol) {
  const valor = String(rol || '').trim().toLowerCase();
  if (['mesero', 'mozo', 'camarero'].includes(valor)) return 'mesero';
  if (['cocina', 'cocinero', 'cocinera', 'chef'].includes(valor)) return 'cocina';
  if (['admin', 'administrador', 'administradora'].includes(valor)) return 'administrador';
  return valor;
}

function inicioPorRol(rol) {
  const normalizado = normalizarRolAcceso(rol);
  if (normalizado === 'mesero') return 'mesas.html';
  if (normalizado === 'cocina') return 'pedidos.html';
  if (normalizado === 'administrador') return 'dashboard.html';
  return 'login.html';
}

function nombreCompletoTrabajador(row) {
  return `${row.nombres || ''} ${row.apellidos || ''}`.trim() || row.correo || row.usuario_acceso || 'Trabajador';
}

async function health(req, res) {
  res.json({ ok: true, status: 'connected', timestamp: new Date().toISOString() });
}

async function login(req, res) {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).json({ ok: false, message: 'Usuario y clave son requeridos' });
  }

  try {
    const result = await adminPool.query(
      `SELECT idadministrador, usuario, clave, nombrecompleto, correo, estado
       FROM administrador
       WHERE LOWER(usuario) = LOWER($1) OR LOWER(correo) = LOWER($1)
       LIMIT 1`,
      [usuario]
    );

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      const claveOk = await passwordCoincide(clave, admin.clave);

      if (claveOk && admin.estado === true) {
        return res.json({
          ok: true,
          token: `temp-token-${Date.now()}`,
          message: 'Inicio de sesion exitoso',
          data: {
            id_administrador: admin.idadministrador,
            usuario: admin.usuario,
            nombre: admin.nombrecompleto,
            correo: admin.correo,
            rol: 'Administrador'
          }
        });
      }
    }

    // Tambien permite que un trabajador con rol Administrador ingrese al panel admin.
    const trabajador = await adminPool.query(
      `SELECT idtrabajador, nombres, apellidos, correo, rol, estado, usuario_acceso, clave_acceso
       FROM trabajador
       WHERE LOWER(COALESCE(correo, '')) = LOWER($1)
          OR LOWER(COALESCE(usuario_acceso, '')) = LOWER($1)
       LIMIT 1`,
      [usuario]
    );

    if (trabajador.rows.length > 0) {
      const row = trabajador.rows[0];
      const claveOk = await passwordCoincide(clave, row.clave_acceso);
      const rolOk = normalizarRolAcceso(row.rol) === 'administrador';
      if (claveOk && rolOk && estadoTrabajadorActivo(row.estado)) {
        return res.json({
          ok: true,
          token: `temp-token-${Date.now()}`,
          message: 'Inicio de sesion exitoso',
          data: {
            id_trabajador: row.idtrabajador,
            usuario: row.usuario_acceso || row.correo,
            nombre: nombreCompletoTrabajador(row),
            correo: row.correo,
            rol: 'Administrador'
          }
        });
      }
    }

    return res.status(401).json({ ok: false, message: 'Usuario o clave incorrectos' });
  } catch (error) {
    console.error('Error en login admin:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getDashboard(req, res) {
  try {
    const ventasHoy = await adminPool.query(`
      SELECT COALESCE(SUM(monto), 0) AS total,
             COUNT(id_pago) AS pagos,
             COALESCE(AVG(monto), 0) AS ticket_promedio
      FROM pagos
      WHERE estado_pago = 'pagado' AND DATE(fecha_pago) = CURRENT_DATE
    `);

    const pedidosHoy = await adminPool.query(`${ventasDetalleCTE('AND DATE(pg.fecha_pago) = CURRENT_DATE')}
      SELECT COUNT(DISTINCT id_pedido) AS pedidos
      FROM ventas_detalle
    `);

    const productoLider = await adminPool.query(`${ventasDetalleCTE('AND DATE(pg.fecha_pago) = CURRENT_DATE')}
      SELECT nombre_producto,
             SUM(cantidad) AS cantidad
      FROM ventas_detalle
      GROUP BY nombre_producto
      ORDER BY cantidad DESC
      LIMIT 1
    `);

    const pagos = toNumber(ventasHoy.rows[0]?.pagos);
    const pedidos = toNumber(pedidosHoy.rows[0]?.pedidos) || pagos;

    res.json({
      ok: true,
      data: {
        ventas_hoy: toNumber(ventasHoy.rows[0]?.total),
        pedidos_hoy: pedidos,
        ticket_promedio: toNumber(ventasHoy.rows[0]?.ticket_promedio),
        plato_lider: productoLider.rows[0]?.nombre_producto || 'Sin datos'
      }
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getGraficaVentas(req, res) {
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 60);

  try {
    const result = await adminPool.query(`
      SELECT DATE(fecha_pago)::text AS fecha,
             COALESCE(SUM(monto), 0) AS total
      FROM pagos
      WHERE estado_pago = 'pagado'
        AND fecha_pago >= CURRENT_DATE - (($1::int - 1) || ' days')::interval
      GROUP BY DATE(fecha_pago)
      ORDER BY fecha ASC
    `, [dias]);

    const mapa = new Map(result.rows.map((row) => [row.fecha, toNumber(row.total)]));
    const labels = [];
    const valores = [];
    const hoy = new Date();

    for (let i = dias - 1; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - i);
      const fechaStr = fecha.toISOString().slice(0, 10);
      labels.push(fechaStr.slice(5));
      valores.push(mapa.get(fechaStr) || 0);
    }

    res.json({ ok: true, labels, valores });
  } catch (error) {
    console.error('Error en grafica ventas:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getReporteVentas(req, res) {
  const { fecha } = req.query;
  if (!fechaValidaISO(fecha)) {
    return res.status(400).json({ ok: false, message: 'Fecha requerida en formato YYYY-MM-DD' });
  }

  try {
    const resumen = await adminPool.query(`
      SELECT COALESCE(SUM(monto), 0) AS total,
             COUNT(id_pago) AS pagos,
             COALESCE(AVG(monto), 0) AS ticket_promedio
      FROM pagos
      WHERE estado_pago = 'pagado' AND DATE(fecha_pago) = $1::date
    `, [fecha]);

    const pedidos = await adminPool.query(`${ventasDetalleCTE('AND DATE(pg.fecha_pago) = $1::date')}
      SELECT COUNT(DISTINCT id_pedido) AS pedidos
      FROM ventas_detalle
    `, [fecha]);

    const detalles = await adminPool.query(`${ventasDetalleCTE('AND DATE(pg.fecha_pago) = $1::date')}
      SELECT nombre_producto,
             SUM(cantidad) AS cantidad,
             SUM(monto) AS total
      FROM ventas_detalle
      GROUP BY nombre_producto
      ORDER BY cantidad DESC, total DESC
    `, [fecha]);

    const cantidadPagos = toNumber(resumen.rows[0]?.pagos);

    res.json({
      ok: true,
      fecha,
      total: toNumber(resumen.rows[0]?.total),
      pagos: cantidadPagos,
      pedidos: toNumber(pedidos.rows[0]?.pedidos) || cantidadPagos,
      ticket_promedio: toNumber(resumen.rows[0]?.ticket_promedio),
      detalles: detalles.rows.map((row) => ({
        nombre: row.nombre_producto,
        cantidad: toNumber(row.cantidad),
        total: toNumber(row.total)
      }))
    });
  } catch (error) {
    console.error('Error en reporte ventas:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getPlatosMasVendidos(req, res) {
  try {
    const { fecha_desde, fecha_hasta, dias } = req.query;
    
    let whereClause = '';
    const params = [];
    let paramIndex = 1;
    
    if (fecha_desde && fecha_hasta) {
      whereClause = `AND DATE(pg.fecha_pago) BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`;
      params.push(fecha_desde, fecha_hasta);
      paramIndex += 2;
    } else if (fecha_desde) {
      whereClause = `AND DATE(pg.fecha_pago) >= $${paramIndex}::date`;
      params.push(fecha_desde);
      paramIndex += 1;
    } else if (fecha_hasta) {
      whereClause = `AND DATE(pg.fecha_pago) <= $${paramIndex}::date`;
      params.push(fecha_hasta);
      paramIndex += 1;
    } else if (dias) {
      const diasNum = Math.min(Math.max(Number(dias) || 7, 1), 90);
      whereClause = `AND pg.fecha_pago >= CURRENT_DATE - ($${paramIndex}::int || ' days')::interval`;
      params.push(diasNum);
      paramIndex += 1;
    }
    
    const query = `
      WITH ventas_detalle AS (
        SELECT pg.id_pago,
               pg.fecha_pago,
               dp.id_pedido,
               dp.id_detalle_producto,
               COALESCE(pl.nombre, be.nombre, 'Producto') AS nombre_producto,
               dp.cantidad,
               dpg.monto
        FROM pagos pg
        INNER JOIN detalle_pago dpg ON dpg.id_pago = pg.id_pago
        INNER JOIN detalle_producto dp ON dp.id_detalle_producto = dpg.id_detalle_producto
        LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
        LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
        WHERE pg.estado_pago = 'pagado' ${whereClause}

        UNION ALL

        SELECT pg.id_pago,
               pg.fecha_pago,
               dp.id_pedido,
               dp.id_detalle_producto,
               COALESCE(pl.nombre, be.nombre, 'Producto') AS nombre_producto,
               dp.cantidad,
               CASE
                 WHEN cuenta_total.total_detalle > 0 THEN pg.monto * (dp.subtotal / cuenta_total.total_detalle)
                 ELSE 0
               END AS monto
        FROM pagos pg
        INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
        INNER JOIN pedidos p ON p.id_grupo_mesa = c.id_grupo_mesa AND p.estado <> 'cancelado'
        INNER JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
        LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
        LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
        JOIN LATERAL (
          SELECT COALESCE(SUM(dp2.subtotal), 0) AS total_detalle
          FROM pedidos p2
          INNER JOIN detalle_producto dp2 ON dp2.id_pedido = p2.id_pedido
          WHERE p2.id_grupo_mesa = c.id_grupo_mesa
            AND p2.estado <> 'cancelado'
        ) cuenta_total ON true
        WHERE pg.estado_pago = 'pagado' ${whereClause}
          AND NOT EXISTS (SELECT 1 FROM detalle_pago dpg2 WHERE dpg2.id_pago = pg.id_pago)
      )
      SELECT nombre_producto AS nombre,
             SUM(cantidad) AS cantidad,
             SUM(monto) AS total
      FROM ventas_detalle
      GROUP BY nombre_producto
      ORDER BY cantidad DESC, total DESC
      LIMIT 10
    `;
    
    const result = await adminPool.query(query, params);

    res.json({
      ok: true,
      data: result.rows.map((row) => ({
        nombre: row.nombre,
        cantidad: toNumber(row.cantidad),
        total: toNumber(row.total)
      }))
    });
  } catch (error) {
    console.error('Error en platos mas vendidos:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getProductos(req, res) {
  try {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
    });

    const result = await adminPool.query(`
      SELECT id_plato AS id_real,
             codigo_plato AS codigo_producto,
             'plato' AS tipo_producto,
             nombre,
             categoria,
             precio,
             descripcion,
             imagen,
             cantidad_de_platos AS stock,
             activo,
             disponible_llevar,
             (activo = true AND cantidad_de_platos > 0) AS disponible_local,
             (activo = true AND cantidad_de_platos > 0) AS disponible
      FROM platos

      UNION ALL

      SELECT id_bebida AS id_real,
             codigo_bebida AS codigo_producto,
             'bebida' AS tipo_producto,
             nombre,
             categoria,
             precio,
             descripcion,
             imagen,
             cantidad_de_bebidas AS stock,
             activo,
             true AS disponible_llevar,
             (activo = true AND cantidad_de_bebidas > 0) AS disponible_local,
             (activo = true AND cantidad_de_bebidas > 0) AS disponible
      FROM bebidas

      ORDER BY nombre ASC
    `);

    res.json({ ok: true, data: result.rows });
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function createProducto(req, res) {
  const body = req.body || {};
  const nombre = String(body.nombre || '').trim();
  const categoria = String(body.categoria || '').trim();
  const precio = Number(body.precio || 0);
  const descripcion = body.descripcion || null;
  const imagen = body.imagen || null;
  const disponibleLocal = body.disponible_local !== false && body.disponible !== false && body.en_menu_dia !== false;
  const disponibleLlevar = body.disponible_llevar !== false && body.para_llevar !== false;
  const stock = disponibleLocal ? Math.max(Number(body.stock || 100), 1) : 0;

  if (!nombre || !categoria || precio <= 0) {
    return res.status(400).json({ ok: false, message: 'Nombre, categoria y precio son obligatorios' });
  }

  if (!disponibleLocal && !disponibleLlevar) {
    return res.status(400).json({ ok: false, message: 'Selecciona al menos una disponibilidad: local o para llevar' });
  }

  try {
    const esBebida = esCategoriaBebida(categoria, body.tipo_producto);

    if (esBebida) {
      const result = await adminPool.query(
        `INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, cantidad_de_bebidas, activo, imagen)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)
         RETURNING id_bebida AS id_real,
                   codigo_bebida AS codigo_producto,
                   'bebida' AS tipo_producto,
                   nombre, categoria, precio, descripcion, imagen, cantidad_de_bebidas AS stock, activo,
                   true AS disponible_llevar,
                   (activo = true AND cantidad_de_bebidas > 0) AS disponible_local,
                   (activo = true AND cantidad_de_bebidas > 0) AS disponible`,
        [body.codigo_producto || codigoProducto('beb', nombre), nombre, descripcion, categoria, precio, stock, imagen]
      );

      const eventEmitter = require('../utils/eventEmitter');
      eventEmitter.emitNuevoProducto(result.rows[0]);
      return res.status(201).json({ ok: true, message: 'Producto creado', data: result.rows[0] });
    }

    const result = await adminPool.query(
      `INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, cantidad_de_platos, disponible_llevar, activo, imagen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
       RETURNING id_plato AS id_real,
                 codigo_plato AS codigo_producto,
                 'plato' AS tipo_producto,
                 nombre, categoria, precio, descripcion, imagen, cantidad_de_platos AS stock, activo,
                 disponible_llevar,
                 (activo = true AND cantidad_de_platos > 0) AS disponible_local,
                 (activo = true AND cantidad_de_platos > 0) AS disponible`,
      [body.codigo_producto || codigoProducto('pla', nombre), nombre, descripcion, categoria, precio, stock, disponibleLlevar, imagen]
    );

    const eventEmitter = require('../utils/eventEmitter');
    eventEmitter.emitNuevoProducto(result.rows[0]);

    res.status(201).json({ ok: true, message: 'Producto creado', data: result.rows[0] });
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function deleteProducto(req, res) {
  const valorId = String(req.params.id || '').trim();
  
  console.log('ID recibido en backend para eliminar:', valorId);
  
  if (!valorId) {
    return res.status(400).json({ ok: false, message: 'Producto invalido' });
  }

  try {
    let plato = await adminPool.query(
      `SELECT id_plato, codigo_plato FROM platos WHERE codigo_plato = $1 OR codigo_plato LIKE $2`,
      [valorId, `${valorId}%`]
    );
    
    if (plato.rows.length > 0) {
      await adminPool.query('UPDATE platos SET activo = false WHERE id_plato = $1', [plato.rows[0].id_plato]);
      
      const eventEmitter = require('../utils/eventEmitter');
      eventEmitter.emitProductoEliminado(plato.rows[0].codigo_plato);
      
      return res.json({ ok: true, message: 'Producto eliminado' });
    }
    
    let bebida = await adminPool.query(
      `SELECT id_bebida, codigo_bebida FROM bebidas WHERE codigo_bebida = $1 OR codigo_bebida LIKE $2`,
      [valorId, `${valorId}%`]
    );
    
    if (bebida.rows.length > 0) {
      await adminPool.query('UPDATE bebidas SET activo = false WHERE id_bebida = $1', [bebida.rows[0].id_bebida]);
      
      const eventEmitter = require('../utils/eventEmitter');
      eventEmitter.emitProductoEliminado(bebida.rows[0].codigo_bebida);
      
      return res.json({ ok: true, message: 'Producto eliminado' });
    }
    
    return res.status(404).json({ ok: false, message: 'Producto no encontrado' });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function actualizarDisponibilidadProducto(req, res) {
  const valorId = String(req.params.id || "").trim();
  const disponible =
    req.body?.disponible === true ||
    req.body?.disponible === "true" ||
    req.body?.disponible === 1 ||
    req.body?.disponible === "1";

  if (!valorId) {
    return res.status(400).json({
      ok: false,
      message: "Producto inválido",
    });
  }

  try {
    const producto = await buscarProductoAdmin(valorId);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado",
      });
    }

    if (producto.tipo_producto === "plato") {
      const { rows } = await adminPool.query(
        `UPDATE platos
         SET cantidad_de_platos = CASE
              WHEN $1 = true THEN GREATEST(cantidad_de_platos, 1)
              ELSE 0
             END,
             activo = true
         WHERE id_plato = $2
         RETURNING id_plato AS id_real,
                   codigo_plato AS codigo_producto,
                   'plato' AS tipo_producto,
                   nombre,
                   categoria,
                   precio,
                   descripcion,
                   imagen,
                   cantidad_de_platos AS stock,
                   activo,
                   disponible_llevar,
                   (activo = true AND cantidad_de_platos > 0) AS disponible_local,
                   (activo = true AND cantidad_de_platos > 0) AS disponible`,
        [disponible, producto.id_real]
      );

      emitirProductoActualizado(rows[0]);

      return res.json({
        ok: true,
        message: disponible
          ? "Producto visible para consumir en local"
          : "Producto retirado del consumo en local",
        data: rows[0],
      });
    }

    if (producto.tipo_producto === "bebida") {
      const { rows } = await adminPool.query(
        `UPDATE bebidas
         SET cantidad_de_bebidas = CASE
              WHEN $1 = true THEN GREATEST(cantidad_de_bebidas, 1)
              ELSE 0
             END,
             activo = true
         WHERE id_bebida = $2
         RETURNING id_bebida AS id_real,
                   codigo_bebida AS codigo_producto,
                   'bebida' AS tipo_producto,
                   nombre,
                   categoria,
                   precio,
                   descripcion,
                   imagen,
                   cantidad_de_bebidas AS stock,
                   activo,
                   true AS disponible_llevar,
                   (activo = true AND cantidad_de_bebidas > 0) AS disponible_local,
                   (activo = true AND cantidad_de_bebidas > 0) AS disponible`,
        [disponible, producto.id_real]
      );

      emitirProductoActualizado(rows[0]);

      return res.json({
        ok: true,
        message: disponible
          ? "Producto visible para consumir en local"
          : "Producto retirado del consumo en local",
        data: rows[0],
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Tipo de producto no válido",
    });
  } catch (error) {
    console.error("Error actualizando disponibilidad:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function actualizarDisponibleLlevarProducto(req, res) {
  const valorId = String(req.params.id || "").trim();
  const disponibleLlevar =
    req.body?.disponible_llevar === true ||
    req.body?.disponible_llevar === "true" ||
    req.body?.disponible_llevar === 1 ||
    req.body?.disponible_llevar === "1";

  if (!valorId) {
    return res.status(400).json({
      ok: false,
      message: "Producto inválido",
    });
  }

  try {
    const producto = await buscarProductoAdmin(valorId);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado",
      });
    }

    if (producto.tipo_producto === "plato") {
      const { rows } = await adminPool.query(
        `UPDATE platos
         SET disponible_llevar = $1,
             activo = CASE
               WHEN $1 = true THEN true
               ELSE activo
             END
         WHERE id_plato = $2
         RETURNING id_plato AS id_real,
                   codigo_plato AS codigo_producto,
                   'plato' AS tipo_producto,
                   nombre,
                   categoria,
                   precio,
                   descripcion,
                   imagen,
                   cantidad_de_platos AS stock,
                   activo,
                   disponible_llevar,
                   (activo = true AND cantidad_de_platos > 0) AS disponible_local,
                   (activo = true AND cantidad_de_platos > 0) AS disponible`,
        [disponibleLlevar, producto.id_real]
      );

      emitirProductoActualizado(rows[0]);

      return res.json({
        ok: true,
        message: disponibleLlevar
          ? "Producto visible para llevar"
          : "Producto retirado de pedidos para llevar",
        data: rows[0],
      });
    }

    if (producto.tipo_producto === "bebida") {
      return res.json({
        ok: true,
        message:
          "Las bebidas se controlan por stock y estado activo. No tienen columna disponible_llevar independiente.",
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Tipo de producto no válido",
    });
  } catch (error) {
    console.error("Error actualizando disponibilidad para llevar:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getMenuDia(req, res) {
  try {
    const result = await adminPool.query(`
      SELECT ('plato-' || id_plato::text) AS id_producto
      FROM platos
      WHERE activo = true AND cantidad_de_platos > 0
      UNION ALL
      SELECT ('bebida-' || id_bebida::text) AS id_producto
      FROM bebidas
      WHERE activo = true AND cantidad_de_bebidas > 0
    `);
    res.json({ ok: true, data: result.rows.map((row) => row.id_producto) });
  } catch (error) {
    console.error('Error obteniendo menu dia:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function addToMenuDia(req, res) {
  req.params.id = req.body?.id_producto;
  req.body.disponible = true;
  return actualizarDisponibilidadProducto(req, res);
}

async function removeFromMenuDia(req, res) {
  req.body.disponible = false;
  return actualizarDisponibilidadProducto(req, res);
}

async function getTrabajadores(req, res) {
  try {
    const result = await adminPool.query(`
      SELECT 
        idtrabajador,
        nombres,
        apellidos,
        documento,
        telefono,
        correo,
        rol,
        CASE
          WHEN LOWER(estado::text) IN ('true', 'activo') THEN 'Activo'
          WHEN LOWER(estado::text) = 'suspendido' THEN 'Suspendido'
          ELSE 'Inactivo'
        END AS estado,
        fechainiciocontrato,
        fechafincontrato,
        observaciones,
        usuario_acceso,
        clave_acceso IS NOT NULL AS tiene_credencial
      FROM trabajador
      ORDER BY idtrabajador DESC
    `);
    const rows = result.rows.map(r => ({
      ...r,
      fecha_inicio_contrato: r.fechainiciocontrato,
      fecha_fin_contrato: r.fechafincontrato
    }));
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error obteniendo trabajadores:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function createTrabajador(req, res) {
  const { nombres, apellidos, documento, telefono, correo, rol, estado, fecha_inicio_contrato, fecha_fin_contrato, observaciones, usuario_acceso, clave_acceso, password } = req.body;

  let estadoFinal = 'Inactivo';
  if (estado === 'Activo' || estado === true || estado === 'true' || estado === 1 || estado === '1') {
    estadoFinal = 'Activo';
  } else if (estado === 'Suspendido') {
    estadoFinal = 'Suspendido';
  }

  const correoFinal = String(correo || '').trim();
  const clavePlano = String(clave_acceso || password || '').trim();
  const usuarioFinal = String(usuario_acceso || correoFinal || '').trim();

  if (!correoFinal || !clavePlano) {
    return res.status(400).json({ ok: false, message: 'Correo y contrasena de acceso son obligatorios para crear credenciales.' });
  }

  try {
    const claveHash = await bcrypt.hash(clavePlano, 10);
    const result = await adminPool.query(
      `INSERT INTO trabajador (nombres, apellidos, documento, telefono, correo, rol, estado, fechainiciocontrato, fechafincontrato, observaciones, usuario_acceso, clave_acceso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING idtrabajador`,
      [nombres, apellidos, documento, telefono, correoFinal, rol, estadoFinal, fecha_inicio_contrato, fecha_fin_contrato || null, observaciones || null, usuarioFinal, claveHash]
    );
    res.status(201).json({ ok: true, message: 'Trabajador creado con credenciales de acceso', data: { idtrabajador: result.rows[0].idtrabajador } });
  } catch (error) {
    console.error('Error creando trabajador:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function updateTrabajador(req, res) {
  const { id } = req.params;
  const { nombres, apellidos, documento, telefono, correo, rol, estado, fecha_inicio_contrato, fecha_fin_contrato, observaciones, usuario_acceso, clave_acceso, password } = req.body;

  let estadoFinal = 'Inactivo';
  if (estado === 'Activo' || estado === true || estado === 'true' || estado === 1 || estado === '1') {
    estadoFinal = 'Activo';
  } else if (estado === 'Suspendido') {
    estadoFinal = 'Suspendido';
  }

  const correoFinal = String(correo || '').trim();
  const usuarioFinal = String(usuario_acceso || correoFinal || '').trim();
  const clavePlano = String(clave_acceso || password || '').trim();

  try {
    if (clavePlano) {
      const claveHash = await bcrypt.hash(clavePlano, 10);
      await adminPool.query(
        `UPDATE trabajador SET
          nombres = $1,
          apellidos = $2,
          documento = $3,
          telefono = $4,
          correo = $5,
          rol = $6,
          estado = $7,
          fechainiciocontrato = $8,
          fechafincontrato = $9,
          observaciones = $10,
          usuario_acceso = $11,
          clave_acceso = $12
         WHERE idtrabajador = $13`,
        [nombres, apellidos, documento, telefono, correoFinal, rol, estadoFinal, fecha_inicio_contrato, fecha_fin_contrato || null, observaciones || null, usuarioFinal, claveHash, id]
      );
    } else {
      await adminPool.query(
        `UPDATE trabajador SET
          nombres = $1,
          apellidos = $2,
          documento = $3,
          telefono = $4,
          correo = $5,
          rol = $6,
          estado = $7,
          fechainiciocontrato = $8,
          fechafincontrato = $9,
          observaciones = $10,
          usuario_acceso = $11
         WHERE idtrabajador = $12`,
        [nombres, apellidos, documento, telefono, correoFinal, rol, estadoFinal, fecha_inicio_contrato, fecha_fin_contrato || null, observaciones || null, usuarioFinal, id]
      );
    }
    res.json({ ok: true, message: 'Trabajador actualizado' });
  } catch (error) {
    console.error('Error actualizando trabajador:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function deleteTrabajador(req, res) {
  const { id } = req.params;
  try {
    await adminPool.query('DELETE FROM trabajador WHERE idtrabajador = $1', [id]);
    res.json({ ok: true, message: 'Trabajador eliminado' });
  } catch (error) {
    console.error('Error eliminando trabajador:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getReporteTrabajadores(req, res) {
  const { estado, fecha_desde, fecha_hasta } = req.query;
  let query = `SELECT idtrabajador, nombres, apellidos, documento, rol,
      CASE
        WHEN LOWER(estado::text) IN ('true', 'activo') THEN 'Activo'
        WHEN LOWER(estado::text) = 'suspendido' THEN 'Suspendido'
        ELSE 'Inactivo'
      END AS estado,
      fechainiciocontrato, fechafincontrato FROM trabajador WHERE 1=1`;
  const params = [];
  let idx = 1;

  if (estado && estado !== 'todos') {
    query += ` AND estado = $${idx++}`;
    params.push(estado);
  }
  if (fecha_desde) {
    query += ` AND fechainiciocontrato >= $${idx++}`;
    params.push(fecha_desde);
  }
  if (fecha_hasta) {
    query += ` AND fechainiciocontrato <= $${idx++}`;
    params.push(fecha_hasta);
  }
  query += ' ORDER BY idtrabajador DESC';

  try {
    const result = await adminPool.query(query, params);
    const rows = result.rows.map(r => ({
      ...r,
      fecha_inicio_contrato: r.fechainiciocontrato,
      fecha_fin_contrato: r.fechafincontrato
    }));
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error en reporte trabajadores:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function getTrabajadorById(req, res) {
  const { id } = req.params;
  try {
    const result = await adminPool.query(`
      SELECT 
        idtrabajador,
        nombres,
        apellidos,
        documento,
        telefono,
        correo,
        rol,
        CASE
          WHEN LOWER(estado::text) IN ('true', 'activo') THEN 'Activo'
          WHEN LOWER(estado::text) = 'suspendido' THEN 'Suspendido'
          ELSE 'Inactivo'
        END AS estado,
        fechainiciocontrato,
        fechafincontrato,
        observaciones,
        usuario_acceso,
        clave_acceso IS NOT NULL AS tiene_credencial
      FROM trabajador
      WHERE idtrabajador = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Trabajador no encontrado' });
    }

    const trabajador = result.rows[0];
    trabajador.fecha_inicio_contrato = trabajador.fechainiciocontrato;
    trabajador.fecha_fin_contrato = trabajador.fechafincontrato;

    res.json({ ok: true, data: trabajador });
  } catch (error) {
    console.error('Error obteniendo trabajador:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function loginPersonal(req, res) {
  const { usuario, clave, rol } = req.body || {};
  const rolSolicitado = normalizarRolAcceso(rol);

  if (!usuario || !clave) {
    return res.status(400).json({ ok: false, message: 'Correo y contrasena son requeridos' });
  }

  try {
    const result = await adminPool.query(
      `SELECT idtrabajador, nombres, apellidos, correo, rol, estado, usuario_acceso, clave_acceso
       FROM trabajador
       WHERE LOWER(COALESCE(correo, '')) = LOWER($1)
          OR LOWER(COALESCE(usuario_acceso, '')) = LOWER($1)
       LIMIT 1`,
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'Correo o contrasena incorrectos' });
    }

    const trabajador = result.rows[0];
    const rolTrabajador = normalizarRolAcceso(trabajador.rol);
    const claveOk = await passwordCoincide(clave, trabajador.clave_acceso);

    if (!claveOk || !estadoTrabajadorActivo(trabajador.estado)) {
      return res.status(401).json({ ok: false, message: 'Correo o contrasena incorrectos' });
    }

    if (rolSolicitado && rolTrabajador !== rolSolicitado) {
      return res.status(403).json({ ok: false, message: `Esta cuenta pertenece al rol ${trabajador.rol}, no al rol solicitado.` });
    }

    res.json({
      ok: true,
      token: `personal-token-${Date.now()}`,
      data: {
        id_trabajador: trabajador.idtrabajador,
        nombre: nombreCompletoTrabajador(trabajador),
        email: trabajador.correo || trabajador.usuario_acceso,
        rol: rolTrabajador === 'cocina' ? 'Cocina' : rolTrabajador === 'mesero' ? 'Mesero' : 'Administrador',
        inicio: inicioPorRol(rolTrabajador)
      }
    });
  } catch (error) {
    console.error('Error en login personal:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

module.exports = {
  health,
  login,
  getDashboard,
  getGraficaVentas,
  getReporteVentas,
  getPlatosMasVendidos,  
  getProductos,         
  createProducto,
  deleteProducto,
  actualizarDisponibilidadProducto,
  actualizarDisponibleLlevarProducto,
  getMenuDia,
  addToMenuDia,
  removeFromMenuDia,
  getTrabajadores,
  getTrabajadorById,
  createTrabajador,
  updateTrabajador,
  deleteTrabajador,
  getReporteTrabajadores,
  loginPersonal
};