'use strict';

// MenuGo - Commit 24: validacion de PDFs termicos reales sin datos de Neon.
// No abre conexiones, no consulta PostgreSQL, no registra ni modifica pagos.
const { prepararTicket, crearDocumentoTicket, validarAncho } = require('../src/services/ticket-pdf.service');

const PUNTOS_POR_MM = 72 / 25.4;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function verificarEstructuraPDF(bytes, ancho) {
  const formato = validarAncho(ancho);
  if (!Buffer.isBuffer(bytes) || bytes.length < 512) {
    throw new Error('El generador no devolvio un documento PDF completo.');
  }
  const contenido = bytes.toString('latin1');
  if (!contenido.startsWith('%PDF-1.')) {
    throw new Error('El documento no comienza con una cabecera PDF valida.');
  }
  if (!contenido.trimEnd().endsWith('%%EOF')) {
    throw new Error('El documento PDF no contiene el marcador de cierre.');
  }
  const caja = contenido.match(/\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!caja) throw new Error('El PDF no declara dimensiones de pagina verificables.');
  const anchoPuntos = Number(caja[1]);
  const altoPuntos = Number(caja[2]);
  if (!Number.isFinite(anchoPuntos) || Math.abs(anchoPuntos - formato * PUNTOS_POR_MM) > 0.8) {
    throw new Error(`El PDF no tiene el ancho termico solicitado (${formato} mm).`);
  }
  if (!Number.isFinite(altoPuntos) || altoPuntos < 180 || altoPuntos > 14000) {
    throw new Error('El PDF tiene una altura de papel inesperada.');
  }
  return { formatoMm: formato, anchoPt: anchoPuntos, altoPt: altoPuntos, bytes: bytes.length };
}

async function generarPDFEnMemoria(ticket, ancho) {
  const pdf = crearDocumentoTicket(ticket, ancho);
  return new Promise((resolve, reject) => {
    const partes = [];
    let acumulado = 0;
    pdf.on('data', (parte) => {
      acumulado += parte.length;
      if (acumulado > MAX_PDF_BYTES) {
        pdf.destroy(new Error('PDF de demostracion demasiado grande.'));
        return;
      }
      partes.push(parte);
    });
    pdf.once('error', reject);
    pdf.once('end', () => resolve(Buffer.concat(partes)));
    try { pdf.end(); } catch (error) { reject(error); }
  });
}

function datosDemostracion() {
  const pago = {
    id_pago: 2424, id_cuenta: 100, id_comprobante: 95,
    estado_pago: 'pagado', monto: '69.00', metodo_pago: 'yape',
    fecha_pago: '2026-11-15T15:00:00Z', referencia: 'DEMO-2424',
    pagado_por: 'Cliente de prueba', mesas: 'Mesa 1',
    cajero_nombre: 'Cajero de prueba', tipo_comprobante: 'boleta', dni: '12345678',
  };
  const productos = [
    { id_detalle_producto: 1, nombre_producto: 'Tiradito Nikei', subtotal_producto: '35.00', monto_pagado: '35.00', cantidad_pedido: 1 },
    { id_detalle_producto: 2, nombre_producto: 'Tiradito amarillo', subtotal_producto: '34.00', monto_pagado: '34.00', cantidad_pedido: 1 },
  ];
  const parcial = {
    ...pago, id_pago: 2425, id_comprobante: 96,
    id_subcuenta: 7, participante: 'Participante de prueba', monto: '15.00',
  };
  const productoParcial = [{ ...productos[0], monto_pagado: '15.00' }];
  return [
    { tipo: 'pago_completo', ancho: 58, pago, productos },
    { tipo: 'pago_completo', ancho: 80, pago, productos },
    { tipo: 'pago_parcial', ancho: 58, pago: parcial, productos: productoParcial },
  ];
}

async function verificarTicketsReales() {
  const resultados = [];
  for (const caso of datosDemostracion()) {
    const ticket = prepararTicket(caso.pago, caso.productos);
    const bytes = await generarPDFEnMemoria(ticket, caso.ancho);
    resultados.push({ tipo: caso.tipo, ...verificarEstructuraPDF(bytes, caso.ancho) });
  }
  return resultados;
}

async function main() {
  const resultados = await verificarTicketsReales();
  for (const resultado of resultados) {
    console.log(`OK - ${resultado.tipo} - ${resultado.formatoMm} mm - ${resultado.bytes} bytes`);
  }
  console.log('Validacion finalizada: PDFs reales generados sin pagos ni conexiones a Neon.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('FALLO la verificacion del ticket PDF:', error.message);
    console.error('Instala dependencias con: npm ci --prefix backend');
    process.exitCode = 1;
  });
}

module.exports = { verificarEstructuraPDF, generarPDFEnMemoria, datosDemostracion, verificarTicketsReales, main };
