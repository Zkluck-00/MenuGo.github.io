'use strict';
if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error('Acceso bloqueado.');
const API_HIST = window.MENUGO_API || 'http://localhost:4000/api';
let solicitudHistorial = 0;

function eH(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function sH(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }
function fechaHistorial(valor) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-PE');
}
async function apiHist(ruta) {
  const r = await fetch(`${API_HIST}${ruta}`, {
    headers: headersAutenticadosPersonal('cajero'), cache: 'no-store',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.message || 'No se pudo consultar el historial.');
  return d;
}
function accionesTicketHistorial(id) {
  const valido = window.MenuGoHistorialTicket?.idPagoValido(id);
  if (!valido) return '<span class="text-xs font-semibold text-slate-500">Sin ticket disponible</span>';
  return `<button type="button" data-ticket-accion="simular" data-pago="${valido}" class="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800">Reimprimir</button>`;
}
async function cargarHistorialPagos() {
  const t = document.getElementById('tabla-pagos');
  if (!t) return;
  const actual = ++solicitudHistorial;
  const q = new URLSearchParams();
  // El endpoint del commit 20 permite filtrar los pagos del cajero autenticado.
  q.set('mios', '1');
  const desde = document.getElementById('filtro-desde')?.value;
  const hasta = document.getElementById('filtro-hasta')?.value;
  const metodo = document.getElementById('filtro-metodo')?.value;
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  if (metodo) q.set('metodo', metodo);
  t.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-500">Buscando pagos...</td></tr>';
  try {
    const data = await apiHist(`/cajero/pagos?${q.toString()}`);
    if (actual !== solicitudHistorial) return;
    const pagos = Array.isArray(data.data) ? data.data : [];
    t.innerHTML = pagos.length ? pagos.map(p => `<tr class="border-t align-middle">
      <td class="p-3 font-black">#${eH(p.id_pago)}</td>
      <td class="p-3">${eH(fechaHistorial(p.fecha_pago))}</td>
      <td class="p-3">${eH(p.nombre_grupo || `Cuenta ${p.id_cuenta}`)}</td>
      <td class="p-3">${eH(p.metodo_pago)}</td>
      <td class="p-3">${eH(p.tipo_comprobante || '-')}</td>
      <td class="p-3">${eH(p.cajero_nombre || 'Cajero')}</td>
      <td class="p-3 text-right font-black text-emerald-700">${sH(p.monto)}</td>
      <td class="p-3">${accionesTicketHistorial(p.id_pago)}</td>
    </tr>`).join('') : '<tr><td colspan="8" class="p-8 text-center font-bold text-slate-500">No hay pagos de tu caja para esos filtros.</td></tr>';
  } catch (error) {
    if (actual !== solicitudHistorial) return;
    t.innerHTML = `<tr><td colspan="8" class="p-8 text-center font-semibold text-rose-800">${eH(error.message)}</td></tr>`;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  window.MenuGoHistorialTicket?.enlazarContenedor('tabla-pagos', 'historial_pagos.html');
  cargarHistorialPagos();
});
