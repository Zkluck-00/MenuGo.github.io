'use strict';

// MenuGo - ticket interno de venta en papel termico virtual (58 mm / 80 mm).
// No sustituye ni afirma emitir boletas/facturas electronicas SUNAT.

const fs = require('node:fs');
const path = require('node:path');
const LOGO_TICKET = path.resolve(__dirname, '../../assets/logo-menugo-ticket.png');

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
  const margen = ancho === 58 ? 9 : 12;
  const contenido = anchoPt - 2 * margen;
  const tam = ancho === 58 ? 7.45 : 8.35;
  const naranja = '#ed6520';
  const tinta = '#162133';
  let y = margen + 4;

  function texto(linea, { negrita = false, tamano = tam, alinear = 'left', espacio = 3, color = tinta } = {}) {
    const valor = textoSeguro(linea, 300) || '-';
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).fillColor(color);
    const opciones = { width: contenido, align: alinear, lineGap: 1 };
    const alto = doc.heightOfString(valor, opciones);
    if (!medir) doc.text(valor, margen, y, opciones);
    y += alto + espacio;
  }

  function divisor({ color = '#b5bbc4', espacio = 6 } = {}) {
    if (!medir) {
      doc.lineWidth(0.6).strokeColor(color).moveTo(margen, y + 2)
        .lineTo(margen + contenido, y + 2).stroke();
    }
    y += espacio + 5;
  }

  function dosColumnas(izquierda, derecha, { negrita = false, espacio = 4, color = tinta, tamano = tam } = {}) {
    const izq = textoSeguro(izquierda, 160) || '-';
    const der = textoSeguro(derecha, 90) || '-';
    const colDer = ancho === 58 ? 53 : 68;
    const separacion = 5;
    const colIzq = contenido - colDer - separacion;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).fillColor(color);
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

  // Marca real, derivada de Frontend/img/Log.png. Se incluye localmente en backend
  // para que Render no dependa de rutas publicas ni redes externas.
  const ladoLogo = ancho === 58 ? 34 : 41;
  if (!medir && typeof doc.image === 'function' && fs.existsSync(LOGO_TICKET)) {
    doc.image(LOGO_TICKET, (anchoPt - ladoLogo) / 2, y, {
      fit: [ladoLogo, ladoLogo], align: 'center', valign: 'center',
    });
  }
  y += ladoLogo + 4;
  texto('MENUGO', { negrita: true, tamano: ancho === 58 ? 14 : 16, alinear: 'center', espacio: 2 });
  texto('PUNTO DE VENTA', { negrita: true, tamano: ancho === 58 ? 7 : 8, alinear: 'center', espacio: 3, color: naranja });
  texto('TICKET INTERNO DE VENTA', { negrita: true, alinear: 'center', espacio: 1 });
  texto('NO VALIDO ANTE SUNAT', { tamano: ancho === 58 ? 6.5 : 7.1, alinear: 'center', espacio: 7, color: '#545d69' });
  divisor({ color: naranja, espacio: 6 });

  const tituloDocumento = ticket.tipoDocumento === 'Factura solicitada' ? 'FACTURA SOLICITADA'
    : ticket.tipoDocumento === 'Boleta solicitada' ? 'BOLETA SOLICITADA'
      : 'COMPROBANTE INTERNO';
  texto(tituloDocumento, { negrita: true, tamano: ancho === 58 ? 8.5 : 10.5, alinear: 'center', espacio: 7, color: naranja });
  dosColumnas('Registro de pago', `#${ticket.idPago}`, { negrita: true, espacio: 3 });
  if (ticket.idComprobante) dosColumnas('Comprobante', `#${ticket.idComprobante}`);
  dosColumnas('Cuenta', `#${ticket.idCuenta}`);
  texto(`Fecha: ${ticket.fecha}`, { tamano: tam - .2 });
  texto(`Mesa: ${ticket.mesa}`, { tamano: tam - .2 });
  texto(`Cajero: ${ticket.cajero}`, { tamano: tam - .2 });
  if (ticket.participante) texto(`Subcuenta: ${ticket.participante}`, { tamano: tam - .2 });
  if (ticket.pagadoPor) texto(`Cliente: ${ticket.pagadoPor}`, { tamano: tam - .2 });
  divisor();

  texto('DETALLE DE PRODUCTOS', { negrita: true, tamano: tam, alinear: 'center', espacio: 6 });
  dosColumnas('Descripcion', 'Total', { negrita: true, color: '#535e6d', espacio: 5, tamano: tam - .4 });
  for (const linea of ticket.lineas) {
    dosColumnas(`${linea.descripcion}  ${linea.nombre}`, solesCentavos(linea.importeCentavos), { espacio: 6 });
  }
  divisor({ color: naranja, espacio: 7 });

  // Banda del total, con contraste suficiente para visor y para impresora
  // termica monocroma. La medicion reserva la misma altura en ambas pasadas.
  const bandaAlto = ancho === 58 ? 28 : 32;
  if (!medir && typeof doc.roundedRect === 'function') {
    doc.roundedRect(margen - 2, y - 2, contenido + 4, bandaAlto, 5)
      .fill('#fff1e5');
  }
  y += ancho === 58 ? 6 : 8;
  dosColumnas('TOTAL PAGADO', solesCentavos(ticket.totalCentavos), {
    negrita: true, espacio: 0, color: tinta, tamano: ancho === 58 ? 8.7 : 10.1,
  });
  y += 9;
  texto(`Metodo de pago: ${ticket.metodo}`, { espacio: 3 });
  if (ticket.referencia) texto(`Referencia: ${ticket.referencia}`);
  if (ticket.efectivo && ticket.recibido !== null) dosColumnas('Efectivo recibido', solesCentavos(ticket.recibido));
  if (ticket.efectivo && ticket.vuelto !== null) dosColumnas('Vuelto', solesCentavos(ticket.vuelto), { negrita: true });
  divisor();

  if (ticket.documentoCliente) texto(`DNI/RUC: ${ticket.documentoCliente}`);
  if (ticket.razonSocial) texto(`Razon social: ${ticket.razonSocial}`);
  texto('Gracias por elegir MenuGo', { negrita: true, alinear: 'center', espacio: 4 });
  texto('Registro interno: no sustituye una boleta o factura electronica SUNAT.', {
    tamano: ancho === 58 ? 6.5 : 7.0, alinear: 'center', espacio: 6, color: '#535e6d',
  });
  return y + margen + 6;
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
