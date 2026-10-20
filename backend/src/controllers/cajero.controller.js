const { cajeroPool } = require('../config/db');
const { createHash } = require('node:crypto');
const { mapMetodoPago } = require('./pedidos.controller');
const eventEmitter = require('../utils/eventEmitter');

function normalizar(valor) {
  return String(valor || '').trim().toLowerCase();
}

function numero(valor) {
  return Number(valor || 0);
}

// El cajero solo puede registrar los metodos admitidos por la BD.
// La normalizacion admite las etiquetas que ya envia Frontend/js/caja.js.
const METODOS_CAJA = Object.freeze({
  efectivo: 'efectivo',
  yape: 'yape',
  plin: 'plin',
  'tarjeta credito': 'tarjeta_credito',
  'tarjeta de credito': 'tarjeta_credito',
  'tarjeta debito': 'tarjeta_debito',
  'tarjeta de debito': 'tarjeta_debito',
});

function validarMetodoPagoCaja(valor) {
  if (typeof valor !== 'string') {
    throw new Error('Debes seleccionar un metodo de pago valido.');
  }
  const clave = valor.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, ' ');
  const metodo = Object.prototype.hasOwnProperty.call(METODOS_CAJA, clave)
    ? METODOS_CAJA[clave]
    : null;
  if (!metodo) {
    throw new Error('Metodo de pago invalido. Elige efectivo, Yape, Plin, tarjeta de credito o tarjeta de debito.');
  }
  return metodo;
}

// La referencia es una constancia introducida por el cajero, NO una
// verificacion automatica con Yape, Plin o un procesador de tarjetas.
function validarReferenciaPagoCaja(body, metodo) {
  if (metodo === 'efectivo') return null;
  const valor = body.referencia ?? body.codigo_aprobacion;
  if (typeof valor !== 'string') {
    throw new Error('Los pagos digitales y con tarjeta requieren una referencia de operacion.');
  }
  const referencia = valor.trim();
  if (referencia.length < 3 || referencia.length > 100 || /[\u0000-\u001f\u007f]/.test(referencia)) {
    throw new Error('Ingresa una referencia de operacion valida (3 a 100 caracteres, sin saltos de linea).');
  }
  return referencia;
}

// Si el cliente envia una seleccion, no aceptamos una lista vacia ni IDs
// invalidos: eso impediria convertir por accidente el cobro en uno total.
function validarDetallesSolicitadosCaja(body) {
  const seleccion = body.detalles ?? body.items;
  if (seleccion === undefined) return [];
  if (!Array.isArray(seleccion) || seleccion.length === 0) {
    throw new Error('Selecciona al menos un producto para cobrar.');
  }
  const ids = seleccion.map((detalle) => Number(detalle?.id_detalle_producto ?? detalle?.id));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('La seleccion contiene identificadores de producto invalidos.');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('La seleccion contiene productos duplicados.');
  }
  return ids;
}

// Los importes de PostgreSQL son NUMERIC(12,2). Trabajamos en centavos
// enteros para evitar errores de coma flotante (ej. 0.1 + 0.2).
const MAX_CENTAVOS_PAGO_CAJA = 999999999999; // NUMERIC(12,2)

function centavosPagoCaja(valor, etiqueta) {
  if (typeof valor !== 'string' && typeof valor !== 'number') {
    throw new Error(`${etiqueta} debe ser un importe valido, con hasta dos decimales.`);
  }
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error(`${etiqueta} debe ser un importe valido, con hasta dos decimales.`);
  }
  const [unidades, decimales = ''] = texto.split('.');
  const total = Number(unidades) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(total) || total > MAX_CENTAVOS_PAGO_CAJA) {
    throw new Error(`${etiqueta} supera el importe maximo permitido.`);
  }
  return total;
}

function importePagoCaja(centavos) {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

// La cuenta y su monto se calculan con datos de PostgreSQL, no con los
// subtotales enviados por el navegador. El servidor decide el vuelto final.
function validarEfectivoRecibidoCaja(body, metodo, montoCentavos) {
  const recibido = body.monto_recibido ?? body.montoRecibido;
  if (metodo !== 'efectivo') {
    if (recibido !== null && recibido !== undefined) {
      throw new Error('El monto recibido solo corresponde a pagos en efectivo.');
    }
    return { monto_recibido: null, vuelto: '0.00' };
  }
  if (recibido === null || recibido === undefined || recibido === '') {
    throw new Error('Debes ingresar el efectivo recibido antes de registrar el cobro.');
  }
  const recibidoCentavos = centavosPagoCaja(recibido, 'El efectivo recibido');
  if (recibidoCentavos < montoCentavos) {
    throw new Error('El efectivo recibido no alcanza para cubrir el monto seleccionado.');
  }
  return {
    monto_recibido: importePagoCaja(recibidoCentavos),
    vuelto: importePagoCaja(recibidoCentavos - montoCentavos),
  };
}

let esquemaCajaListo = false;

async function asegurarEsquemaCaja(client = cajeroPool) {
  if (esquemaCajaListo) return;
  await client.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS id_cajero INTEGER REFERENCES trabajador(idtrabajador) ON DELETE SET NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pagos_id_cajero_fecha ON pagos(id_cajero, fecha_pago DESC)`);

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

  await client.query(`
    CREATE TABLE IF NOT EXISTS cierres_caja (
      id_cierre_caja SERIAL PRIMARY KEY,
      id_cajero INTEGER NOT NULL REFERENCES trabajador(idtrabajador) ON DELETE RESTRICT,
      fecha_desde TIMESTAMP NOT NULL,
      fecha_hasta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cantidad_pagos INTEGER NOT NULL DEFAULT 0,
      total_efectivo NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_yape NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_plin NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_tarjeta_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_tarjeta_debito NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_general NUMERIC(12,2) NOT NULL DEFAULT 0,
      observaciones TEXT,
      fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS cierre_caja_pagos (
      id_cierre_caja INTEGER NOT NULL REFERENCES cierres_caja(id_cierre_caja) ON DELETE CASCADE,
      id_pago INTEGER NOT NULL UNIQUE REFERENCES pagos(id_pago) ON DELETE RESTRICT,
      PRIMARY KEY (id_cierre_caja, id_pago)
    )
  `);
  esquemaCajaListo = true;
}

async function cargarCuentasPendientes(client = cajeroPool) {
  const { rows } = await client.query(`
    SELECT c.id_cuenta,
           c.id_grupo_mesa,
           c.descripcion,
           c.tipo_cuenta,
           c.estado,
           gm.nombre_grupo,
           gm.mesa_principal,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT m.numero_mesa ORDER BY m.numero_mesa), NULL) AS mesas,
           sc.id_solicitud,
           sc.nota AS solicitud_nota,
           sc.fecha_solicitud
    FROM cuentas c
    INNER JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
    LEFT JOIN grupo_mesa_detalle gmd ON gmd.id_grupo_mesa = gm.id_grupo_mesa
    LEFT JOIN mesas m ON m.id_mesa = gmd.id_mesa
    LEFT JOIN LATERAL (
      SELECT id_solicitud, nota, fecha_solicitud
      FROM solicitudes_cuenta
      WHERE id_grupo_mesa = c.id_grupo_mesa AND estado = 'pendiente'
      ORDER BY fecha_solicitud DESC, id_solicitud DESC
      LIMIT 1
    ) sc ON true
    WHERE c.estado = 'pendiente'
    GROUP BY c.id_cuenta, gm.id_grupo_mesa, sc.id_solicitud, sc.nota, sc.fecha_solicitud
    ORDER BY sc.fecha_solicitud DESC NULLS LAST, c.id_cuenta DESC
  `);

  const data = [];
  for (const row of rows) {
    const detalles = await client.query(
      `SELECT dp.id_detalle_producto,
              dp.id_pedido,
              dp.tipo_producto,
              COALESCE(pl.nombre, be.nombre) AS nombre,
              COALESCE(pl.categoria, be.categoria) AS categoria,
              dp.cantidad,
              dp.precio_unitario,
              dp.subtotal,
              dp.observacion,
              p.nombre_cliente,
              p.tipo_pedido,
              p.estado AS estado_pedido,
              COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS monto_pagado
       FROM detalle_producto dp
       INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
       LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
       LEFT JOIN bebidas be ON be.id_bebida = dp.id_bebida
       LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
       LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
       WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
       GROUP BY dp.id_detalle_producto, pl.nombre, pl.categoria, be.nombre, be.categoria,
                p.nombre_cliente, p.tipo_pedido, p.estado
       HAVING dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0
       ORDER BY dp.id_detalle_producto ASC`,
      [row.id_grupo_mesa]
    );

    if (!detalles.rows.length) continue;

    const detallesMap = detalles.rows.map((d) => {
      const pendiente = numero(d.subtotal) - numero(d.monto_pagado);
      const esLlevar = normalizar(d.tipo_pedido) === 'llevar';
      const puedePagarse = d.estado_pedido === 'entregado' || (esLlevar && d.estado_pedido === 'listo');
      return {
        ...d,
        cantidad: numero(d.cantidad),
        precio: numero(d.precio_unitario),
        subtotal: numero(d.subtotal),
        monto_pagado: numero(d.monto_pagado),
        monto_pendiente: pendiente,
        puede_pagarse: puedePagarse,
      };
    });

    const totalPendiente = detallesMap.reduce((s, d) => s + d.monto_pendiente, 0);
    const totalOriginal = await client.query(
      `SELECT COALESCE(SUM(dp.subtotal), 0) AS total
       FROM pedidos p
       INNER JOIN detalle_producto dp ON dp.id_pedido = p.id_pedido
       WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'`,
      [row.id_grupo_mesa]
    );
    const total = numero(totalOriginal.rows[0]?.total);
    const totalPagado = Math.max(total - totalPendiente, 0);
    const esLlevar = detallesMap.every((d) => normalizar(d.tipo_pedido) === 'llevar');

    data.push({
      id_cuenta: row.id_cuenta,
      id_grupo_mesa: row.id_grupo_mesa,
      etiqueta: row.nombre_grupo || (esLlevar ? `Pedido para llevar #${row.id_cuenta}` : `Mesa ${row.mesa_principal}`),
      descripcion: row.descripcion,
      tipo_cuenta: row.tipo_cuenta,
      mesas: row.mesas || [],
      es_llevar: esLlevar,
      detalles: detallesMap,
      total,
      total_pagado: totalPagado,
      total_pendiente: totalPendiente,
      lista_para_cobro: detallesMap.length > 0 && detallesMap.every((d) => d.puede_pagarse),
      solicitud_cuenta: row.id_solicitud ? {
        id_solicitud: row.id_solicitud,
        nota: row.solicitud_nota || 'Cliente solicita la cuenta',
        fecha_solicitud: row.fecha_solicitud,
      } : null,
    });
  }

  return data;
}

async function listarCuentas(req, res) {
  try {
    await asegurarEsquemaCaja();
    const data = await cargarCuentasPendientes();
    res.json({ ok: true, data, total: data.length });
  } catch (error) {
    console.error('Error al listar cuentas para caja:', error);
    res.status(500).json({ ok: false, message: 'Error al listar las cuentas de caja', error: error.message });
  }
}

async function resumenCaja(req, res) {
  try {
    await asegurarEsquemaCaja();
    const cuentas = await cargarCuentasPendientes();
    const idCajero = req.personal.id_trabajador;
    const pagos = await cajeroPool.query(
      `SELECT metodo_pago,
              COUNT(*)::int AS cantidad,
              COALESCE(SUM(monto), 0) AS total
       FROM pagos
       WHERE estado_pago = 'pagado'
         AND id_cajero = $1
         AND fecha_pago >= CURRENT_DATE
         AND fecha_pago < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY metodo_pago`,
      [idCajero]
    );

    const porMetodo = {};
    for (const row of pagos.rows) porMetodo[row.metodo_pago] = numero(row.total);
    const totalHoy = Object.values(porMetodo).reduce((s, n) => s + numero(n), 0);

    res.json({
      ok: true,
      data: {
        cuentas_pendientes: cuentas.length,
        cuentas_listas: cuentas.filter((c) => c.lista_para_cobro).length,
        solicitudes_cuenta: cuentas.filter((c) => c.solicitud_cuenta).length,
        monto_pendiente: cuentas.reduce((s, c) => s + numero(c.total_pendiente), 0),
        pagos_hoy_cajero: pagos.rows.reduce((s, r) => s + Number(r.cantidad || 0), 0),
        por_metodo: porMetodo,
        total_hoy_cajero: totalHoy,
      },
    });
  } catch (error) {
    console.error('Error en resumen de caja:', error);
    res.status(500).json({ ok: false, message: 'Error al cargar el resumen de caja', error: error.message });
  }
}

async function obtenerPendientesCuenta(client, idCuenta) {
  const cuenta = await client.query(`SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas WHERE id_cuenta = $1 FOR UPDATE`, [idCuenta]);
  if (!cuenta.rows.length) return { cuenta: null, detalles: [] };

  const detalles = await client.query(
    `SELECT dp.id_detalle_producto,
            dp.id_pedido,
            dp.subtotal,
            p.tipo_pedido,
            p.estado AS estado_pedido,
            dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS pendiente
     FROM detalle_producto dp
     INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
     LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
     LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
     WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
     GROUP BY dp.id_detalle_producto, p.tipo_pedido, p.estado
     HAVING dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) > 0
     ORDER BY dp.id_detalle_producto`,
    [cuenta.rows[0].id_grupo_mesa]
  );

  return { cuenta: cuenta.rows[0], detalles: detalles.rows };
}

function detallePuedePagarse(detalle) {
  if (detalle.estado_pedido === 'entregado') return true;
  return normalizar(detalle.tipo_pedido) === 'llevar' && detalle.estado_pedido === 'listo';
}

async function cerrarGrupoSiCorresponde(client, idGrupoMesa) {
  const pendientes = await client.query(
    `SELECT
       EXISTS(SELECT 1 FROM pedidos WHERE id_grupo_mesa = $1 AND estado NOT IN ('entregado', 'cancelado')) AS hay_pedidos_pendientes,
       EXISTS(SELECT 1 FROM cuentas WHERE id_grupo_mesa = $1 AND estado = 'pendiente') AS hay_cuentas_pendientes`,
    [idGrupoMesa]
  );
  const row = pendientes.rows[0] || {};
  if (!row.hay_pedidos_pendientes && !row.hay_cuentas_pendientes) {
    await client.query(`UPDATE grupos_mesa SET estado = 'cerrado' WHERE id_grupo_mesa = $1`, [idGrupoMesa]);
  }
}

function validarComprobante(body) {
  const tipo = normalizar(body.tipo_comprobante || 'boleta');
  if (!['boleta', 'factura'].includes(tipo)) throw new Error('Tipo de comprobante invalido.');

  if (tipo === 'factura') {
    const ruc = String(body.ruc || '').replace(/\D/g, '');
    const razon = String(body.razon_social || '').trim();
    if (ruc.length !== 11) throw new Error('Para factura debes ingresar un RUC de 11 digitos.');
    if (!razon) throw new Error('Para factura debes ingresar la razon social.');
    return { tipo, ruc, razon_social: razon, dni: null };
  }

  const dni = String(body.dni || body.documento || '').replace(/\D/g, '');
  if (dni.length !== 8) throw new Error('Para boleta debes ingresar un DNI de 8 digitos.');
  return { tipo, dni, ruc: null, razon_social: null };
}

// COMMIT 08: la clave identifica una operacion logica de pago, no cada clic.
// Se envia desde caja.js y debe cumplir la restriccion SQL del commit 07.
function validarClaveIdempotenciaCaja(body) {
  const clave = body.idempotency_key;
  if (typeof clave !== 'string' || clave.length < 16 || clave.length > 100 ||
      clave !== clave.trim() || /[\u0000-\u001f\u007f]/.test(clave)) {
    throw new Error('El cobro requiere una clave de idempotencia valida (16 a 100 caracteres). Actualiza la pantalla de Caja.');
  }
  return clave;
}

// Canoniza todos los datos que definen el cobro. El monto y los subtotales
// enviados por el navegador NO forman parte de la huella: se calculan en BD.
function datosCanonicosPagoCaja(body, idCuenta, idCajero, metodo, referencia, comprobante, idsSolicitados) {
  const efectivo = validarEfectivoRecibidoCaja(body, metodo, 0);
  return {
    id_cuenta: idCuenta,
    id_cajero: idCajero,
    metodo_pago: metodo,
    referencia,
    productos: idsSolicitados.length ? [...idsSolicitados].sort((a, b) => a - b) : null,
    monto_recibido: efectivo.monto_recibido,
    tipo_comprobante: comprobante.tipo,
    dni: comprobante.dni,
    ruc: comprobante.ruc,
    razon_social: comprobante.razon_social,
    pagado_por: String(body.pagado_por || 'Cliente').trim() || 'Cliente',
    mesa_pagadora: body.mesa_pagadora == null || body.mesa_pagadora === '' ? null : String(body.mesa_pagadora),
    notas: body.notas == null || body.notas === '' ? 'Pago registrado por Caja' : String(body.notas),
  };
}

function huellaPagoCaja(datos) {
  return createHash('sha256').update(JSON.stringify(datos)).digest('hex');
}

// La misma consulta sirve al pago nuevo y a una recuperacion tras perder
// la respuesta HTTP. Siempre mostramos el saldo actualmente registrado.
async function saldoPendienteGrupoCaja(client, idGrupoMesa) {
  const saldo = await client.query(
    `SELECT COALESCE(SUM(pendiente), 0) AS saldo
     FROM (
       SELECT dp.id_detalle_producto,
              dp.subtotal - COALESCE(SUM(CASE WHEN pg.estado_pago = 'pagado' THEN dpg.monto ELSE 0 END), 0) AS pendiente
       FROM detalle_producto dp
       INNER JOIN pedidos p ON p.id_pedido = dp.id_pedido
       LEFT JOIN detalle_pago dpg ON dpg.id_detalle_producto = dp.id_detalle_producto
       LEFT JOIN pagos pg ON pg.id_pago = dpg.id_pago
       WHERE p.id_grupo_mesa = $1 AND p.estado <> 'cancelado'
       GROUP BY dp.id_detalle_producto
     ) x
     WHERE pendiente > 0`,
    [idGrupoMesa]
  );
  return numero(saldo.rows[0]?.saldo);
}

async function buscarPagoIdempotenteCaja(client, clave) {
  const resultado = await client.query(
    `SELECT pg.*, c.id_grupo_mesa,
            co.tipo_comprobante AS comprobante_tipo,
            co.dni AS comprobante_dni,
            co.ruc AS comprobante_ruc,
            co.razon_social AS comprobante_razon_social
       FROM pagos pg
       INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
       LEFT JOIN comprobantes co ON co.id_pago = pg.id_pago
      WHERE pg.idempotency_key = $1
      LIMIT 1`,
    [clave]
  );
  return resultado.rows[0] || null;
}

async function registrarPago(req, res) {
  let client;
  try {
    client = await cajeroPool.connect();
    await asegurarEsquemaCaja(client);
    const body = req.body || {};
    const idCuenta = Number(req.params.id || body.id_cuenta);
    const idCajero = Number(req.personal?.id_trabajador);
    if (!Number.isSafeInteger(idCuenta) || idCuenta <= 0) {
      return res.status(400).json({ ok: false, message: 'Cuenta invalida.' });
    }
    if (!Number.isSafeInteger(idCajero) || idCajero <= 0) {
      return res.status(401).json({ ok: false, message: 'Sesion de cajero invalida.' });
    }

    // Diferenciamos errores de validacion de fallos de red/BD. Ante un error
    // incierto el cliente debe conservar su clave, nunca iniciar otro cobro.
    let comprobante, metodo, referencia, idsSolicitados, clave, canonicos;
    try {
      comprobante = validarComprobante(body);
      metodo = validarMetodoPagoCaja(body.metodo_pago ?? body.metodoPago);
      referencia = validarReferenciaPagoCaja(body, metodo);
      idsSolicitados = validarDetallesSolicitadosCaja(body);
      clave = validarClaveIdempotenciaCaja(body);
      canonicos = datosCanonicosPagoCaja(
        body, idCuenta, idCajero, metodo, referencia, comprobante, idsSolicitados
      );
    } catch (error) {
      error.status = 400;
      throw error;
    }
    const huella = huellaPagoCaja(canonicos);

    await client.query('BEGIN');
    // PostgreSQL libera este bloqueo al COMMIT/ROLLBACK. Dos solicitudes
    // simultaneas con la misma clave se serializan antes de consultar pagos.
    // El indice UNIQUE del commit 07 es la defensa definitiva en la BD.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
      [clave]
    );

    const previo = await buscarPagoIdempotenteCaja(client, clave);
    if (previo) {
      const coincide = previo.idempotency_hash === huella &&
        Number(previo.id_cuenta) === idCuenta && Number(previo.id_cajero) === idCajero;
      if (!coincide || previo.estado_pago !== 'pagado') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          ok: false,
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Esta clave ya se utilizo en otra operacion. Revisa el historial antes de intentar un nuevo cobro.',
        });
      }

      const saldoPendiente = await saldoPendienteGrupoCaja(client, previo.id_grupo_mesa);
      await client.query('COMMIT');
      // Recuperamos el mismo pago; nunca repetimos INSERTs ni eventos.
      return res.status(200).json({
        ok: true,
        repetido: true,
        message: 'El pago ya estaba registrado. No se creo un segundo cobro.',
        data: {
          ...previo,
          saldo_pendiente: saldoPendiente,
          cajero: req.personal.nombre,
          comprobante: {
            tipo: previo.comprobante_tipo,
            dni: previo.comprobante_dni,
            ruc: previo.comprobante_ruc,
            razon_social: previo.comprobante_razon_social,
          },
        },
      });
    }

    const { cuenta, detalles } = await obtenerPendientesCuenta(client, idCuenta);
    if (!cuenta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Cuenta no encontrada.' });
    }
    if (cuenta.estado !== 'pendiente' || !detalles.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Esta cuenta ya no tiene saldo pendiente.' });
    }

    let seleccionados = detalles;
    if (idsSolicitados.length) {
      seleccionados = detalles.filter((d) => idsSolicitados.includes(Number(d.id_detalle_producto)));
      if (seleccionados.length !== idsSolicitados.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: 'Uno o mas productos seleccionados ya fueron pagados o no pertenecen a esta cuenta.' });
      }
    }

    const noHabilitados = seleccionados.filter((d) => !detallePuedePagarse(d));
    if (noHabilitados.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        message: 'Solo se pueden cobrar productos entregados. En pedidos para llevar tambien se permite cobrar cuando estan listos para recoger.',
      });
    }

    if (!idsSolicitados.length) {
      const pendientesNoHabilitados = detalles.filter((d) => !detallePuedePagarse(d));
      if (pendientesNoHabilitados.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: 'La cuenta aun tiene productos que no estan habilitados para cobro.' });
      }
    }

    const montoCentavos = seleccionados.reduce(
      (suma, detalle) => suma + centavosPagoCaja(detalle.pendiente, 'Saldo del producto'), 0
    );
    if (montoCentavos <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'No existe monto pendiente para registrar.' });
    }
    if (montoCentavos > MAX_CENTAVOS_PAGO_CAJA) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'El monto del pago supera el limite permitido.' });
    }

    const monto = importePagoCaja(montoCentavos);
    let efectivo;
    try {
      efectivo = validarEfectivoRecibidoCaja(body, metodo, montoCentavos);
    } catch (error) {
      error.status = 400;
      throw error;
    }
    const esTotal = seleccionados.length === detalles.length;
    const pago = await client.query(
      `INSERT INTO pagos
        (id_cuenta, metodo_pago, monto, pagado_por, estado_pago, referencia, tipo_pago,
         mesa_pagadora, notas, id_cajero, monto_recibido, vuelto,
         idempotency_key, idempotency_hash)
       VALUES ($1, $2, $3, $4, 'pagado', $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        idCuenta,
        metodo,
        monto,
        canonicos.pagado_por,
        referencia,
        esTotal ? 'total' : 'parcial',
        canonicos.mesa_pagadora,
        canonicos.notas,
        idCajero,
        efectivo.monto_recibido,
        efectivo.vuelto,
        clave,
        huella,
      ]
    );

    for (const item of seleccionados) {
      await client.query(
        `INSERT INTO detalle_pago (id_pago, id_detalle_producto, monto) VALUES ($1, $2, $3)`,
        [pago.rows[0].id_pago, item.id_detalle_producto, item.pendiente]
      );
    }

    await client.query(
      `INSERT INTO comprobantes (id_pago, tipo_comprobante, dni, ruc, razon_social)
       VALUES ($1, $2, $3, $4, $5)`,
      [pago.rows[0].id_pago, comprobante.tipo, comprobante.dni, comprobante.ruc, comprobante.razon_social]
    );

    const saldoPendiente = await saldoPendienteGrupoCaja(client, cuenta.id_grupo_mesa);
    if (saldoPendiente <= 0) {
      await client.query(`UPDATE cuentas SET estado = 'pagada' WHERE id_cuenta = $1`, [idCuenta]);
      await client.query(
        `UPDATE solicitudes_cuenta SET estado = 'atendida', atendido_at = CURRENT_TIMESTAMP
         WHERE id_cuenta = $1 AND estado = 'pendiente'`,
        [idCuenta]
      );
      await cerrarGrupoSiCorresponde(client, cuenta.id_grupo_mesa);
    }

    await client.query('COMMIT');

    const respuesta = {
      ...pago.rows[0],
      saldo_pendiente: saldoPendiente,
      cajero: req.personal.nombre,
      comprobante,
    };
    eventEmitter.emitPagoRegistrado(respuesta);
    eventEmitter.emitCuentaActualizada({ id_cuenta: idCuenta, id_grupo_mesa: cuenta.id_grupo_mesa, saldo_pendiente: saldoPendiente });
    res.status(201).json({ ok: true, repetido: false, message: 'Pago registrado por Caja.', data: respuesta });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Error al registrar pago en caja:', error);
    if (error.code === '23505' && error.constraint === 'ux_pagos_idempotency_key') {
      return res.status(409).json({
        ok: false, code: 'IDEMPOTENCY_CONFLICT',
        message: 'Ya existe un pago con esa clave. Reintenta la misma operacion y consulta el historial.',
      });
    }
    if (error.status === 400) {
      return res.status(400).json({ ok: false, message: error.message });
    }
    // Nunca responder 400 por un COMMIT de resultado incierto: el navegador
    // conservara la clave para recuperar la operacion en otro intento.
    return res.status(500).json({
      ok: false,
      code: 'PAGO_NO_CONFIRMADO',
      message: 'No se pudo confirmar el resultado del cobro. Reintenta con la misma clave o consulta el historial.',
    });
  } finally {
    if (client) client.release();
  }
}

async function listarPagos(req, res) {
  try {
    await asegurarEsquemaCaja();
    const params = [];
    const where = [`pg.estado_pago = 'pagado'`];

    if (req.query.desde) {
      params.push(req.query.desde);
      where.push(`pg.fecha_pago >= $${params.length}::date`);
    }
    if (req.query.hasta) {
      params.push(req.query.hasta);
      where.push(`pg.fecha_pago < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (req.query.metodo) {
      params.push(mapMetodoPago(req.query.metodo));
      where.push(`pg.metodo_pago = $${params.length}`);
    }
    if (String(req.query.mios || '') === '1') {
      params.push(req.personal.id_trabajador);
      where.push(`pg.id_cajero = $${params.length}`);
    }

    const { rows } = await cajeroPool.query(
      `SELECT pg.*,
              c.id_grupo_mesa,
              gm.nombre_grupo,
              gm.mesa_principal,
              co.id_comprobante,
              co.tipo_comprobante,
              co.dni,
              co.ruc,
              co.razon_social,
              TRIM(COALESCE(t.nombres, '') || ' ' || COALESCE(t.apellidos, '')) AS cajero_nombre
       FROM pagos pg
       INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
       LEFT JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
       LEFT JOIN comprobantes co ON co.id_pago = pg.id_pago
       LEFT JOIN trabajador t ON t.idtrabajador = pg.id_cajero
       WHERE ${where.join(' AND ')}
       ORDER BY pg.fecha_pago DESC
       LIMIT 500`,
      params
    );
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (error) {
    console.error('Error al listar pagos de caja:', error);
    res.status(500).json({ ok: false, message: 'Error al listar pagos', error: error.message });
  }
}

async function listarComprobantes(req, res) {
  try {
    await asegurarEsquemaCaja();
    const params = [];
    const where = [`pg.estado_pago = 'pagado'`];
    if (req.query.tipo) {
      params.push(normalizar(req.query.tipo));
      where.push(`co.tipo_comprobante = $${params.length}`);
    }
    const { rows } = await cajeroPool.query(
      `SELECT co.*, pg.monto, pg.metodo_pago, pg.fecha_pago, pg.pagado_por,
              c.id_cuenta, gm.nombre_grupo, gm.mesa_principal,
              TRIM(COALESCE(t.nombres, '') || ' ' || COALESCE(t.apellidos, '')) AS cajero_nombre
       FROM comprobantes co
       INNER JOIN pagos pg ON pg.id_pago = co.id_pago
       INNER JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
       LEFT JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
       LEFT JOIN trabajador t ON t.idtrabajador = pg.id_cajero
       WHERE ${where.join(' AND ')}
       ORDER BY co.fecha_emision DESC
       LIMIT 500`,
      params
    );
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (error) {
    console.error('Error al listar comprobantes:', error);
    res.status(500).json({ ok: false, message: 'Error al listar comprobantes', error: error.message });
  }
}

async function atenderSolicitudCuenta(req, res) {
  try {
    const id = Number(req.params.id);
    const { rows } = await cajeroPool.query(
      `UPDATE solicitudes_cuenta
       SET estado = 'atendida', atendido_at = CURRENT_TIMESTAMP
       WHERE id_solicitud = $1 AND estado = 'pendiente'
       RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Solicitud no encontrada o ya atendida.' });
    eventEmitter.emitCuentaActualizada({ tipo: 'solicitud_cuenta_atendida', solicitud: rows[0] });
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo atender la solicitud', error: error.message });
  }
}

async function obtenerPagosSinCerrar(client, idCajero, bloquear = false) {
  const suffix = bloquear ? ' FOR UPDATE OF pg' : '';
  const { rows } = await client.query(
    `SELECT pg.id_pago, pg.metodo_pago, pg.monto, pg.fecha_pago
     FROM pagos pg
     LEFT JOIN cierre_caja_pagos ccp ON ccp.id_pago = pg.id_pago
     WHERE pg.estado_pago = 'pagado'
       AND pg.id_cajero = $1
       AND ccp.id_pago IS NULL
     ORDER BY pg.fecha_pago ASC${suffix}`,
    [idCajero]
  );
  return rows;
}

function calcularTotalesCorte(pagos) {
  const totales = {
    efectivo: 0,
    yape: 0,
    plin: 0,
    tarjeta_credito: 0,
    tarjeta_debito: 0,
  };
  for (const p of pagos) {
    if (Object.prototype.hasOwnProperty.call(totales, p.metodo_pago)) {
      totales[p.metodo_pago] += numero(p.monto);
    }
  }
  return {
    ...totales,
    total_general: Object.values(totales).reduce((s, n) => s + n, 0),
    cantidad_pagos: pagos.length,
  };
}

async function resumenCorteActual(req, res) {
  try {
    await asegurarEsquemaCaja();
    const pagos = await obtenerPagosSinCerrar(cajeroPool, req.personal.id_trabajador, false);
    const totales = calcularTotalesCorte(pagos);
    res.json({
      ok: true,
      data: {
        ...totales,
        fecha_desde: pagos[0]?.fecha_pago || null,
        fecha_hasta: pagos[pagos.length - 1]?.fecha_pago || null,
        pagos,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo calcular el corte actual', error: error.message });
  }
}

async function registrarCierreCaja(req, res) {
  const client = await cajeroPool.connect();
  try {
    await asegurarEsquemaCaja(client);
    await client.query('BEGIN');
    const pagos = await obtenerPagosSinCerrar(client, req.personal.id_trabajador, true);
    if (!pagos.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'No hay pagos pendientes de incluir en un cierre.' });
    }

    const totales = calcularTotalesCorte(pagos);
    const fechaDesde = pagos[0].fecha_pago;
    const cierre = await client.query(
      `INSERT INTO cierres_caja
        (id_cajero, fecha_desde, fecha_hasta, cantidad_pagos, total_efectivo, total_yape, total_plin,
         total_tarjeta_credito, total_tarjeta_debito, total_general, observaciones)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.personal.id_trabajador,
        fechaDesde,
        totales.cantidad_pagos,
        totales.efectivo,
        totales.yape,
        totales.plin,
        totales.tarjeta_credito,
        totales.tarjeta_debito,
        totales.total_general,
        req.body.observaciones || null,
      ]
    );

    for (const pago of pagos) {
      await client.query(
        `INSERT INTO cierre_caja_pagos (id_cierre_caja, id_pago) VALUES ($1, $2)`,
        [cierre.rows[0].id_cierre_caja, pago.id_pago]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, message: 'Cierre de caja registrado.', data: cierre.rows[0] });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error al cerrar caja:', error);
    res.status(400).json({ ok: false, message: error.message || 'No se pudo cerrar caja.' });
  } finally {
    client.release();
  }
}

async function listarCierres(req, res) {
  try {
    await asegurarEsquemaCaja();
    const { rows } = await cajeroPool.query(
      `SELECT cc.*,
              TRIM(COALESCE(t.nombres, '') || ' ' || COALESCE(t.apellidos, '')) AS cajero_nombre
       FROM cierres_caja cc
       LEFT JOIN trabajador t ON t.idtrabajador = cc.id_cajero
       WHERE cc.id_cajero = $1
       ORDER BY cc.fecha_hasta DESC
       LIMIT 100`,
      [req.personal.id_trabajador]
    );
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudieron listar los cierres', error: error.message });
  }
}

module.exports = {
  resumenCaja,
  listarCuentas,
  registrarPago,
  listarPagos,
  listarComprobantes,
  atenderSolicitudCuenta,
  resumenCorteActual,
  registrarCierreCaja,
  listarCierres,
};
