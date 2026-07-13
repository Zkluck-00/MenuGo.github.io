const { clientePool, meseroPool, cocinaPool } = require("../config/db");
const eventEmitter = require('../utils/eventEmitter');
const ESTADOS_VALIDOS = ["pendiente", "preparando", "listo", "entregado", "pagado", "cancelado"];
const ESTADOS_COCINA = ["preparando", "listo", "cancelado"];
const ESTADOS_MESERO = ["entregado", "pagado", "cancelado"];

function normalizarTexto(valor) {
  return String(valor || "").trim().toLowerCase();
}

function esBebida(item = {}) {
  const categoria = normalizarTexto(item.categoria || item.tipo || item.tipo_producto);
  const codigo = normalizarTexto(item.codigo_producto || item.id || item.id_producto);
  return categoria.includes("bebida") || categoria.includes("gaseosa") || codigo.startsWith("beb-") || codigo.startsWith("gas-");
}

function limpiarTelefono(valor) {
  const tel = String(valor || "").replace(/\D/g, "").slice(0, 9);
  return tel.length === 9 ? tel : "999999999";
}

function obtenerNombreCliente(body) {
  return body.nombre_cliente || body.cliente || body.nombre || (body.tipo_pedido === "mesa" ? `Mesa ${body.id_mesa || ""}` : "Cliente");
}

function mapMetodoPago(metodo) {
  const valor = normalizarTexto(metodo);
  if (valor.includes("yape")) return "yape";
  if (valor.includes("plin")) return "plin";
  if (valor.includes("debito") || valor.includes("debito")) return "tarjeta_debito";
  if (valor.includes("tarjeta")) return "tarjeta_credito";
  return "efectivo";
}

async function asegurarUsuario(client, body) {
  const telefono = limpiarTelefono(body.telefono || body.telefono_llevar || body.whatsapp);
  const whatsapp = body.whatsapp ? limpiarTelefono(body.whatsapp) : null;
  const nombre = obtenerNombreCliente(body);

  const existente = await client.query("SELECT id_usuario FROM usuarios WHERE telefono = $1 LIMIT 1", [telefono]);
  if (existente.rows.length > 0) {
    await client.query(
      `UPDATE usuarios
       SET nombre = COALESCE(NULLIF($1, ''), nombre), whatsapp = $2
       WHERE id_usuario = $3`,
      [nombre, whatsapp, existente.rows[0].id_usuario],
    );
    return existente.rows[0].id_usuario;
  }

  const nuevo = await client.query(
    `INSERT INTO usuarios (nombre, telefono, whatsapp, rol, activo)
     VALUES ($1, $2, $3, 'cliente', true)
     RETURNING id_usuario`,
    [nombre || `Cliente ${telefono}`, telefono, whatsapp],
  );
  return nuevo.rows[0].id_usuario;
}

async function asegurarMesa(client, numeroMesa) {
  const numero = Number(numeroMesa);
  if (!numero || numero < 1) return null;

  const existente = await client.query("SELECT id_mesa FROM mesas WHERE numero_mesa = $1 LIMIT 1", [numero]);
  if (existente.rows.length > 0) return existente.rows[0].id_mesa;

  const nuevo = await client.query(
    "INSERT INTO mesas (numero_mesa, activo) VALUES ($1, true) RETURNING id_mesa",
    [numero],
  );
  return nuevo.rows[0].id_mesa;
}


async function validarQrDeMesa(client, numeroMesa, token) {
  const numero = Number(numeroMesa);
  const qrToken = String(token || "").trim();

  if (!numero || !qrToken) {
    throw new Error("QR de mesa invalido. Escanea nuevamente el codigo de tu mesa.");
  }

  const { rows } = await client.query(
    `SELECT id_mesa
     FROM mesas
     WHERE numero_mesa = $1
       AND qr_token = $2
       AND activo = true
       AND COALESCE(qr_activo, true) = true
     LIMIT 1`,
    [numero, qrToken],
  );

  if (!rows.length) {
    throw new Error("El QR no corresponde a esta mesa o esta desactivado.");
  }

  return rows[0].id_mesa;
}

async function obtenerGrupoActivoPorMesa(client, numeroMesa) {
  const { rows } = await client.query(
    `SELECT gm.id_grupo_mesa, gm.nombre_grupo, gm.mesa_principal
     FROM grupos_mesa gm
     INNER JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
     INNER JOIN mesas m ON m.id_mesa = gmd.id_mesa
     WHERE gm.estado = 'activo' AND m.numero_mesa = $1
     ORDER BY gm.id_grupo_mesa DESC
     LIMIT 1`,
    [Number(numeroMesa)],
  );
  return rows[0] || null;
}

async function asegurarGrupoMesa(client, numeroMesa) {
  const grupoActivo = await obtenerGrupoActivoPorMesa(client, numeroMesa);
  if (grupoActivo) return grupoActivo.id_grupo_mesa;

  const idMesa = await asegurarMesa(client, numeroMesa);
  const nuevoGrupo = await client.query(
    `INSERT INTO grupos_mesa (nombre_grupo, mesa_principal, estado)
     VALUES ($1, $2, 'activo')
     RETURNING id_grupo_mesa`,
    [`Mesa ${numeroMesa}`, Number(numeroMesa)],
  );

  await client.query(
    `INSERT INTO grupo_mesa_detalle (id_grupo_mesa, id_mesa)
     VALUES ($1, $2)
     ON CONFLICT (id_grupo_mesa, id_mesa) DO NOTHING`,
    [nuevoGrupo.rows[0].id_grupo_mesa, idMesa],
  );

  return nuevoGrupo.rows[0].id_grupo_mesa;
}

async function crearCuentaSiNoExiste(client, idGrupoMesa) {
  if (!idGrupoMesa) return null;
  const existente = await client.query(
    `SELECT id_cuenta FROM cuentas WHERE id_grupo_mesa = $1 AND estado = 'pendiente' ORDER BY id_cuenta DESC LIMIT 1`,
    [idGrupoMesa],
  );
  if (existente.rows.length > 0) return existente.rows[0].id_cuenta;

  const nueva = await client.query(
    `INSERT INTO cuentas (id_grupo_mesa, descripcion, tipo_cuenta, total, estado)
     VALUES ($1, $2, 'mixta', 0, 'pendiente')
     RETURNING id_cuenta`,
    [idGrupoMesa, `Cuenta grupo ${idGrupoMesa}`],
  );
  return nueva.rows[0].id_cuenta;
}


async function asegurarTablaSolicitudesCuenta(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_cuenta (
      id_solicitud SERIAL PRIMARY KEY,
      id_grupo_mesa INTEGER NOT NULL REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE CASCADE,
      id_cuenta INTEGER REFERENCES cuentas(id_cuenta) ON DELETE SET NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      nota TEXT,
      fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atendido_at TIMESTAMP,
      CONSTRAINT chk_solicitud_estado CHECK (estado IN ('pendiente', 'atendida', 'cancelada'))
    )
  `);
}

async function asegurarTablaComentariosMesa(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS comentarios_mesa (
      id_comentario_mesa SERIAL PRIMARY KEY,
      id_mesa INTEGER REFERENCES mesas(id_mesa) ON DELETE SET NULL,
      numero_mesa INTEGER NOT NULL,
      id_grupo_mesa INTEGER REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE SET NULL,
      id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
      motivo VARCHAR(80) NOT NULL,
      detalle TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atendido_at TIMESTAMP,
      CONSTRAINT chk_comentario_mesa_estado CHECK (estado IN ('pendiente', 'atendido', 'cancelado'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_comentarios_mesa_pendientes ON comentarios_mesa(numero_mesa, estado, fecha_creacion DESC)`);
}

async function recalcularCuenta(client, idGrupoMesa) {
  if (!idGrupoMesa) return;
  await client.query(
    `UPDATE cuentas c
     SET total = COALESCE((
       SELECT SUM(dp.subtotal)
       FROM pedidos p
       INNER JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
       WHERE p.id_grupo_mesa = c.id_grupo_mesa
         AND p.estado <> 'cancelado'
     ), 0)
     WHERE c.id_grupo_mesa = $1 AND c.estado = 'pendiente'`,
    [idGrupoMesa],
  );
}

async function resolverProducto(client, item) {
  const codigo = String(item.codigo_producto || item.id || item.id_producto || "").trim();
  const tipo = item.tipo_producto || (esBebida(item) ? "bebida" : "plato");
  const nombre = item.nombre || "Producto sin nombre";
  const descripcion = [item.variante, item.opcion || item.comentario].filter(Boolean).join(" - ");
  const categoria = item.categoria || tipo;
  const precio = Number(item.precio || item.precio_unitario || 0);

  if (tipo === "bebida") {
    let producto = await client.query(
      `SELECT id_bebida AS id, precio, activo, 'bebida' AS tipo
       FROM bebidas
       WHERE codigo_bebida = $1 OR nombre = $2
       LIMIT 1`,
      [codigo, nombre],
    );

    if (producto.rows.length === 0) {
      producto = await client.query(
        `INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, activo)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id_bebida AS id, precio, activo, 'bebida' AS tipo`,
        [codigo || `beb-${Date.now()}`, nombre, descripcion, categoria, precio > 0 ? precio : 1],
      );
    }
    return producto.rows[0];
  }

  let producto = await client.query(
    `SELECT id_plato AS id, precio, activo, 'plato' AS tipo
     FROM platos
     WHERE codigo_plato = $1 OR nombre = $2
     LIMIT 1`,
    [codigo, nombre],
  );

  if (producto.rows.length === 0) {
    producto = await client.query(
      `INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, disponible_llevar, activo)
       VALUES ($1, $2, $3, $4, $5, true, true)
       RETURNING id_plato AS id, precio, activo, 'plato' AS tipo`,
      [codigo || `pla-${Date.now()}`, nombre, descripcion, categoria, precio > 0 ? precio : 1],
    );
  }
  return producto.rows[0];
}

async function registrarPagoInicialSiAplica(client, pedido, body, total) {
  const estadoPago = normalizarTexto(body.estadoPago || body.estado_pago || "");
  const metodoPago = body.metodoPago || body.metodo_pago;
  if (!metodoPago || estadoPago !== "pagado") return null;

  let idCuenta = null;
  if (pedido.id_grupo_mesa) {
    idCuenta = await crearCuentaSiNoExiste(client, pedido.id_grupo_mesa);
    await recalcularCuenta(client, pedido.id_grupo_mesa);
  } else {
    const grupo = await client.query(
      `INSERT INTO grupos_mesa (nombre_grupo, mesa_principal, estado)
       VALUES ($1, NULL, 'activo')
       RETURNING id_grupo_mesa`,
      [`Pedido para llevar ${pedido.id_pedido}`],
    );
    await client.query(
      `UPDATE pedidos SET id_grupo_mesa = $1 WHERE id_pedido = $2`,
      [grupo.rows[0].id_grupo_mesa, pedido.id_pedido],
    );
    const cuenta = await client.query(
      `INSERT INTO cuentas (id_grupo_mesa, descripcion, tipo_cuenta, total, estado)
       VALUES ($1, $2, 'mixta', $3, 'pendiente')
       RETURNING id_cuenta`,
      [grupo.rows[0].id_grupo_mesa, `Cuenta pedido llevar ${pedido.id_pedido}`, total],
    );
    idCuenta = cuenta.rows[0].id_cuenta;
  }

  const pago = await client.query(
    `INSERT INTO pagos (id_cuenta, metodo_pago, monto, pagado_por, estado_pago, referencia, tipo_pago, notas)
     VALUES ($1, $2, $3, $4, 'pagado', $5, 'total', $6)
     RETURNING id_pago`,
    [idCuenta, mapMetodoPago(metodoPago), total, body.nombre_cliente || body.cliente || "Cliente", body.referencia_pago || null, "Pago simulado registrado desde frontend"],
  );

  await client.query(
    `INSERT INTO detalle_pago (id_pago, id_detalle_producto, monto)
     SELECT $1, dp.id_detalle_producto, dp.subtotal
     FROM detalle_producto dp
     WHERE dp.id_pedido = $2
     ON CONFLICT DO NOTHING`,
    [pago.rows[0].id_pago, pedido.id_pedido],
  );

  await client.query(
    `INSERT INTO comprobantes (id_pago, tipo_comprobante, dni, ruc, razon_social)
     VALUES ($1, 'boleta', $2, NULL, NULL)
     ON CONFLICT (id_pago) DO NOTHING`,
    [pago.rows[0].id_pago, String(body.documento || "00000000").replace(/\D/g, "").padStart(8, "0").slice(0, 8)],
  );

  await client.query("UPDATE cuentas SET estado = 'pagada' WHERE id_cuenta = $1", [idCuenta]);

  return pago.rows[0].id_pago;
}

async function obtenerDetallePedido(clientOrPool, idPedido) {
  const { rows } = await clientOrPool.query(
    `SELECT dp.id_detalle_producto,
            dp.id_pedido,
            dp.tipo_producto,
            dp.id_plato,
            dp.id_bebida,
            COALESCE(pl.codigo_plato, be.codigo_bebida) AS codigo_producto,
            COALESCE(pl.nombre, be.nombre) AS nombre,
            COALESCE(pl.categoria, be.categoria) AS categoria,
            dp.cantidad,
            dp.precio_unitario,
            dp.subtotal,
            dp.observacion,
            sc.estado AS estado_cocina
     FROM detalle_producto dp
     LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
     LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
     LEFT JOIN seguimiento_cocina sc ON sc.id_detalle_producto = dp.id_detalle_producto
     WHERE dp.id_pedido = $1
     ORDER BY dp.id_detalle_producto ASC`,
    [idPedido],
  );

  return rows.map((row) => ({
    id_detalle_producto: row.id_detalle_producto,
    uid: String(row.id_detalle_producto),
    itemUid: String(row.id_detalle_producto),
    id: row.codigo_producto || row.id_plato || row.id_bebida,
    id_producto: row.codigo_producto || row.id_plato || row.id_bebida,
    tipo_producto: row.tipo_producto,
    nombre: row.nombre,
    categoria: row.categoria || row.tipo_producto,
    cantidad: Number(row.cantidad),
    precio: Number(row.precio_unitario),
    precio_unitario: Number(row.precio_unitario),
    subtotal: Number(row.subtotal),
    observacion: row.observacion,
    opcion: row.observacion,
    comentario: row.observacion,
    estado_cocina: row.estado_cocina,
    pagado: false,
    estadoPago: "Pendiente",
  }));
}

function codigoPedidoFrontend(row) {
  if (row.tipo_pedido === "llevar") {
    return row.codigo_llevar || `LLEV-${String(row.id_pedido).padStart(3, "0")}`;
  }
  return `PED-${row.id_pedido}`;
}

function estadoTextoFrontend(estado, tipoPedido) {
  const esLlevar = tipoPedido === "llevar";
  const map = {
    pendiente: esLlevar ? "Pendiente en cocina" : "Pendiente",
    preparando: "En preparación",
    listo: esLlevar ? "Listo para recoger" : "Listo para llevar a la mesa",
    entregado: esLlevar ? "Entregado al cliente" : "Entregado",
    pagado: "Pagado",
    cancelado: "Cancelado",
  };
  return map[estado] || estado;
}

async function mapPedido(clientOrPool, row) {
  const productos = await obtenerDetallePedido(clientOrPool, row.id_pedido);
  const mesas = row.mesas_unidas ? String(row.mesas_unidas).split(",").filter(Boolean).map((m) => `Mesa ${m}`) : [];
  const mesa = row.numero_mesa ? String(row.numero_mesa) : null;
  const tipoConsumo = row.tipo_pedido === "llevar" ? "Para llevar" : "Local";

  return {
    id: row.id_pedido,
    id_pedido: row.id_pedido,
    codigo: codigoPedidoFrontend(row),
    codigo_llevar: row.tipo_pedido === "llevar" ? codigoPedidoFrontend(row) : null,
    codigo_seguimiento: row.tipo_pedido === "llevar" ? codigoPedidoFrontend(row) : null,
    tipo_pedido: row.tipo_pedido,
    tipoConsumo,
    origen: row.registrado_por ? "Mesero" : "QR cliente",
    id_grupo_mesa: row.id_grupo_mesa,
    mesa: row.tipo_pedido === "mesa" ? (mesa || row.mesa_principal || "Sin mesa") : "No aplica",
    mesaPrincipal: row.mesa_principal ? `Mesa ${row.mesa_principal}` : undefined,
    mesasUnidas: mesas,
    grupoMesa: row.nombre_grupo || undefined,
    grupoMesaId: row.id_grupo_mesa || undefined,
    cliente: row.nombre_cliente,
    nombre_cliente: row.nombre_cliente,
    telefono: row.telefono || row.telefono_llevar,
    telefono_llevar: row.telefono_llevar,
    telefono_cliente: row.telefono_llevar || row.telefono,
    productos,
    items: productos,
    total: Number(row.total || productos.reduce((s, p) => s + p.subtotal, 0)),
    estado: estadoTextoFrontend(row.estado, row.tipo_pedido),
    estadoPedido: estadoTextoFrontend(row.estado, row.tipo_pedido),
    estado_db: row.estado,
    estado_seguimiento: row.estado,
    total_pagado: Number(row.total_pagado || 0),
    pago_completo: Number(row.total_pagado || 0) >= Number(row.total || productos.reduce((s, p) => s + p.subtotal, 0)),
    estadoPago: Number(row.total_pagado || 0) >= Number(row.total || productos.reduce((s, p) => s + p.subtotal, 0)) ? "Pagado" : "Pendiente",
    fecha: row.fecha_creacion ? new Date(row.fecha_creacion).toLocaleDateString("es-PE") : "",
    hora: row.fecha_creacion ? new Date(row.fecha_creacion).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "",
    fechaISO: row.fecha_creacion,
    vuelto_estimado: Number(row.vuelto_estimado || 0),
    monto_recibido: Number(row.monto_recibido || 0),
    metodoPago: row.metodopago || null,
  };
}

async function obtenerPedidoRows(pool, filtros = {}) {
  const params = [];
  const where = [];

  if (filtros.estados && filtros.estados.length > 0) {
    params.push(filtros.estados);
    where.push(`p.estado = ANY($${params.length})`);
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    where.push(`p.tipo_pedido = $${params.length}`);
  }

  if (filtros.idPedido) {
    params.push(Number(filtros.idPedido));
    where.push(`p.id_pedido = $${params.length}`);
  }

  if (filtros.idMesa) {
    params.push(Number(filtros.idMesa));
    where.push(`EXISTS (
      SELECT 1
      FROM grupo_mesa_detalle gmd2
      INNER JOIN mesas m2 ON m2.id_mesa = gmd2.id_mesa
      WHERE gmd2.id_grupo_mesa = p.id_grupo_mesa AND m2.numero_mesa = $${params.length}
    )`);
  }

  const sql = `
    SELECT p.*,
           CASE
             WHEN p.tipo_pedido = 'llevar' THEN 'LLEV-' || LPAD((
               SELECT COUNT(*)
               FROM pedidos px
               WHERE px.tipo_pedido = 'llevar'
                 AND px.id_pedido <= p.id_pedido
             )::text, 3, '0')
             ELSE NULL
           END AS codigo_llevar,
           u.telefono,
           gm.nombre_grupo,
           gm.mesa_principal,
           MIN(m.numero_mesa) AS numero_mesa,
           STRING_AGG(DISTINCT m.numero_mesa::text, ',' ORDER BY m.numero_mesa::text) AS mesas_unidas,
           COALESCE((
             SELECT SUM(dp2.subtotal)
             FROM detalle_producto dp2
             WHERE dp2.id_pedido = p.id_pedido
           ), 0) AS total,
           COALESCE((
             SELECT SUM(dpg.monto)
             FROM detalle_producto dp2
             INNER JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp2.id_detalle_producto
             INNER JOIN pagos pg ON pg.id_pago = dpg.id_pago
             WHERE dp2.id_pedido = p.id_pedido
               AND pg.estado_pago = 'pagado'
           ), 0) AS total_pagado
    FROM pedidos p
    INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
    LEFT JOIN grupos_mesa gm ON gm.id_grupo_mesa = p.id_grupo_mesa
    LEFT JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
    LEFT JOIN mesas m ON m.id_mesa = gmd.id_mesa
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY p.id_pedido, u.telefono, gm.nombre_grupo, gm.mesa_principal
    ORDER BY p.fecha_creacion DESC`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

async function listarPedidos(req, res) {
  try {
    const estado = req.query.estado ? String(req.query.estado).split(",").map((e) => normalizarTexto(e)) : [];
    const rol = normalizarTexto(req.query.rol);
    let estados = estado;

    if (rol === "cocina" && estados.length === 0) estados = ["pendiente", "preparando", "listo", "pagado"];
    if (rol === "mesero" && estados.length === 0) estados = ["listo", "entregado", "pagado"];

    const tipo = req.query.tipo ? normalizarTexto(req.query.tipo) : null;
    const rows = await obtenerPedidoRows(meseroPool, { estados, tipo });
    const data = [];
    for (const row of rows) data.push(await mapPedido(meseroPool, row));
    res.json({ ok: true, data });
  } catch (error) {
    console.error("Error al listar pedidos:", error);
    res.status(500).json({ ok: false, message: "Error al listar pedidos", error: error.message });
  }
}

async function obtenerPedidoPorId(req, res) {
  try {
    const rows = await obtenerPedidoRows(meseroPool, {});
    const row = rows.find((p) => Number(p.id_pedido) === Number(req.params.id));
    if (!row) return res.status(404).json({ ok: false, message: "Pedido no encontrado" });
    res.json({ ok: true, data: await mapPedido(meseroPool, row) });
  } catch (error) {
    console.error("Error al obtener pedido:", error);
    res.status(500).json({ ok: false, message: "Error al obtener pedido", error: error.message });
  }
}

async function obtenerEstadoPedido(req, res) {
  try {
    const { rows } = await meseroPool.query(
      `SELECT id_pedido, estado, fecha_creacion FROM pedidos WHERE id_pedido = $1`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, message: "Pedido no encontrado" });
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    console.error("Error al obtener estado:", error);
    res.status(500).json({ ok: false, message: "Error al obtener estado", error: error.message });
  }
}

async function crearPedido(req, res) {
  const client = await  (req.body.registrado_por ? meseroPool : clientePool).connect();
  try {
    const body = req.body || {};
    const tipoPedido = normalizarTexto(body.tipo_pedido || body.tipoConsumo || body.tipo || "mesa").includes("llevar") ? "llevar" : "mesa";
    const items = body.items || body.productos || [];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: "Debe enviar al menos un producto" });
    }

    if (tipoPedido === "mesa" && !body.id_mesa && !body.mesa) {
      return res.status(400).json({ ok: false, message: "id_mesa es obligatorio para pedidos en mesa" });
    }

    await client.query("BEGIN");
    const idUsuario = await asegurarUsuario(client, { ...body, tipo_pedido: tipoPedido });
    const numeroMesa = Number(body.id_mesa || String(body.mesa || "").match(/\d+/)?.[0] || 0);

    if (tipoPedido === "mesa" && !body.registrado_por) {
      await validarQrDeMesa(client, numeroMesa, body.qr_token || body.token_mesa || body.token);
    }

    let idGrupoMesa = tipoPedido === "mesa" ? await asegurarGrupoMesa(client, numeroMesa) : null;
    let idCuenta = idGrupoMesa ? await crearCuentaSiNoExiste(client, idGrupoMesa) : null;

    let total = 0;
    const productosResueltos = [];

    for (const item of items) {
      const producto = await resolverProducto(client, item);
      const cantidad = Number(item.cantidad || 1);
      const precioUnitario = Number(item.precio || item.precio_unitario || producto.precio);
      if (cantidad <= 0 || precioUnitario <= 0) throw new Error("Cantidad o precio invalido");  
      total += cantidad * precioUnitario;
      productosResueltos.push({ item, producto, cantidad, precioUnitario, subtotal: cantidad * precioUnitario });
    }

    const vueltoEstimado = Number(body.vuelto_estimado || 0);
    const montoRecibido = Number(body.monto_recibido || 0);

    const pedidoResult = await client.query(
      `INSERT INTO pedidos (id_grupo_mesa, id_usuario, tipo_pedido, nombre_cliente, telefono_llevar, estado, registrado_por, vuelto_estimado, monto_recibido, metodoPago)
       VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, $8, $9)
       RETURNING *`,
      [idGrupoMesa, idUsuario, tipoPedido, obtenerNombreCliente(body), tipoPedido === "llevar" ? limpiarTelefono(body.telefono || body.telefono_llevar) : null, body.registrado_por || null, vueltoEstimado, montoRecibido, body.metodoPago || null],
    );

    const pedido = pedidoResult.rows[0];

    if (tipoPedido === "llevar" && !idGrupoMesa) {
      const grupoLlevar = await client.query(
        `INSERT INTO grupos_mesa (nombre_grupo, mesa_principal, estado)
         VALUES ($1, NULL, 'activo')
         RETURNING id_grupo_mesa`,
        [`Pedido para llevar ${pedido.id_pedido}`],
      );
      idGrupoMesa = grupoLlevar.rows[0].id_grupo_mesa;
      await client.query("UPDATE pedidos SET id_grupo_mesa = $1 WHERE id_pedido = $2", [idGrupoMesa, pedido.id_pedido]);
      pedido.id_grupo_mesa = idGrupoMesa;
      idCuenta = await crearCuentaSiNoExiste(client, idGrupoMesa);
    }

    for (const pr of productosResueltos) {
      const observacion = [pr.item.variante, pr.item.opcion || pr.item.comentario || pr.item.observacion].filter(Boolean).join(" - ") || null;
      const detalle = await client.query(
        `INSERT INTO detalle_producto
          (id_pedido, tipo_producto, id_plato, id_bebida, cantidad, precio_unitario, subtotal, observacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_detalle_producto`,
        [
          pedido.id_pedido,
          pr.producto.tipo,
          pr.producto.tipo === "plato" ? pr.producto.id : null,
          pr.producto.tipo === "bebida" ? pr.producto.id : null,
          pr.cantidad,
          pr.precioUnitario,
          pr.subtotal,
          observacion,
        ],
      );

      await client.query(
        `INSERT INTO seguimiento_cocina (id_detalle_producto, estado)
         VALUES ($1, 'recibido')`,
        [detalle.rows[0].id_detalle_producto],
      );

    }

    if (idGrupoMesa) await recalcularCuenta(client, idGrupoMesa);
    await registrarPagoInicialSiAplica(client, pedido, body, total);

    await client.query("COMMIT");
eventEmitter.emitPedidoCreado(pedido);
    const poolUsado = req.body.registrado_por ? meseroPool : clientePool;
    const rows = await obtenerPedidoRows(poolUsado, {});
    const creado = rows.find((row) => Number(row.id_pedido) === Number(pedido.id_pedido));
    res.status(201).json({ ok: true, message: "Pedido registrado en BD", data: await mapPedido(poolUsado, creado) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear pedido:", error);
    res.status(400).json({ ok: false, message: "No se pudo crear el pedido", error: error.message });
  } finally {
    client.release();
  }
}


async function cerrarGrupoSiCompletado(client, idGrupoMesa) {
  if (!idGrupoMesa) return;

  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE p.estado NOT IN ('entregado', 'cancelado')) AS pedidos_pendientes,
       COUNT(*) FILTER (WHERE c.estado = 'pendiente') AS cuentas_pendientes
     FROM pedidos p
     FULL JOIN cuentas c ON c.id_grupo_mesa = p.id_grupo_mesa
     WHERE COALESCE(p.id_grupo_mesa, c.id_grupo_mesa) = $1`,
    [idGrupoMesa],
  );

  const pendientesPedido = Number(rows[0]?.pedidos_pendientes || 0);
  const pendientesCuenta = Number(rows[0]?.cuentas_pendientes || 0);
  if (pendientesPedido === 0 && pendientesCuenta === 0) {
    await client.query("UPDATE grupos_mesa SET estado = 'cerrado' WHERE id_grupo_mesa = $1", [idGrupoMesa]);
  }
}
async function actualizarEstadoPedido(req, res) {
  const client = await cocinaPool.connect();
  try {
    const estado = normalizarTexto(req.body.estado);
    const rol = normalizarTexto(req.body.rol || req.query.rol);

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, message: `Estado invalido. Usa: ${ESTADOS_VALIDOS.join(", ")}` });
    }
    if (rol === "cocina" && !ESTADOS_COCINA.includes(estado)) {
      return res.status(403).json({ ok: false, message: "Cocina solo puede cambiar a preparando, listo o cancelado" });
    }
    if (rol === "mesero" && !ESTADOS_MESERO.includes(estado)) {
      return res.status(403).json({ ok: false, message: "Mesero solo puede entregar, pagar o cancelar" });
    }

    await client.query("BEGIN");
    const pedido = await client.query("UPDATE pedidos SET estado = $1 WHERE id_pedido = $2 RETURNING *", [estado, req.params.id]);
    if (pedido.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Pedido no encontrado" });
    }

    if (estado === "preparando") {
      await client.query(
        `UPDATE seguimiento_cocina SET estado = 'preparando', preparando_at = COALESCE(preparando_at, CURRENT_TIMESTAMP)
         WHERE id_detalle_producto IN (SELECT id_detalle_producto FROM detalle_producto WHERE id_pedido = $1)`,
        [req.params.id],
      );
    }
    if (estado === "listo") {
      await client.query(
        `UPDATE seguimiento_cocina SET estado = 'listo', listo_at = COALESCE(listo_at, CURRENT_TIMESTAMP)
         WHERE id_detalle_producto IN (SELECT id_detalle_producto FROM detalle_producto WHERE id_pedido = $1)`,
        [req.params.id],
      );
    }
    if (estado === "entregado") {
      await client.query(
        `UPDATE seguimiento_cocina SET estado = 'entregado', entregado_at = COALESCE(entregado_at, CURRENT_TIMESTAMP)
         WHERE id_detalle_producto IN (SELECT id_detalle_producto FROM detalle_producto WHERE id_pedido = $1)`,
        [req.params.id],
      );
    }

    if (pedido.rows[0].id_grupo_mesa) {
      await recalcularCuenta(client, pedido.rows[0].id_grupo_mesa);
      if (estado === "entregado") await cerrarGrupoSiCompletado(client, pedido.rows[0].id_grupo_mesa);
    }
    await client.query("COMMIT");
const pedidoActualizado = pedido.rows[0];
eventEmitter.emitPedidoActualizado(pedidoActualizado);  
    res.json({ ok: true, message: "Estado actualizado correctamente", data: pedido.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar estado:", error);
    res.status(500).json({ ok: false, message: "Error al actualizar estado", error: error.message });
  } finally {
    client.release();
  }
}

async function obtenerPedidosMesa(req, res) {
  try {
    const rows = await obtenerPedidoRows(clientePool,{ idMesa: req.params.id_mesa, estados: ["pendiente", "preparando", "listo", "entregado"] });
    const data = [];
    for (const row of rows) data.push(await mapPedido(clientePool, row));
    res.json({ ok: true, data });
  } catch (error) {
    console.error("Error al obtener pedidos de mesa:", error);
    res.status(500).json({ ok: false, message: "Error al obtener pedidos de mesa", error: error.message });
  }
}

async function obtenerSeguimientoLlevar(req, res) {
  try {
    const codigo = String(req.params.codigo || req.query.codigo || "").trim().toUpperCase();
    const match = codigo.match(/(\d+)/);
    if (!match) {
      return res.status(400).json({ ok: false, message: "Codigo de seguimiento invalido" });
    }

    const numeroCodigo = Number(match[1]);
    const pedidoCodigo = await clientePool.query(
      `WITH pedidos_llevar AS (
         SELECT id_pedido, ROW_NUMBER() OVER (ORDER BY id_pedido ASC) AS numero_llevar
         FROM pedidos
         WHERE tipo_pedido = 'llevar'
       )
       SELECT id_pedido
       FROM pedidos_llevar
       WHERE numero_llevar = $1
       LIMIT 1`,
      [numeroCodigo],
    );

    const idPedido = pedidoCodigo.rows[0]?.id_pedido || numeroCodigo;
    const rows = await obtenerPedidoRows(clientePool, { idPedido, tipo: "llevar" });
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "No encontramos un pedido para llevar con ese codigo" });
    }

    const pedido = await mapPedido(clientePool, rows[0]);
    res.json({ ok: true, data: pedido });
  } catch (error) {
    console.error("Error al obtener seguimiento para llevar:", error);
    res.status(500).json({ ok: false, message: "Error al obtener seguimiento del pedido", error: error.message });
  }
}

async function solicitarCuenta(req, res) {
  const client = await clientePool.connect();
  try {
    const numeroMesa = Number(req.params.id_mesa || req.body.id_mesa);
    const token = String(req.body.qr_token || req.body.token || "").trim();

    if (!numeroMesa) {
      return res.status(400).json({ ok: false, message: "Numero de mesa invalido" });
    }

    await client.query("BEGIN");
    await asegurarTablaSolicitudesCuenta(client);

    if (token) {
      await validarQrDeMesa(client, numeroMesa, token);
    }

    const grupoExistente = await obtenerGrupoActivoPorMesa(client, numeroMesa);
    if (!grupoExistente) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "No hay pedidos activos para esta mesa" });
    }

    const pedidosActivos = await client.query(
      `SELECT p.id_pedido, p.estado
       FROM pedidos p
       WHERE p.id_grupo_mesa = $1
         AND p.estado IN ('pendiente', 'preparando', 'listo', 'entregado')
         AND EXISTS (
           SELECT 1
           FROM detalle_producto dp
           WHERE dp.id_pedido = p.id_pedido
             AND (dp.subtotal - COALESCE((
               SELECT SUM(dpg.monto)
               FROM detalle_pago dpg
               INNER JOIN pagos pg ON pg.id_pago = dpg.id_pago
               WHERE dpg.id_detalle_producto = dp.id_detalle_producto
                 AND pg.estado_pago = 'pagado'
             ), 0)) > 0
         )
       ORDER BY p.id_pedido ASC`,
      [grupoExistente.id_grupo_mesa],
    );

    if (!pedidosActivos.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "No hay pedidos pendientes de pago para solicitar cuenta" });
    }

    const pedidosNoEntregados = pedidosActivos.rows.filter((pedido) => pedido.estado !== "entregado");
    if (pedidosNoEntregados.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        message: "Aun no puedes solicitar cuenta. Primero el mesero debe entregar todos los pedidos de la mesa.",
        data: { pedidos_no_entregados: pedidosNoEntregados.map((pedido) => pedido.id_pedido) },
      });
    }

    const idGrupoMesa = grupoExistente.id_grupo_mesa;
    const cuenta = await crearCuentaSiNoExiste(client, idGrupoMesa);
    const notaSolicitud = req.body.nota || "Cliente solicita cuenta desde seguimiento";

    const solicitudPendiente = await client.query(
      `SELECT *
       FROM solicitudes_cuenta
       WHERE id_grupo_mesa = $1
         AND estado = 'pendiente'
       ORDER BY fecha_solicitud DESC, id_solicitud DESC
       LIMIT 1`,
      [idGrupoMesa],
    );

    const solicitud = solicitudPendiente.rows.length
      ? solicitudPendiente
      : await client.query(
          `INSERT INTO solicitudes_cuenta (id_grupo_mesa, id_cuenta, estado, nota)
           VALUES ($1, $2, 'pendiente', $3)
           RETURNING *`,
          [idGrupoMesa, cuenta, notaSolicitud],
        );

    await client.query("COMMIT");
    eventEmitter.emitCuentaActualizada({ id_grupo_mesa: idGrupoMesa, id_cuenta: cuenta, tipo: "solicitud_cuenta", numero_mesa: numeroMesa, solicitud: solicitud.rows[0] });
    eventEmitter.emitMesaActualizada({ numero_mesa: numeroMesa, tipo: "solicitud_cuenta", solicitud: solicitud.rows[0] });
    res.json({ ok: true, message: "Solicitud de cuenta registrada", data: solicitud.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al solicitar cuenta:", error);
    res.status(500).json({ ok: false, message: "Error al solicitar cuenta", error: error.message });
  } finally {
    client.release();
  }
}

async function enviarComentarioMesa(req, res) {
  const client = await clientePool.connect();
  try {
    const numeroMesa = Number(req.params.id_mesa || req.body.id_mesa || req.body.mesa);
    const motivo = String(req.body.motivo || "").trim();
    const detalle = String(req.body.detalle || req.body.comentario || "").trim();
    const token = String(req.body.qr_token || req.body.token || "").trim();
    const idPedido = req.body.id_pedido ? Number(req.body.id_pedido) : null;

    if (!numeroMesa) {
      return res.status(400).json({ ok: false, message: "Numero de mesa invalido" });
    }
    if (!motivo) {
      return res.status(400).json({ ok: false, message: "Selecciona el motivo del comentario" });
    }

    await client.query("BEGIN");
    await asegurarTablaComentariosMesa(client);

    if (token) {
      await validarQrDeMesa(client, numeroMesa, token);
    }

    const mesa = await client.query("SELECT id_mesa FROM mesas WHERE numero_mesa = $1 LIMIT 1", [numeroMesa]);
    if (!mesa.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Mesa no encontrada" });
    }

    const grupo = await obtenerGrupoActivoPorMesa(client, numeroMesa);
    const comentario = await client.query(
      `INSERT INTO comentarios_mesa (id_mesa, numero_mesa, id_grupo_mesa, id_pedido, motivo, detalle, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
       RETURNING id_comentario_mesa, numero_mesa, id_grupo_mesa, id_pedido, motivo, detalle, estado, fecha_creacion`,
      [mesa.rows[0].id_mesa, numeroMesa, grupo?.id_grupo_mesa || null, idPedido, motivo, detalle || null],
    );

    await client.query("COMMIT");
    eventEmitter.emitComentarioMesa(comentario.rows[0]);
    eventEmitter.emitMesaActualizada({ numero_mesa: numeroMesa, tipo: "comentario_cliente", comentario: comentario.rows[0] });
    res.json({ ok: true, message: "Comentario enviado al mesero", data: comentario.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al enviar comentario de mesa:", error);
    res.status(500).json({ ok: false, message: "Error al enviar comentario al mesero", error: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  crearPedido,
  listarPedidos,
  obtenerPedidoPorId,
  obtenerEstadoPedido,
  actualizarEstadoPedido,
  obtenerPedidosMesa,
  solicitarCuenta,
  obtenerSeguimientoLlevar,
  enviarComentarioMesa,
  obtenerPedidoRows,
  mapPedido,
  recalcularCuenta,
  mapMetodoPago,
};
