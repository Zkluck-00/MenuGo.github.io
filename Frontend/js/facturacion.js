'use strict';
if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error('Acceso bloqueado.');
const API_FACT = window.MENUGO_API || 'http://localhost:4000/api';
let solicitudComprobantes = 0;

function eF(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function sF(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }
function fechaComprobante(valor) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-PE');
}
function accionesTicketComprobante(id) {
  const valido = window.MenuGoHistorialTicket?.idPagoValido(id);
  if (!valido) return '<p class="text-xs font-semibold text-slate-500">No hay un pago confirmado para imprimir.</p>';
  return `<div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
    <button type="button" data-ticket-accion="ver" data-pago="${valido}" class="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-black text-orange-800 hover:bg-orange-100">Ver ticket PDF</button>
    <button type="button" data-ticket-accion="simular" data-pago="${valido}" class="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">Reimprimir</button>
  </div>`;
}
async function cargarComprobantes(tipo = '') {
  const contenedor = document.getElementById('lista-comprobantes');
  if (!contenedor) return;
  const actual = ++solicitudComprobantes;
  const filtro = ['boleta', 'factura'].includes(tipo) ? tipo : '';
  contenedor.innerHTML = '<p class="col-span-full rounded-2xl bg-white p-8 text-sm font-bold text-slate-500">Consultando comprobantes...</p>';
  try {
    const respuesta = await fetch(
      `${API_FACT}/cajero/comprobantes${filtro ? `?tipo=${encodeURIComponent(filtro)}` : ''}`,
      { headers: headersAutenticadosPersonal('cajero'), cache: 'no-store' }
    );
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || datos.ok === false) throw new Error(datos.message || 'No se pudo consultar comprobantes.');
    if (actual !== solicitudComprobantes) return;
    const registros = Array.isArray(datos.data) ? datos.data : [];
    contenedor.innerHTML = registros.length ? registros.map(c => `
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase text-orange-600">${eF(c.tipo_comprobante)}</p>
            <h2 class="mt-1 text-xl font-black">Registro #${eF(c.id_comprobante)}</h2>
          </div>
          <strong class="text-xl text-emerald-600">${sF(c.monto)}</strong>
        </div>
        <div class="mt-4 space-y-1 text-sm text-slate-700">
          <p><strong>Pago:</strong> #${eF(c.id_pago)}</p>
          <p><strong>Documento:</strong> ${eF(c.dni || c.ruc || '-')}</p>
          ${c.razon_social ? `<p><strong>Razón social:</strong> ${eF(c.razon_social)}</p>` : ''}
          <p><strong>Método:</strong> ${eF(c.metodo_pago)}</p>
          <p><strong>Fecha:</strong> ${eF(fechaComprobante(c.fecha_emision))}</p>
          <p><strong>Cajero:</strong> ${eF(c.cajero_nombre || 'Pago digital/previo')}</p>
        </div>
        ${accionesTicketComprobante(c.id_pago)}
      </article>`).join('') : '<p class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">No hay comprobantes registrados para el filtro seleccionado.</p>';
  } catch (error) {
    if (actual !== solicitudComprobantes) return;
    contenedor.innerHTML = `<p class="col-span-full rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center font-bold text-rose-800">${eF(error.message)}</p>`;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  window.MenuGoHistorialTicket?.enlazarContenedor('lista-comprobantes', 'facturacion.html');
  cargarComprobantes('');
});
