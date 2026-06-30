const { meseroPool } = require("../config/db");
const { recalcularCuenta } = require("./pedidos.controller");
const eventEmitter = require('../utils/eventEmitter');

async function asegurarTablaComentariosMesa() {
  await meseroPool.query(`
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
  await meseroPool.query(`CREATE INDEX IF NOT EXISTS idx_comentarios_mesa_pendientes ON comentarios_mesa(numero_mesa, estado, fecha_creacion DESC)`);
}

function mapearAlertaCliente(row) {
  if (!row.id_comentario_mesa) return null;
  return {
    id_comentario_mesa: row.id_comentario_mesa,
    motivo: row.comentario_motivo,
    detalle: row.comentario_detalle || "",
    estado: row.comentario_estado || "pendiente",
    fecha_creacion: row.comentario_fecha,
  };
}

async function asegurarTablaSolicitudesCuentaMesa() {
  await meseroPool.query(`
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
  await meseroPool.query(`CREATE INDEX IF NOT EXISTS idx_solicitudes_cuenta_pendientes ON solicitudes_cuenta(id_grupo_mesa, estado, fecha_solicitud DESC)`);
}

function mapearSolicitudCuenta(row) {
  if (!row.id_solicitud_cuenta) return null;
  return {
    id_solicitud: row.id_solicitud_cuenta,
    id_cuenta: row.solicitud_id_cuenta || null,
    estado: row.solicitud_estado || "pendiente",
    nota: row.solicitud_nota || "El cliente solicita la cuenta",
    fecha_solicitud: row.solicitud_fecha,
    motivo: "Solicitud de cuenta",
    detalle: row.solicitud_nota || "El cliente solicita que el mesero se acerque para cobrar la cuenta.",
  };
}

async function asegurarMesa(client, numero) {
  const n = Number(numero);
  const existente = await client.query("SELECT id_mesa FROM mesas WHERE numero_mesa = $1", [n]);
  if (existente.rows.length) return existente.rows[0].id_mesa;
  const nueva = await client.query("INSERT INTO mesas (numero_mesa, activo) VALUES ($1, true) RETURNING id_mesa", [n]);
  return nueva.rows[0].id_mesa;
}

async function listarMesas(req, res) {
  try {
    await asegurarTablaComentariosMesa();
    await asegurarTablaSolicitudesCuentaMesa();
    const { rows } = await meseroPool.query(`
      SELECT 
        m.id_mesa,
        m.numero_mesa,
        m.activo,
        gm.id_grupo_mesa,
        gm.nombre_grupo,
        gm.mesa_principal,
        COALESCE((
          SELECT COUNT(gmd2.id_mesa)
          FROM grupo_mesa_detalle gmd2
          WHERE gmd2.id_grupo_mesa = gm.id_grupo_mesa
        ), 0) as mesas_en_grupo,
        COALESCE(SUM(CASE 
          WHEN p.estado IN ('pendiente','preparando','listo','entregado') 
          AND (dp.subtotal - COALESCE((
            SELECT SUM(dpg.monto)
            FROM detalle_pago dpg
            INNER JOIN pagos pg ON pg.id_pago = dpg.id_pago
            WHERE dpg.id_detalle_producto = dp.id_detalle_producto
            AND pg.estado_pago = 'pagado'
          ), 0) > 0)
          THEN 1 ELSE 0 END), 0) AS pedidos_activos,
        COALESCE(SUM(CASE 
          WHEN p.estado IN ('pendiente','preparando','listo','entregado')
          THEN (dp.subtotal - COALESCE((
            SELECT SUM(dpg.monto)
            FROM detalle_pago dpg
            INNER JOIN pagos pg ON pg.id_pago = dpg.id_pago
            WHERE dpg.id_detalle_producto = dp.id_detalle_producto
            AND pg.estado_pago = 'pagado'
          ), 0))
          ELSE 0 END), 0) AS total_pendiente,
        COALESCE(SUM(CASE 
          WHEN p.estado IN ('pendiente','preparando','listo','entregado')
          THEN COALESCE((
            SELECT SUM(dpg.monto)
            FROM detalle_pago dpg
            INNER JOIN pagos pg ON pg.id_pago = dpg.id_pago
            WHERE dpg.id_detalle_producto = dp.id_detalle_producto
            AND pg.estado_pago = 'pagado'
          ), 0)
          ELSE 0 END), 0) AS total_pagado,
        cm.id_comentario_mesa,
        cm.motivo AS comentario_motivo,
        cm.detalle AS comentario_detalle,
        cm.estado AS comentario_estado,
        cm.fecha_creacion AS comentario_fecha,
        sc.id_solicitud AS id_solicitud_cuenta,
        sc.id_cuenta AS solicitud_id_cuenta,
        sc.estado AS solicitud_estado,
        sc.nota AS solicitud_nota,
        sc.fecha_solicitud AS solicitud_fecha
      FROM mesas m
      LEFT JOIN grupo_mesa_detalle gmd ON gmd.id_mesa = m.id_mesa
      LEFT JOIN grupos_mesa gm ON gm.id_grupo_mesa = gmd.id_grupo_mesa AND gm.estado = 'activo'
      LEFT JOIN pedidos p ON p.id_grupo_mesa = gm.id_grupo_mesa AND p.estado IN ('pendiente', 'preparando', 'listo', 'entregado')
      LEFT JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
      LEFT JOIN LATERAL (
        SELECT id_comentario_mesa, motivo, detalle, estado, fecha_creacion
        FROM comentarios_mesa cm
        WHERE cm.numero_mesa = m.numero_mesa
          AND cm.estado = 'pendiente'
        ORDER BY cm.fecha_creacion DESC, cm.id_comentario_mesa DESC
        LIMIT 1
      ) cm ON true
      LEFT JOIN LATERAL (
        SELECT id_solicitud, id_cuenta, estado, nota, fecha_solicitud
        FROM solicitudes_cuenta sc
        WHERE sc.id_grupo_mesa = gm.id_grupo_mesa
          AND sc.estado = 'pendiente'
        ORDER BY sc.fecha_solicitud DESC, sc.id_solicitud DESC
        LIMIT 1
      ) sc ON true
      GROUP BY 
        m.id_mesa, 
        m.numero_mesa, 
        m.activo, 
        gm.id_grupo_mesa, 
        gm.nombre_grupo, 
        gm.mesa_principal,
        cm.id_comentario_mesa,
        cm.motivo,
        cm.detalle,
        cm.estado,
        cm.fecha_creacion,
        sc.id_solicitud,
        sc.id_cuenta,
        sc.estado,
        sc.nota,
        sc.fecha_solicitud
      ORDER BY m.numero_mesa ASC
    `);

    const mesaMap = new Map();
    
    for (const row of rows) {
      const numero = row.numero_mesa;
      
      if (!mesaMap.has(numero)) {
        mesaMap.set(numero, {
          id_mesa: row.id_mesa,
          numero_mesa: numero,
          activo: row.activo,
          id_grupo_mesa: null,
          nombre_grupo: null,
          mesa_principal: null,
          mesas_en_grupo: 0,
          pedidos_activos: 0,
          total_pendiente: 0,
          total_pagado: 0,
          tiene_grupo: false,
          alerta_cliente: mapearAlertaCliente(row),
          solicitud_cuenta: mapearSolicitudCuenta(row)
        });
      }
      
      const mesaActual = mesaMap.get(numero);
      if (!mesaActual.alerta_cliente && row.id_comentario_mesa) {
        mesaActual.alerta_cliente = mapearAlertaCliente(row);
      }
      if (!mesaActual.solicitud_cuenta && row.id_solicitud_cuenta) {
        mesaActual.solicitud_cuenta = mapearSolicitudCuenta(row);
      }
      
      if (row.id_grupo_mesa && Number(row.total_pendiente) > 0) {
        mesaActual.id_grupo_mesa = row.id_grupo_mesa;
        mesaActual.nombre_grupo = row.nombre_grupo;
        mesaActual.mesa_principal = row.mesa_principal;
        mesaActual.mesas_en_grupo = Number(row.mesas_en_grupo);
        mesaActual.pedidos_activos = Number(row.pedidos_activos);
        mesaActual.total_pendiente = Number(row.total_pendiente);
        mesaActual.total_pagado = Number(row.total_pagado);
        mesaActual.tiene_grupo = true;
      }
    }
    
    const data = Array.from(mesaMap.values()).map((row) => {
      let estado = "libre";
      const tienePendiente = row.total_pendiente > 0;
      const tienePagos = row.total_pagado > 0;
      const mesasEnGrupo = row.mesas_en_grupo;
      
      if (!row.activo) {
        estado = "limpieza";
      } else if (tienePendiente) {
        estado = "ocupada";
      } else if (tienePagos && !tienePendiente) {
        estado = "pagada";
      } else if (row.id_grupo_mesa && mesasEnGrupo > 1 && tienePendiente) {
        estado = "unida";
      }
      
      return {
        id_mesa: row.id_mesa,
        numero: row.numero_mesa,
        numero_mesa: row.numero_mesa,
        activo: row.activo,
        estado: estado,
        estadoManual: estado,
        grupoId: (row.id_grupo_mesa && mesasEnGrupo > 1) ? row.id_grupo_mesa : null,
        grupo_id: (row.id_grupo_mesa && mesasEnGrupo > 1) ? row.id_grupo_mesa : null,
        grupo: (row.id_grupo_mesa && mesasEnGrupo > 1) ? {
          id: row.id_grupo_mesa,
          nombre: row.nombre_grupo,
          mesaPrincipal: row.mesa_principal,
        } : null,
        nota: (row.nombre_grupo && mesasEnGrupo > 1) ? row.nombre_grupo : "",
        total: row.total_pendiente,
        pendiente: row.total_pendiente,
        pagado: row.total_pagado,
        alertaCliente: row.alerta_cliente,
        comentario_cliente: row.alerta_cliente,
        solicitudCuenta: row.solicitud_cuenta,
        solicitud_cuenta: row.solicitud_cuenta,
      };
    });

    res.json({ ok: true, data, total: data.length });
  } catch (error) {
    console.error("Error al listar mesas:", error);
    res.status(500).json({ ok: false, message: "Error al listar mesas", error: error.message });
  }
}


function obtenerUrlClienteBase(req) {
  const configurada = process.env.FRONTEND_CLIENTE_URL || process.env.FRONTEND_BASE_URL;
  if (configurada) return configurada.replace(/\/+$/, "") + (configurada.endsWith("index.html") ? "" : "/Cliente/index.html");
  return `${req.protocol}://${req.get("host")}/Cliente/index.html`;
}

async function validarQrMesa(req, res) {
  try {
    const numeroMesa = Number(req.query.mesa || req.body.mesa || req.params.mesa);
    const token = String(req.query.token || req.body.token || req.body.qr_token || "").trim();

    if (!numeroMesa || !token) {
      return res.status(400).json({ ok: false, message: "Mesa y token son obligatorios" });
    }

    const { rows } = await meseroPool.query(
      `SELECT id_mesa, numero_mesa, activo
       FROM mesas
       WHERE numero_mesa = $1
         AND qr_token = $2
         AND activo = true
         AND COALESCE(qr_activo, true) = true
       LIMIT 1`,
      [numeroMesa, token],
    );

    if (!rows.length) {
      return res.status(403).json({ ok: false, message: "QR invalido o mesa no autorizada" });
    }

    return res.json({
      ok: true,
      message: "QR valido",
      data: {
        id_mesa: rows[0].id_mesa,
        numero_mesa: rows[0].numero_mesa,
      },
    });
  } catch (error) {
    console.error("Error al validar QR de mesa:", error);
    return res.status(500).json({ ok: false, message: "Error al validar QR de mesa", error: error.message });
  }
}

async function listarQrMesas(req, res) {
  try {
    const { rows } = await meseroPool.query(
      `SELECT numero_mesa, qr_token, COALESCE(qr_activo, true) AS qr_activo
       FROM mesas
       WHERE qr_token IS NOT NULL
       ORDER BY numero_mesa ASC`,
    );
    const base = obtenerUrlClienteBase(req);
    const data = rows.map((row) => ({
      numero_mesa: row.numero_mesa,
      qr_token: row.qr_token,
      qr_activo: row.qr_activo,
      url_qr: `${base}?mesa=${encodeURIComponent(row.numero_mesa)}&token=${encodeURIComponent(row.qr_token)}`,
    }));
    return res.json({ ok: true, data, total: data.length });
  } catch (error) {
    console.error("Error al listar QR de mesas:", error);
    return res.status(500).json({ ok: false, message: "Error al listar QR de mesas", error: error.message });
  }
}

async function cambiarEstadoMesa(req, res) {
  try {
    const { id } = req.params;
    const activo = req.body.activo;
    if (typeof activo !== "boolean") return res.status(400).json({ ok: false, message: "Debe enviar activo true/false" });
    const { rows } = await meseroPool.query("UPDATE mesas SET activo = $1 WHERE numero_mesa = $2 OR id_mesa = $2 RETURNING *", [activo, id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Mesa no encontrada" });
    res.json({ ok: true, message: `Mesa ${activo ? "activada" : "desactivada"}`, data: rows[0] });
  } catch (error) {
    console.error("Error al cambiar estado de mesa:", error);
    res.status(500).json({ ok: false, message: "Error al cambiar estado de mesa", error: error.message });
  }
}

async function unirMesas(req, res) {
  const client = await meseroPool.connect();
  try {
    const mesaPrincipal = Number(req.body.mesa_principal);
    const mesasAUnir = (req.body.mesas_a_unir || req.body.mesas || []).map(Number).filter(Boolean);
    const mesas = Array.from(new Set([mesaPrincipal, ...mesasAUnir])).filter(Boolean).sort((a, b) => a - b);

    if (!mesaPrincipal || mesas.length < 2) {
      return res.status(400).json({ ok: false, message: "Debe enviar mesa_principal y al menos una mesa secundaria" });
    }
    if (mesasAUnir.includes(mesaPrincipal)) {
      return res.status(400).json({ ok: false, message: "Una mesa no puede unirse consigo misma" });
    }

    await client.query("BEGIN");

    const ocupadas = await client.query(
      `SELECT m.numero_mesa, gm.id_grupo_mesa, gm.nombre_grupo
       FROM mesas m
       INNER JOIN grupo_mesa_detalle gmd ON gmd.id_mesa = m.id_mesa
       INNER JOIN grupos_mesa gm ON gm.id_grupo_mesa = gmd.id_grupo_mesa
       WHERE gm.estado = 'activo' AND m.numero_mesa = ANY($1::int[])`,
      [mesas],
    );
    if (ocupadas.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: `Mesa(s) ya unidas: ${ocupadas.rows.map((m) => m.numero_mesa).join(", ")}` });
    }

    const nombre = req.body.nombre_grupo || `Grupo Mesa ${mesas.join(" + ")}`;
    const grupo = await client.query(
      `INSERT INTO grupos_mesa (nombre_grupo, mesa_principal, estado)
       VALUES ($1, $2, 'activo')
       RETURNING *`,
      [nombre, mesaPrincipal],
    );
    const idGrupoMesa = grupo.rows[0].id_grupo_mesa;

    for (const numero of mesas) {
      const idMesa = await asegurarMesa(client, numero);
      await client.query(
        `INSERT INTO grupo_mesa_detalle (id_grupo_mesa, id_mesa)
         VALUES ($1, $2)
         ON CONFLICT (id_grupo_mesa, id_mesa) DO NOTHING`,
        [idGrupoMesa, idMesa],
      );
    }

    const gruposAnteriores = await client.query(
      `SELECT DISTINCT p.id_grupo_mesa
       FROM pedidos p
       INNER JOIN grupos_mesa gm ON gm.id_grupo_mesa = p.id_grupo_mesa
       INNER JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
       INNER JOIN mesas m ON m.id_mesa = gmd.id_mesa
       WHERE p.estado IN ('pendiente','preparando','listo','entregado')
         AND m.numero_mesa = ANY($1::int[])`,
      [mesas],
    );

    await client.query(
      `UPDATE pedidos p
       SET id_grupo_mesa = $1
       WHERE p.estado IN ('pendiente','preparando','listo','entregado')
         AND EXISTS (
           SELECT 1
           FROM grupo_mesa_detalle gmd
           INNER JOIN mesas m ON m.id_mesa = gmd.id_mesa
           WHERE gmd.id_grupo_mesa = p.id_grupo_mesa AND m.numero_mesa = ANY($2::int[])
         )`,
      [idGrupoMesa, mesas],
    );

    await client.query(
      `INSERT INTO cuentas (id_grupo_mesa, descripcion, tipo_cuenta, total, estado)
       VALUES ($1, $2, 'mixta', 0, 'pendiente')`,
      [idGrupoMesa, nombre],
    );
    await recalcularCuenta(client, idGrupoMesa);

    for (const row of gruposAnteriores.rows) {
      if (row.id_grupo_mesa && Number(row.id_grupo_mesa) !== Number(idGrupoMesa)) {
        await client.query("UPDATE grupos_mesa SET estado = 'cerrado' WHERE id_grupo_mesa = $1", [row.id_grupo_mesa]);
      }
    }

    await client.query("COMMIT");
    eventEmitter.emitMesaActualizada({ id_grupo_mesa: idGrupoMesa, mesas });
    res.json({ ok: true, message: `${nombre} creado correctamente`, data: { ...grupo.rows[0], mesas } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al unir mesas:", error);
    res.status(400).json({ ok: false, message: "Error al unir mesas", error: error.message });
  } finally {
    client.release();
  }
}

async function desunirMesas(req, res) {
  const client = await meseroPool.connect();
  try {
    const idOrPrincipal = req.params.mesa_principal;
    await client.query("BEGIN");
    const grupo = await client.query(
      `UPDATE grupos_mesa
       SET estado = 'cerrado'
       WHERE estado = 'activo' AND (id_grupo_mesa::text = $1 OR mesa_principal::text = $1)
       RETURNING *`,
      [String(idOrPrincipal)],
    );
    if (!grupo.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Union no encontrada" });
    }
    await client.query("COMMIT");
    res.json({ ok: true, message: "Mesas desunidas correctamente", data: grupo.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al desunir mesas:", error);
    res.status(400).json({ ok: false, message: "Error al desunir mesas", error: error.message });
  } finally {
    client.release();
  }
}

async function getInfoMesas(req, res) {
  try {
    const { rows } = await meseroPool.query(
      `SELECT gm.id_grupo_mesa AS id,
              gm.nombre_grupo AS nombre,
              gm.mesa_principal,
              gm.estado,
              gm.fecha_creacion,
              ARRAY_AGG(m.numero_mesa ORDER BY m.numero_mesa) AS mesas
       FROM grupos_mesa gm
       INNER JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
       INNER JOIN mesas m ON m.id_mesa = gmd.id_mesa
       WHERE gm.estado = 'activo'
       GROUP BY gm.id_grupo_mesa
       ORDER BY gm.fecha_creacion DESC`,
    );

    res.json({ ok: true, data: rows, total_uniones: rows.length });
  } catch (error) {
    console.error("Error al obtener uniones:", error);
    res.status(500).json({ ok: false, message: "Error al obtener uniones", error: error.message });
  }
}


async function atenderComentarioMesa(req, res) {
  try {
    await asegurarTablaComentariosMesa();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Comentario invalido" });

    const { rows } = await meseroPool.query(
      `UPDATE comentarios_mesa
       SET estado = 'atendido', atendido_at = CURRENT_TIMESTAMP
       WHERE id_comentario_mesa = $1
       RETURNING *`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Comentario no encontrado" });

    eventEmitter.emitMesaActualizada({ numero_mesa: rows[0].numero_mesa, tipo: "comentario_atendido", comentario: rows[0] });
    res.json({ ok: true, message: "Comentario marcado como atendido", data: rows[0] });
  } catch (error) {
    console.error("Error al atender comentario de mesa:", error);
    res.status(500).json({ ok: false, message: "Error al atender comentario", error: error.message });
  }
}

async function atenderSolicitudCuenta(req, res) {
  try {
    await asegurarTablaSolicitudesCuentaMesa();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Solicitud de cuenta invalida" });

    const { rows } = await meseroPool.query(
      `UPDATE solicitudes_cuenta
       SET estado = 'atendida', atendido_at = CURRENT_TIMESTAMP
       WHERE id_solicitud = $1
       RETURNING id_solicitud, id_grupo_mesa, id_cuenta, estado, nota, fecha_solicitud, atendido_at`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Solicitud de cuenta no encontrada" });

    const mesa = await meseroPool.query(
      `SELECT m.numero_mesa
       FROM grupo_mesa_detalle gmd
       INNER JOIN mesas m ON m.id_mesa = gmd.id_mesa
       WHERE gmd.id_grupo_mesa = $1
       ORDER BY m.numero_mesa ASC
       LIMIT 1`,
      [rows[0].id_grupo_mesa],
    );
    const numeroMesa = mesa.rows[0]?.numero_mesa || null;

    eventEmitter.emitCuentaActualizada({ tipo: "solicitud_cuenta_atendida", solicitud: rows[0], numero_mesa: numeroMesa });
    eventEmitter.emitMesaActualizada({ numero_mesa: numeroMesa, tipo: "solicitud_cuenta_atendida", solicitud: rows[0] });
    res.json({ ok: true, message: "Solicitud de cuenta marcada como atendida", data: rows[0] });
  } catch (error) {
    console.error("Error al atender solicitud de cuenta:", error);
    res.status(500).json({ ok: false, message: "Error al atender solicitud de cuenta", error: error.message });
  }
}

module.exports = { listarMesas, validarQrMesa, listarQrMesas, cambiarEstadoMesa, unirMesas, desunirMesas, getInfoMesas, atenderComentarioMesa, atenderSolicitudCuenta };
