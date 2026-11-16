'use strict';

// Simulacion sin Neon ni impresora fisica: genera un PDF de demostracion.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepararTicket, crearDocumentoTicket, validarAncho } = require('../src/services/ticket-pdf.service');

async function main() {
  const ancho = validarAncho(process.argv[2] || '80');
  const pago = {
    id_pago: 125, id_cuenta: 34, id_comprobante: 98,
    estado_pago: 'pagado', monto: '69.00', metodo_pago: 'yape',
    referencia: 'OP123-DEMO', fecha_pago: '2026-11-15T20:00:00Z',
    pagado_por: 'Cliente demostracion', mesas: '1',
    cajero_nombre: 'Cajero Demo', tipo_comprobante: 'boleta', dni: '12345678',
  };
  const detalles = [
    { id_detalle_producto: 1, nombre_producto: 'Tiradito Nikei', monto_pagado: '35.00', subtotal_producto: '35.00', cantidad_pedido: 1 },
    { id_detalle_producto: 2, nombre_producto: 'Tiradito amarillo', monto_pagado: '34.00', subtotal_producto: '34.00', cantidad_pedido: 1 },
  ];

  const ticket = prepararTicket(pago, detalles);
  const pdf = crearDocumentoTicket(ticket, ancho);
  const salida = path.join(os.tmpdir(), `menugo-ticket-demo-${ancho}mm.pdf`);
  const archivo = fs.createWriteStream(salida, { flags: 'w' });
  pdf.pipe(archivo);
  pdf.end();
  await new Promise((resolve, reject) => {
    archivo.once('finish', resolve);
    archivo.once('error', reject);
    pdf.once('error', reject);
  });
  console.log('Ticket PDF de demostracion creado en:', salida);
  console.log('No se registro ningun pago ni se consulto PostgreSQL.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('No se pudo crear el ticket de demostracion:', error.message);
    process.exitCode = 1;
  });
}
module.exports = { main };
