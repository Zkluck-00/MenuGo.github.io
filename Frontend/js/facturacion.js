'use strict';
// Consulta de comprobantes internos: solo GET; no crea pagos ni nuevos comprobantes.
if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error('Acceso bloqueado.');

const API_FACT = window.MENUGO_API || 'http://localhost:4000/api';
const estadoFact = {
  tipo: '', desde: '', hasta: '', pagina: 1, limite: 24,
  mesVisible: '', solicitud: 0, solicitudCalendario: 0,
};
const elFact = id => document.getElementById(id);

function eF(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function sF(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? `S/ ${numero.toFixed(2)}` : 'S/ —';
}
function fechaComprobante(valor) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });
}
function fechaValidaFact(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  const t = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === fecha;
}
function fechaISOFact(date) { return date.toISOString().slice(0, 10); }
function fechaHoyPeru() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const parte = nombre => partes.find(x => x.type === nombre)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}
function fechaUTCFact(iso) { return new Date(`${iso}T12:00:00Z`); }
function inicioMesFact(iso) { return `${iso.slice(0, 7)}-01`; }
function finMesFact(iso) {
  const [anio, mes] = iso.split('-').map(Number);
  return fechaISOFact(new Date(Date.UTC(anio, mes, 0)));
}
function retrocederMesesFact(iso, cantidad) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const objetivo = new Date(Date.UTC(anio, mes - 1 - cantidad, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(dia, ultimo));
  return fechaISOFact(objetivo);
}
function fechasPeriodoFact(periodo, hoy) {
  const fechaHoy = fechaValidaFact(hoy) ? hoy : fechaHoyPeru();
  if (periodo === 'hoy') return { desde: fechaHoy, hasta: fechaHoy };
  if (periodo === 'semana') {
    const fecha = fechaUTCFact(fechaHoy);
    const dia = (fecha.getUTCDay() + 6) % 7; // Lunes como primer dia.
    fecha.setUTCDate(fecha.getUTCDate() - dia);
    return { desde: fechaISOFact(fecha), hasta: fechaHoy };
  }
  if (periodo === 'tres-meses') return { desde: retrocederMesesFact(fechaHoy, 3), hasta: fechaHoy };
  return { desde: inicioMesFact(fechaHoy), hasta: fechaHoy };
}
function descripcionPeriodoFact(desde, hasta) {
  if (desde === hasta) return desde.split('-').reverse().join('/');
  return `${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}`;
}
function fechaComprobanteISO(valor) {
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(f);
  const p = n => partes.find(x => x.type === n)?.value;
  return `${p('year')}-${p('month')}-${p('day')}`;
}
async function apiComprobantesFact(params) {
  const respuesta = await fetch(`${API_FACT}/cajero/comprobantes?${params.toString()}`, {
    method: 'GET', headers: headersAutenticadosPersonal('cajero'), cache: 'no-store',
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.ok === false) throw new Error(datos.message || 'No se pudo consultar los comprobantes.');
  return datos;
}
function actualizarBotonesFact() {
  for (const btn of document.querySelectorAll?.('[data-fact-tipo]') || []) {
    btn.setAttribute('aria-pressed', String((btn.dataset.factTipo || '') === estadoFact.tipo));
  }
  for (const btn of document.querySelectorAll?.('[data-periodo]') || []) {
    btn.setAttribute('aria-pressed', String(btn.dataset.periodo === estadoFact.periodo));
  }
  if (elFact('fact-desde')) elFact('fact-desde').value = estadoFact.desde;
  if (elFact('fact-hasta')) elFact('fact-hasta').value = estadoFact.hasta;
  if (elFact('fact-periodo-texto')) elFact('fact-periodo-texto').textContent = descripcionPeriodoFact(estadoFact.desde, estadoFact.hasta);
}
function mostrarMensajeFact(mensaje = '') {
  const el = elFact('mensaje-fechas-fact');
  if (el) el.textContent = mensaje;
}
function accionesTicketComprobante(id) {
  const valido = window.MenuGoHistorialTicket?.idPagoValido(id);
  if (!valido) return '<span class="text-xs font-semibold text-slate-500">Sin reimpresion disponible</span>';
  // Sin boton "Ver ticket": el cobro ofrece la impresion inmediata.
  return `<button type="button" data-ticket-accion="simular" data-pago="${valido}" class="mt-4 w-full rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs font-black text-white hover:bg-slate-800">Reimprimir comprobante</button>`;
}
function tarjetaComprobanteFact(c) {
  const tipo = String(c.tipo_comprobante || '').toLowerCase() === 'factura' ? 'Factura' : 'Boleta';
  const esFactura = tipo === 'Factura';
  return `<article class="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
    <div class="border-b border-slate-100 px-5 py-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="inline-flex rounded-lg ${esFactura ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'} px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">${tipo} · registro interno</span>
          <h3 class="mt-2 text-lg font-black text-slate-950">N.º ${eF(c.id_comprobante)}</h3>
          <p class="mt-1 text-xs font-semibold text-slate-500">${eF(fechaComprobante(c.fecha_emision))}</p>
        </div>
        <strong class="whitespace-nowrap text-lg font-black text-emerald-700">${sF(c.monto)}</strong>
      </div>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-5 py-4 text-xs">
      <dt class="font-bold text-slate-500">Pago</dt><dd class="text-right font-extrabold">#${eF(c.id_pago)}</dd>
      <dt class="font-bold text-slate-500">Documento</dt><dd class="break-words text-right font-bold">${eF(c.dni || c.ruc || 'No indicado')}</dd>
      ${c.razon_social ? `<dt class="font-bold text-slate-500">Razon social</dt><dd class="break-words text-right font-bold">${eF(c.razon_social)}</dd>` : ''}
      <dt class="font-bold text-slate-500">Metodo</dt><dd class="break-words text-right font-bold capitalize">${eF(String(c.metodo_pago || '').replaceAll('_', ' '))}</dd>
      <dt class="font-bold text-slate-500">Cajero</dt><dd class="break-words text-right font-bold">${eF(c.cajero_nombre || 'No registrado')}</dd>
    </dl>
    <div class="border-t border-slate-100 px-5 pb-4">${accionesTicketComprobante(c.id_pago)}</div>
  </article>`;
}
function resultadoPaginacionFact(total, pagina, limite, cantidad) {
  const max = Math.max(1, Math.ceil(total / limite));
  const anterior = elFact('fact-pagina-anterior');
  const siguiente = elFact('fact-pagina-siguiente');
  if (anterior) anterior.disabled = pagina <= 1;
  if (siguiente) siguiente.disabled = pagina >= max;
  if (elFact('fact-paginacion-texto')) elFact('fact-paginacion-texto').textContent = `Pagina ${pagina} de ${max}`;
  if (elFact('fact-cantidad-pagina')) elFact('fact-cantidad-pagina').textContent = `${cantidad} en esta pagina`;
}
async function consultarComprobantesFact() {
  const lista = elFact('lista-comprobantes');
  if (!lista) return;
  if (!fechaValidaFact(estadoFact.desde) || !fechaValidaFact(estadoFact.hasta) || estadoFact.desde > estadoFact.hasta) {
    mostrarMensajeFact('Selecciona un rango de fechas valido. La fecha inicial no puede ser posterior a la final.');
    return;
  }
  mostrarMensajeFact();
  actualizarBotonesFact();
  const solicitud = ++estadoFact.solicitud;
  lista.innerHTML = '<p class="col-span-full rounded-2xl bg-white p-6 text-sm font-bold text-slate-500">Consultando comprobantes...</p>';
  const params = new URLSearchParams({
    desde: estadoFact.desde, hasta: estadoFact.hasta,
    pagina: String(estadoFact.pagina), limite: String(estadoFact.limite),
  });
  if (estadoFact.tipo) params.set('tipo', estadoFact.tipo);
  try {
    const datos = await apiComprobantesFact(params);
    if (solicitud !== estadoFact.solicitud) return;
    const registros = Array.isArray(datos.data) ? datos.data : [];
    const total = Math.max(0, Number(datos.total) || 0);
    const limite = Math.max(1, Number(datos.limite) || estadoFact.limite);
    const max = Math.max(1, Math.ceil(total / limite));
    if (estadoFact.pagina > max) {
      estadoFact.pagina = max;
      return consultarComprobantesFact();
    }
    lista.innerHTML = registros.length
      ? registros.map(tarjetaComprobanteFact).join('')
      : '<p class="col-span-full rounded-[22px] border border-slate-200 bg-white px-6 py-12 text-center text-sm font-bold text-slate-500">No hay comprobantes registrados para este periodo. Prueba otra fecha en el calendario.</p>';
    if (elFact('fact-total')) elFact('fact-total').textContent = String(total);
    if (elFact('fact-monto')) elFact('fact-monto').textContent = sF(datos.monto_total || 0);
    resultadoPaginacionFact(total, estadoFact.pagina, limite, registros.length);
  } catch (error) {
    if (solicitud !== estadoFact.solicitud) return;
    lista.innerHTML = `<p class="col-span-full rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-sm font-semibold text-rose-800">${eF(error.message)}</p>`;
    if (elFact('fact-total')) elFact('fact-total').textContent = '—';
    if (elFact('fact-monto')) elFact('fact-monto').textContent = '—';
  }
}
function renderizarCalendarioFact(resumen = []) {
  const grid = elFact('calendario-grid');
  if (!grid) return;
  const iso = `${estadoFact.mesVisible}-01`;
  const [anio, mes] = estadoFact.mesVisible.split('-').map(Number);
  const inicioSemana = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const cantidades = new Map(resumen.map(r => [String(r.fecha).slice(0, 10), Math.max(0, Number(r.cantidad) || 0)]));
  const hoy = fechaHoyPeru();
  const seleccionado = estadoFact.desde === estadoFact.hasta ? estadoFact.desde : null;
  let html = Array.from({length: inicioSemana}, () => '<span aria-hidden="true"></span>').join('');
  for (let dia = 1; dia <= dias; dia++) {
    const fecha = `${estadoFact.mesVisible}-${String(dia).padStart(2, '0')}`;
    const cantidad = cantidades.get(fecha) || 0;
    html += `<button type="button" data-fecha="${fecha}" data-hoy="${fecha === hoy}" aria-label="${dia}: ${cantidad} comprobante${cantidad === 1 ? '' : 's'}" aria-pressed="${fecha === seleccionado}" class="cal-dia flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white px-1 py-1.5 text-xs font-semibold hover:bg-orange-50">
      <span class="cal-numero">${dia}</span>
      ${cantidad ? `<span class="mt-1 min-w-4 rounded-full bg-orange-500 px-1 text-[9px] font-black text-white">${cantidad > 99 ? '99+' : cantidad}</span>` : '<span class="mt-1 h-3" aria-hidden="true"></span>'}
    </button>`;
  }
  grid.innerHTML = html;
  const titulo = elFact('cal-titulo');
  if (titulo) titulo.textContent = fechaUTCFact(iso).toLocaleDateString('es-PE', {timeZone:'UTC', month:'long', year:'numeric'});
  const estado = elFact('cal-estado');
  if (estado) estado.textContent = `${resumen.reduce((a,x) => a + Number(x.cantidad || 0), 0)} comprobante(s) en el mes mostrado`;
}
async function cargarCalendarioFact() {
  if (!estadoFact.mesVisible || !elFact('calendario-grid')) return;
  const solicitud = ++estadoFact.solicitudCalendario;
  const mes = estadoFact.mesVisible;
  const params = new URLSearchParams({
    resumen: 'calendario', desde: `${mes}-01`, hasta: finMesFact(`${mes}-01`),
  });
  if (estadoFact.tipo) params.set('tipo', estadoFact.tipo);
  const est = elFact('cal-estado');
  if (est) est.textContent = 'Consultando calendario...';
  try {
    const datos = await apiComprobantesFact(params);
    if (solicitud !== estadoFact.solicitudCalendario) return;
    renderizarCalendarioFact(Array.isArray(datos.data) ? datos.data : []);
  } catch (error) {
    if (solicitud !== estadoFact.solicitudCalendario) return;
    renderizarCalendarioFact();
    if (est) est.textContent = `Calendario no disponible: ${error.message}`;
  }
}
function consultarPeriodoFact(periodo) {
  const p = fechasPeriodoFact(periodo, fechaHoyPeru());
  estadoFact.desde = p.desde;
  estadoFact.hasta = p.hasta;
  estadoFact.pagina = 1;
  estadoFact.periodo = periodo;
  estadoFact.mesVisible = fechaHoyPeru().slice(0, 7);
  actualizarBotonesFact();
  consultarComprobantesFact();
  cargarCalendarioFact();
}
function cambiarTipoFact(tipo) {
  estadoFact.tipo = ['boleta','factura'].includes(tipo) ? tipo : '';
  estadoFact.pagina = 1;
  actualizarBotonesFact();
  consultarComprobantesFact();
  cargarCalendarioFact();
}
// Se conserva la funcion publica para cualquier enlace previo de MenuGo.
function cargarComprobantes(tipo = '') { cambiarTipoFact(tipo); }
function moverMesFact(delta) {
  const mes = fechaUTCFact(`${estadoFact.mesVisible}-01`);
  mes.setUTCMonth(mes.getUTCMonth() + delta);
  estadoFact.mesVisible = fechaISOFact(mes).slice(0, 7);
  cargarCalendarioFact();
}
function enlazarFacturacion() {
  if (!elFact('lista-comprobantes')) return;
  window.MenuGoHistorialTicket?.enlazarContenedor('lista-comprobantes', 'facturacion.html');
  elFact('fact-filtros-tipo')?.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-fact-tipo]');
    if (boton) cambiarTipoFact(boton.dataset.factTipo || '');
  });
  elFact('fact-periodos')?.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-periodo]');
    if (boton) consultarPeriodoFact(boton.dataset.periodo);
  });
  elFact('form-fechas-fact')?.addEventListener('submit', evento => {
    evento.preventDefault();
    const desde = elFact('fact-desde')?.value || '';
    const hasta = elFact('fact-hasta')?.value || '';
    if (!fechaValidaFact(desde) || !fechaValidaFact(hasta) || desde > hasta) {
      mostrarMensajeFact('Elige fechas validas; desde no puede ser posterior a hasta.');
      return;
    }
    estadoFact.desde = desde;
    estadoFact.hasta = hasta;
    estadoFact.pagina = 1;
    estadoFact.periodo = 'personalizado';
    estadoFact.mesVisible = desde.slice(0, 7);
    consultarComprobantesFact();
    cargarCalendarioFact();
  });
  elFact('calendario-grid')?.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-fecha]');
    const fecha = boton?.dataset.fecha;
    if (!fechaValidaFact(fecha)) return;
    estadoFact.desde = fecha;
    estadoFact.hasta = fecha;
    estadoFact.pagina = 1;
    estadoFact.periodo = 'dia';
    consultarComprobantesFact();
    cargarCalendarioFact();
  });
  elFact('cal-anterior')?.addEventListener('click', () => moverMesFact(-1));
  elFact('cal-siguiente')?.addEventListener('click', () => moverMesFact(1));
  elFact('fact-pagina-anterior')?.addEventListener('click', () => {
    if (estadoFact.pagina > 1) { estadoFact.pagina--; consultarComprobantesFact(); }
  });
  elFact('fact-pagina-siguiente')?.addEventListener('click', () => {
    if (!elFact('fact-pagina-siguiente')?.disabled) { estadoFact.pagina++; consultarComprobantesFact(); }
  });
  consultarPeriodoFact('mes');
}
document.addEventListener('DOMContentLoaded', enlazarFacturacion);
