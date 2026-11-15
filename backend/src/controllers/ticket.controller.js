'use strict';

// Solo lectura: obtener un ticket nunca registra ni modifica un pago.
const { cajeroPool } = require('../config/db');
const {
  validarAncho, prepararTicket, crearDocumentoTicket,
} = require('../services/ticket-pdf.service');

function idPositivo(valor) {
  const texto = String(valor || '');
  if (!/^[1-9]\d{0,9}$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) ? numero : null;
}

const SQL_PAGO = `
  SELECT pg.id_pago, pg.id_cuenta, pg.id_cajero, pg.id_subcuenta,
         pg.estado_pago, pg.metodo_pago, pg.monto, pg.monto_recibido,
         pg.vuelto, pg.referencia, pg.fecha_pago, pg.pagado_por,
         gm.nombre_grupo,
         (SELECT STRING_AGG(m.numero_mesa::text, ', ' ORDER BY m.numero_mesa::text)
            FROM grupo_mesa_detalle gmd
            JOIN mesas m ON m.id_mesa = gmd.id_mesa
           WHERE gmd.id_grupo_mesa = c.id_grupo_mesa) AS mesas,
         co.id_comprobante, co.tipo_comprobante, co.dni, co.ruc, co.razon_social,
         sc.nombre AS participante,
         TRIM(COALESCE(t.nombres, '') || ' ' || COALESCE(t.apellidos, '')) AS cajero_nombre
    FROM pagos pg
    JOIN cuentas c ON c.id_cuenta = pg.id_cuenta
    LEFT JOIN grupos_mesa gm ON gm.id_grupo_mesa = c.id_grupo_mesa
    LEFT JOIN comprobantes co ON co.id_pago = pg.id_pago
    LEFT JOIN subcuentas sc ON sc.id_subcuenta = pg.id_subcuenta
    LEFT JOIN trabajador t ON t.idtrabajador = pg.id_cajero
   WHERE pg.id_pago = $1
   LIMIT 1
`;

const SQL_DETALLES = `
  SELECT dpg.id_detalle_pago, dpg.id_detalle_producto,
         dpg.monto AS monto_pagado, dp.subtotal AS subtotal_producto,
         dp.cantidad AS cantidad_pedido,
         COALESCE(pl.nombre, b.nombre, 'Producto no disponible') AS nombre_producto
    FROM detalle_pago dpg
    JOIN detalle_producto dp ON dp.id_detalle_producto = dpg.id_detalle_producto
    LEFT JOIN platos pl ON pl.id_plato = dp.id_plato
    LEFT JOIN bebidas b ON b.id_bebida = dp.id_bebida
   WHERE dpg.id_pago = $1
   ORDER BY dpg.id_detalle_pago
`;

async function descargarTicketPDF(req, res) {
  const idPago = idPositivo(req.params.id);
  if (idPago === null) {
    return res.status(400).json({ ok: false, message: 'ID de pago invalido.' });
  }
  let ancho;
  try {
    ancho = validarAncho(req.query.ancho);
  } catch (_) {
    return res.status(400).json({ ok: false, message: 'Selecciona ancho 58 u 80 mm.' });
  }
  if (req.query.descargar !== undefined && !['0', '1'].includes(String(req.query.descargar))) {
    return res.status(400).json({ ok: false, message: 'Parametro descargar invalido.' });
  }

  try {
    const { rows: pagos } = await cajeroPool.query(SQL_PAGO, [idPago]);
    const pago = pagos[0];
    if (!pago || pago.estado_pago !== 'pagado') {
      return res.status(404).json({ ok: false, message: 'No existe un pago confirmado con ese ID.' });
    }

    const administrador = req.personal?.rol === 'administrador';
    const perteneceAlCajero = Number(pago.id_cajero) > 0 &&
      Number(pago.id_cajero) === Number(req.personal?.id_trabajador);
    if (!administrador && !perteneceAlCajero) {
      return res.status(403).json({ ok: false, message: 'Solo puedes imprimir tus propios pagos.' });
    }

    const { rows: detalles } = await cajeroPool.query(SQL_DETALLES, [idPago]);
    let ticket;
    try {
      ticket = prepararTicket(pago, detalles);
    } catch (error) {
      // No se inventa un ticket si falta desglose o hay importes inconsistentes.
      console.warn('Ticket no generado para pago', idPago, error.message);
      return res.status(409).json({ ok: false, message: 'El pago no tiene un desglose consistente para generar el ticket.' });
    }

    let pdf;
    try {
      pdf = crearDocumentoTicket(ticket, ancho);
    } catch (error) {
      console.error('No se pudo crear el ticket PDF:', error);
      return res.status(503).json({ ok: false, message: 'El generador PDF no esta disponible. Verifica la instalacion de PDFKit.' });
    }

    // No se filtran nombres ni documentos personales en el nombre del archivo.
    const archivo = `menugo-ticket-pago-${idPago}-${ancho}mm.pdf`;
    const disposicion = req.query.descargar === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposicion}; filename="${archivo}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pdf.on('error', (error) => {
      console.error('Fallo durante la generacion del PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'No se pudo generar el ticket.' });
      } else {
        res.destroy(error);
      }
    });
    pdf.pipe(res);
    pdf.end();
  } catch (error) {
    console.error('Error consultando el ticket:', error);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: 'No se pudo consultar el ticket del pago.' });
    }
    res.destroy(error);
  }
}

module.exports = { descargarTicketPDF, idPositivo, SQL_PAGO, SQL_DETALLES };
