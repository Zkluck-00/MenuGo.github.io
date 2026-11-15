'use strict';

// MenuGo - ticket interno de venta en papel termico virtual (58 mm / 80 mm).
// No sustituye ni afirma emitir boletas/facturas electronicas SUNAT.

const MILIMETROS = Object.freeze([58, 80]);
const PT_POR_MM = 72 / 25.4;
const MAX_ALTURA_PT = 14000;

function validarAncho(ancho) {
  if (ancho === undefined || ancho === null || ancho === '') return 80;
  const numero = Number(ancho);
  if (!Number.isInteger(numero) || !MILIMETROS.includes(numero)) {
    const error = new Error('El ancho debe ser 58 u 80 milimetros.');
    error.code = 'ANCHO_INVALIDO';
    throw error;
  }
  return numero;
}

function centavos(valor) {
  // PostgreSQL devuelve NUMERIC como texto, para conservar los centimos exactos.
  const texto = String(valor === null || valor === undefined ? '' : valor).trim();
  const match = texto.match(/^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Importe monetario invalido en el registro del pago.');
  const importe = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(importe)) throw new Error('Importe demasiado grande.');
  return importe;
}

function solesCentavos(valor) {
  return `S/ ${(valor / 100).toFixed(2)}`;
}

function textoSeguro(valor, maximo = 100) {
  // Las fuentes estandar del PDF solo representan el conjunto Latin-1/WinAnsi.
  // Se evitan saltos de linea, controles y simbolos que generen cuadros negros.
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\r\n\t\u00a0\u202f]+/g, ' ')
    .replace(/[^\x20-\x7e\xa1-\xff]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo);
}

function fechaPeru(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(fecha);
}

function prepararTicket(pago, detalles) {
  if (!pago || pago.estado_pago !== 'pagado') {
    throw new Error('Solo se generan tickets de pagos confirmados.');
  }
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new Error('El pago no tiene un desglose de productos para imprimir.');
  }
  const totalCentavos = centavos(pago.monto);
  if (totalCentavos <= 0) throw new Error('El pago tiene un importe invalido.');

  const lineas = detalles.map((detalle) => {
    const importeCentavos = centavos(detalle.monto_pagado);
    const importePedidoCentavos = centavos(detalle.subtotal_producto);
    if (importeCentavos <= 0 || importeCentavos > importePedidoCentavos) {
      throw new Error('Existe un producto con importe pagado inconsistente.');
    }
    const cantidad = Number(detalle.cantidad_pedido);
    const completo = importeCentavos === importePedidoCentavos;
    return {
      nombre: textoSeguro(detalle.nombre_producto || `Producto #${detalle.id_detalle_producto}`, 120) || 'Producto',
      descripcion: completo && Number.isSafeInteger(cantidad) && cantidad > 0
        ? `${cantidad} x` : 'Pago parcial',
      importeCentavos,
    };
  });

  const suma = lineas.reduce((total, linea) => total + linea.importeCentavos, 0);
  if (!Number.isSafeInteger(suma) || suma !== totalCentavos) {
    throw new Error('El desglose no coincide con el importe del pago registrado.');
  }

  const metodo = textoSeguro(pago.metodo_pago || '-', 30).replaceAll('_', ' ');
  const efectivo = metodo.toLowerCase() === 'efectivo';
  const recibido = pago.monto_recibido === null || pago.monto_recibido === undefined
    ? null : centavos(pago.monto_recibido);
  const vuelto = pago.vuelto === null || pago.vuelto === undefined
    ? null : centavos(pago.vuelto);
  if (efectivo && recibido !== null && vuelto !== null && recibido - totalCentavos !== vuelto) {
    throw new Error('El efectivo recibido y el vuelto no coinciden.');
  }

  return {
    idPago: Number(pago.id_pago),
    idComprobante: pago.id_comprobante ? Number(pago.id_comprobante) : null,
    idCuenta: Number(pago.id_cuenta),
    mesa: textoSeguro(pago.mesas || pago.nombre_grupo || 'Sin mesa', 70),
    fecha: fechaPeru(pago.fecha_pago),
    cajero: textoSeguro(pago.cajero_nombre || 'No indicado', 90),
    participante: textoSeguro(pago.participante, 70),
    pagadoPor: textoSeguro(pago.pagado_por || 'Cliente', 90),
    metodo,
    referencia: textoSeguro(pago.referencia, 80),
    tipoDocumento: pago.tipo_comprobante === 'factura' ? 'Factura solicitada'
      : pago.tipo_comprobante === 'boleta' ? 'Boleta solicitada' : 'Sin datos de comprobante',
    documentoCliente: textoSeguro(pago.ruc || pago.dni, 15),
    razonSocial: textoSeguro(pago.razon_social, 110),
    totalCentavos, recibido, vuelto, efectivo, lineas,
  };
}

function maquetar(doc, ticket, ancho, medir) {
  const anchoPt = ancho * PT_POR_MM;
  const margen = ancho === 58 ? 9 : 11;
  const contenido = anchoPt - 2 * margen;
  const tam = ancho === 58 ? 7.4 : 8.5;
  let y = margen + 2;

  function texto(linea, { negrita = false, tamano = tam, alinear = 'left', espacio = 3 } = {}) {
    const valor = textoSeguro(linea, 300) || '-';
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).fillColor('#111111');
    const opciones = { width: contenido, align: alinear, lineGap: 1 };
    const alto = doc.heightOfString(valor, opciones);
    if (!medir) doc.text(valor, margen, y, opciones);
    y += alto + espacio;
  }

  function divisor() {
    if (!medir) {
      doc.lineWidth(0.5).strokeColor('#777777').moveTo(margen, y + 3).lineTo(margen + contenido, y + 3).stroke();
    }
    y += 11;
  }

  function dosColumnas(izquierda, derecha, { negrita = false, espacio = 3 } = {}) {
    const izq = textoSeguro(izquierda, 160);
    const der = textoSeguro(derecha, 80);
    const colDer = ancho === 58 ? 52 : 67;
    const separacion = 4;
    const colIzq = contenido - colDer - separacion;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam).fillColor('#111111');
    const opcionesIzq = { width: colIzq, lineGap: 1 };
    const opcionesDer = { width: colDer, align: 'right', lineGap: 1 };
    const altoIzq = doc.heightOfString(izq, opcionesIzq);
    const altoDer = doc.heightOfString(der, opcionesDer);
    if (!medir) {
      doc.text(izq, margen, y, opcionesIzq);
      doc.text(der, margen + colIzq + separacion, y, opcionesDer);
    }
    y += Math.max(altoIzq, altoDer) + espacio;
  }

  texto('MENUGO', { negrita: true, tamano: ancho === 58 ? 13 : 15, alinear: 'center', espacio: 2 });
  texto('TICKET INTERNO DE VENTA', { negrita: true, alinear: 'center', espacio: 2 });
  texto('SIMULACION - NO VALIDO ANTE SUNAT', { tamano: ancho === 58 ? 6.3 : 7, alinear: 'center', espacio: 6 });
  divisor();
  texto(`Pago #${ticket.idPago}   Cuenta #${ticket.idCuenta}`);
  if (ticket.idComprobante) texto(`Registro comprobante #${ticket.idComprobante}`);
  texto(`Fecha (Peru): ${ticket.fecha}`);
  texto(`Mesa(s): ${ticket.mesa}`);
  texto(`Cajero: ${ticket.cajero}`);
  if (ticket.participante) texto(`Subcuenta: ${ticket.participante}`);
  texto(`Pagado por: ${ticket.pagadoPor}`);
  divisor();
  texto('PRODUCTOS PAGADOS', { negrita: true, alinear: 'center', espacio: 5 });
  dosColumnas('Producto / detalle', 'Importe S/', { negrita: true, espacio: 5 });
  for (const linea of ticket.lineas) {
    dosColumnas(`${linea.descripcion} ${linea.nombre}`, (linea.importeCentavos / 100).toFixed(2), { espacio: 5 });
  }
  divisor();
  dosColumnas('TOTAL PAGADO', solesCentavos(ticket.totalCentavos), { negrita: true, espacio: 6 });
  texto(`Metodo: ${ticket.metodo}`);
  if (ticket.referencia) texto(`Referencia: ${ticket.referencia}`);
  if (ticket.efectivo && ticket.recibido !== null) texto(`Recibido: ${solesCentavos(ticket.recibido)}`);
  if (ticket.efectivo && ticket.vuelto !== null) texto(`Vuelto: ${solesCentavos(ticket.vuelto)}`);
  divisor();
  texto(ticket.tipoDocumento, { negrita: true, alinear: 'center' });
  if (ticket.documentoCliente) texto(`Documento: ${ticket.documentoCliente}`);
  if (ticket.razonSocial) texto(`Razon social: ${ticket.razonSocial}`);
  divisor();
  texto('Gracias por su visita', { negrita: true, alinear: 'center', espacio: 3 });
  texto('Este ticket es de uso interno y no sustituye un comprobante electronico valido.', {
    tamano: ancho === 58 ? 6.5 : 7.2, alinear: 'center', espacio: 4,
  });
  return y + margen + 3;
}

function crearDocumentoTicket(ticket, ancho = 80, DocumentClass) {
  const elegido = validarAncho(ancho);
  let Constructor = DocumentClass;
  if (!Constructor) {
    const modulo = require('pdfkit');
    Constructor = modulo.PDFDocument || modulo;
  }
  const width = elegido * PT_POR_MM;
  const medicion = new Constructor({ size: [width, 800], margin: 0, autoFirstPage: true });
  const alto = Math.ceil(maquetar(medicion, ticket, elegido, true));
  if (alto > MAX_ALTURA_PT) {
    throw new Error('El ticket es demasiado largo para un solo documento.');
  }
  const pdf = new Constructor({
    size: [width, Math.max(180, alto)], margin: 0, compress: true,
    info: { Title: `MenuGo - Ticket interno de pago ${ticket.idPago}`, Author: 'MenuGo' },
  });
  maquetar(pdf, ticket, elegido, false);
  return pdf;
}

module.exports = {
  validarAncho, centavos, solesCentavos, prepararTicket,
  crearDocumentoTicket, textoSeguro, fechaPeru,
};
