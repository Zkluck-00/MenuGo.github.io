if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error('Acceso bloqueado. Inicia sesion como Cajero.');

const API_CAJA = window.MENUGO_API || 'http://localhost:4000/api';
let filtroCaja = new URLSearchParams(window.location.search).get('filtro') || 'todas';
let cuentasCaja = [];
let pagosCaja = [];
let resumenCaja = {};

function solesCaja(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }
function normalizarCaja(valor) { return String(valor || '').trim().toLowerCase(); }
function escapeCaja(valor) { return String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function fechaCaja(valor) { return valor ? new Date(valor).toLocaleString('es-PE') : '-'; }

async function apiCaja(path, options = {}) {
  const response = await fetch(`${API_CAJA}${path}`, {
    ...options,
    headers: headersAutenticadosPersonal('cajero', options.headers || {})
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('menugo_cajero_sesion');
    window.location.replace('login.html?access=required');
    throw new Error('Sesion vencida.');
  }
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Error de servidor');
  return data;
}

async function cargarDatosCaja() {
  const [resumen, cuentas, pagos] = await Promise.all([
    apiCaja('/cajero/resumen'),
    apiCaja('/cajero/cuentas'),
    apiCaja('/cajero/pagos?mios=1')
  ]);
  resumenCaja = resumen.data || {};
  cuentasCaja = cuentas.data || [];
  pagosCaja = pagos.data || [];
}

async function recargarCaja() {
  const contenedor = document.getElementById('contenedor-cuentas');
  if (contenedor) contenedor.innerHTML = '<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando informacion de caja...</div>';
  try {
    await cargarDatosCaja();
    renderEstadisticasCaja();
    renderAlertasCaja();
    cambiarFiltroCuentas(filtroCaja, false);
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-xl font-black">No se pudo cargar Caja</h2><p class="mt-2 text-sm font-semibold">${escapeCaja(error.message)}</p></div>`;
  }
}

function renderEstadisticasCaja() {
  const metodos = resumenCaja.por_metodo || {};
  const digital = Number(metodos.yape || 0) + Number(metodos.plin || 0) + Number(metodos.tarjeta_credito || 0) + Number(metodos.tarjeta_debito || 0);
  document.getElementById('stat-pendientes').textContent = resumenCaja.cuentas_listas || 0;
  document.getElementById('stat-cobradas').textContent = resumenCaja.pagos_hoy_cajero || 0;
  document.getElementById('stat-efectivo').textContent = solesCaja(metodos.efectivo || 0);
  document.getElementById('stat-tarjeta').textContent = solesCaja(digital);
  document.getElementById('stat-total').textContent = solesCaja(resumenCaja.total_hoy_cajero || 0);
}

function renderAlertasCaja() {
  const box = document.getElementById('alertas-pagos-pendientes');
  const solicitadas = cuentasCaja.filter((c) => c.solicitud_cuenta);
  if (!box) return;
  if (!solicitadas.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3"><div><p class="font-black text-orange-900">${solicitadas.length} solicitud(es) de cuenta esperan en Caja</p><p class="mt-1 text-sm font-semibold text-orange-800">Prioriza las mesas que ya tienen todos sus productos entregados.</p></div><button onclick="cambiarFiltroCuentas('solicitadas')" class="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white">Ver solicitudes</button></div>`;
}

function cambiarFiltroCuentas(filtro, actualizarBotones = true) {
  filtroCaja = filtro || 'todas';
  if (actualizarBotones) {
    const url = new URL(window.location.href);
    url.searchParams.set('filtro', filtroCaja);
    history.replaceState({}, '', url);
  }
  document.querySelectorAll('.filtro-cuenta').forEach((btn) => {
    const activo = btn.dataset.filtro === filtroCaja;
    btn.className = activo
      ? 'filtro-cuenta rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white'
      : 'filtro-cuenta rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100';
  });
  renderContenidoCaja();
}

function renderContenidoCaja() {
  if (filtroCaja === 'cobradas') return renderPagosRecientesCaja();
  let lista = [...cuentasCaja];
  if (filtroCaja === 'listas') lista = lista.filter((c) => c.lista_para_cobro);
  if (filtroCaja === 'solicitadas') lista = lista.filter((c) => c.solicitud_cuenta);
  if (filtroCaja === 'llevar') lista = lista.filter((c) => c.es_llevar);
  renderCuentasCaja(lista);
}

function renderCuentasCaja(lista) {
  const contenedor = document.getElementById('contenedor-cuentas');
  if (!contenedor) return;
  if (!lista.length) {
    contenedor.innerHTML = '<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 class="text-xl font-black text-slate-800">No hay cuentas en esta vista</h2><p class="mt-2 text-sm font-semibold text-slate-500">Caja se actualiza cuando se entregan pedidos o el cliente solicita la cuenta.</p></div>';
    return;
  }

  contenedor.innerHTML = lista.map((cuenta) => {
    const noListos = (cuenta.detalles || []).filter((d) => !d.puede_pagarse).length;
    const solicitud = cuenta.solicitud_cuenta;
    return `<article class="rounded-3xl border ${solicitud ? 'border-orange-300' : 'border-slate-200'} bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-black uppercase tracking-wide ${cuenta.es_llevar ? 'text-blue-600' : 'text-slate-500'}">${cuenta.es_llevar ? 'Pedido para llevar' : 'Cuenta de mesa'}</p>
          <h2 class="mt-1 text-2xl font-black text-slate-950">${escapeCaja(cuenta.etiqueta)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${cuenta.mesas?.length ? cuenta.mesas.map((m) => `Mesa ${m}`).join(', ') : 'Sin mesa asignada'}</p>
        </div>
        <span class="rounded-full ${cuenta.lista_para_cobro ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} px-3 py-1.5 text-xs font-black">${cuenta.lista_para_cobro ? 'Lista para cobrar' : 'Esperando entrega'}</span>
      </div>
      ${solicitud ? `<div class="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-3"><p class="text-sm font-black text-orange-800">Cliente solicito la cuenta</p><p class="mt-1 text-xs font-semibold text-orange-700">${escapeCaja(solicitud.nota || '')} · ${fechaCaja(solicitud.fecha_solicitud)}</p></div>` : ''}
      <div class="mt-4 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-[11px] font-black uppercase text-slate-500">Total</p><p class="mt-1 font-black">${solesCaja(cuenta.total)}</p></div>
        <div class="rounded-2xl bg-emerald-50 p-3"><p class="text-[11px] font-black uppercase text-emerald-700">Pagado</p><p class="mt-1 font-black text-emerald-700">${solesCaja(cuenta.total_pagado)}</p></div>
        <div class="rounded-2xl bg-orange-50 p-3"><p class="text-[11px] font-black uppercase text-orange-700">Pendiente</p><p class="mt-1 font-black text-orange-700">${solesCaja(cuenta.total_pendiente)}</p></div>
      </div>
      ${noListos ? `<p class="mt-3 text-xs font-bold text-amber-700">${noListos} producto(s) aun no estan habilitados para cobro.</p>` : ''}
      <div class="mt-4 flex gap-2">
        <button ${cuenta.lista_para_cobro ? '' : 'disabled'} onclick="abrirCobroCaja('${cuenta.id_cuenta}')" class="flex-1 rounded-2xl ${cuenta.lista_para_cobro ? 'bg-slate-950 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300'} px-4 py-3 text-sm font-black text-white">${cuenta.lista_para_cobro ? 'Cobrar en caja' : 'Esperar entrega'}</button>
        ${solicitud ? `<button onclick="atenderSolicitudCaja('${solicitud.id_solicitud}')" class="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700 hover:bg-orange-100">Atender</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

function renderPagosRecientesCaja() {
  const contenedor = document.getElementById('contenedor-cuentas');
  if (!contenedor) return;
  const lista = pagosCaja.slice(0, 30);
  if (!lista.length) {
    contenedor.innerHTML = '<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center font-bold text-slate-500">Este cajero aun no registra cobros.</div>';
    return;
  }
  contenedor.innerHTML = lista.map((p) => `<article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase text-emerald-600">Pago #${p.id_pago}</p><h2 class="mt-1 text-xl font-black">${escapeCaja(p.nombre_grupo || `Cuenta ${p.id_cuenta}`)}</h2></div><strong class="text-xl text-emerald-600">${solesCaja(p.monto)}</strong></div>
    <p class="mt-3 text-sm font-semibold text-slate-600">${escapeCaja(p.metodo_pago)} · ${escapeCaja(p.tipo_comprobante || 'sin comprobante')}</p>
    <p class="mt-1 text-xs text-slate-500">${fechaCaja(p.fecha_pago)} · ${escapeCaja(p.pagado_por || 'Cliente')}</p>
  </article>`).join('');
}

function abrirCobroCaja(idCuenta) {
  const cuenta = cuentasCaja.find((c) => String(c.id_cuenta) === String(idCuenta));
  if (!cuenta || !cuenta.lista_para_cobro) return alert('La cuenta aun no esta lista para cobrar.');
  const panel = document.getElementById('panel-cobro');
  const contenido = document.getElementById('contenido-cobro');
  const items = (cuenta.detalles || []).filter((d) => d.puede_pagarse && Number(d.monto_pendiente || 0) > 0);

  contenido.innerHTML = `<div class="border-b border-slate-200 p-5"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-orange-600">Cobro por Caja</p><h2 class="mt-1 text-3xl font-black">${escapeCaja(cuenta.etiqueta)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">Saldo: ${solesCaja(cuenta.total_pendiente)}</p></div><button onclick="cerrarCobroCaja()" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black">Cerrar</button></div></div>
  <div class="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_390px]">
    <section class="rounded-3xl border border-slate-200 p-4">
      <div class="mb-3 flex items-center justify-between gap-3"><h3 class="font-black">Productos a cobrar</h3><button onclick="seleccionarTodosCaja()" type="button" class="text-xs font-black text-orange-600">Seleccionar todos</button></div>
      <div>${items.map((item) => `<label class="flex items-start gap-3 border-b border-slate-100 py-3"><input type="checkbox" class="item-cobro-caja mt-1 h-5 w-5" data-id="${item.id_detalle_producto}" data-monto="${item.monto_pendiente}" checked onchange="actualizarTotalCobroCaja()"><span class="flex-1"><strong>${escapeCaja(item.nombre)}</strong><br><small class="text-slate-500">${escapeCaja(item.observacion || `Pedido #${item.id_pedido}`)}</small></span><strong>${solesCaja(item.monto_pendiente)}</strong></label>`).join('')}</div>
    </section>
    <form onsubmit="registrarPagoCaja(event, '${cuenta.id_cuenta}')" class="rounded-3xl bg-slate-50 p-4">
      <div class="rounded-2xl bg-white p-4 text-center"><p class="text-xs font-black uppercase text-slate-500">Total seleccionado</p><p id="total-cobro-caja" class="mt-1 text-3xl font-black text-slate-950">${solesCaja(cuenta.total_pendiente)}</p></div>
      <label class="mt-4 block"><span class="text-xs font-black uppercase text-slate-500">Metodo de pago</span><select id="metodo-cobro-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" onchange="actualizarCamposPagoCaja()"><option value="Efectivo">Efectivo</option><option value="Yape">Yape</option><option value="Plin">Plin</option><option value="Tarjeta credito">Tarjeta credito</option><option value="Tarjeta debito">Tarjeta debito</option></select></label>
      <div id="campos-pago-caja" class="mt-3"></div>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Pagado por</span><input id="pagado-por-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" value="Cliente" /></label>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Mesa/persona pagadora (opcional)</span><input id="mesa-pagadora-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" placeholder="Ej. Mesa 4 o Invitado" /></label>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Comprobante</span><select id="comprobante-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" onchange="actualizarComprobanteCaja()"><option value="boleta">Boleta</option><option value="factura">Factura</option></select></label>
      <div id="datos-comprobante-caja" class="mt-3"></div>
      <button class="mt-5 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">Registrar cobro</button>
    </form>
  </div>`;
  panel.classList.remove('hidden');
  actualizarCamposPagoCaja();
  actualizarComprobanteCaja();
  actualizarTotalCobroCaja();
}

function cerrarCobroCaja() {
  document.getElementById('panel-cobro')?.classList.add('hidden');
  const contenido = document.getElementById('contenido-cobro');
  if (contenido) contenido.innerHTML = '';
}

function itemsCobroCaja() {
  return Array.from(document.querySelectorAll('.item-cobro-caja:checked')).map((i) => ({ id_detalle_producto: Number(i.dataset.id), monto: Number(i.dataset.monto) }));
}

function totalSeleccionadoCaja() { return itemsCobroCaja().reduce((s, i) => s + Number(i.monto || 0), 0); }
function seleccionarTodosCaja() { document.querySelectorAll('.item-cobro-caja').forEach((i) => { i.checked = true; }); actualizarTotalCobroCaja(); }
function actualizarTotalCobroCaja() {
  const total = totalSeleccionadoCaja();
  const el = document.getElementById('total-cobro-caja');
  if (el) el.textContent = solesCaja(total);
  actualizarVueltoCaja();
}

function actualizarCamposPagoCaja() {
  const metodo = document.getElementById('metodo-cobro-caja')?.value || 'Efectivo';
  const box = document.getElementById('campos-pago-caja');
  if (!box) return;
  if (metodo === 'Efectivo') {
    box.innerHTML = `<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><label class="block"><span class="text-xs font-black uppercase text-emerald-700">Monto recibido</span><input id="monto-recibido-caja" type="number" min="0" step="0.10" class="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 font-bold" oninput="actualizarVueltoCaja()"></label><p class="mt-2 text-sm font-bold text-emerald-800">Vuelto: <span id="vuelto-caja">S/ 0.00</span></p></div>`;
    const input = document.getElementById('monto-recibido-caja');
    if (input) input.value = totalSeleccionadoCaja().toFixed(2);
    actualizarVueltoCaja();
  } else {
    box.innerHTML = `<div class="rounded-2xl border border-purple-200 bg-purple-50 p-3"><label class="block"><span class="text-xs font-black uppercase text-purple-700">Codigo/referencia de aprobacion</span><input id="referencia-pago-caja" maxlength="30" class="mt-1 w-full rounded-xl border border-purple-200 bg-white px-3 py-2 font-bold" placeholder="Codigo de operacion"></label></div>`;
  }
}

function actualizarVueltoCaja() {
  const input = document.getElementById('monto-recibido-caja');
  const span = document.getElementById('vuelto-caja');
  if (!input || !span) return;
  span.textContent = solesCaja(Math.max(Number(input.value || 0) - totalSeleccionadoCaja(), 0));
}

function actualizarComprobanteCaja() {
  const tipo = document.getElementById('comprobante-caja')?.value || 'boleta';
  const box = document.getElementById('datos-comprobante-caja');
  if (!box) return;
  box.innerHTML = tipo === 'factura'
    ? `<label class="block"><span class="text-xs font-black uppercase text-slate-500">RUC</span><input id="documento-caja" inputmode="numeric" maxlength="11" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" placeholder="11 digitos"></label><label class="mt-2 block"><span class="text-xs font-black uppercase text-slate-500">Razon social</span><input id="razon-social-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"></label>`
    : `<label class="block"><span class="text-xs font-black uppercase text-slate-500">DNI</span><input id="documento-caja" inputmode="numeric" maxlength="8" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" placeholder="8 digitos"></label>`;
  document.getElementById('documento-caja')?.addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
}

async function registrarPagoCaja(event, idCuenta) {
  event.preventDefault();
  const items = itemsCobroCaja();
  const total = totalSeleccionadoCaja();
  if (!items.length || total <= 0) return alert('Selecciona al menos un producto pendiente.');

  const metodo = document.getElementById('metodo-cobro-caja')?.value || 'Efectivo';
  let referencia = '';
  if (metodo === 'Efectivo') {
    const recibido = Number(document.getElementById('monto-recibido-caja')?.value || 0);
    if (recibido < total) return alert('El monto recibido no puede ser menor al total seleccionado.');
  } else {
    referencia = document.getElementById('referencia-pago-caja')?.value.trim() || '';
    if (!referencia) return alert('Ingresa la referencia o codigo de aprobacion del pago.');
  }

  const tipo = document.getElementById('comprobante-caja')?.value || 'boleta';
  const documento = (document.getElementById('documento-caja')?.value || '').replace(/\D/g, '');
  if (tipo === 'boleta' && documento.length !== 8) return alert('Ingresa un DNI de 8 digitos.');
  if (tipo === 'factura' && documento.length !== 11) return alert('Ingresa un RUC de 11 digitos.');
  const razon = document.getElementById('razon-social-caja')?.value.trim() || '';
  if (tipo === 'factura' && !razon) return alert('Ingresa la razon social.');

  try {
    await apiCaja(`/cajero/cuentas/${encodeURIComponent(idCuenta)}/pagos`, {
      method: 'POST',
      body: JSON.stringify({
        metodo_pago: metodo,
        detalles: items,
        tipo_comprobante: tipo,
        dni: tipo === 'boleta' ? documento : undefined,
        ruc: tipo === 'factura' ? documento : undefined,
        razon_social: tipo === 'factura' ? razon : undefined,
        pagado_por: document.getElementById('pagado-por-caja')?.value || 'Cliente',
        mesa_pagadora: document.getElementById('mesa-pagadora-caja')?.value || null,
        referencia: referencia || null
      })
    });
    cerrarCobroCaja();
    mostrarNotificacionCaja('Pago registrado correctamente por Caja.');
    await recargarCaja();
  } catch (error) {
    alert(`No se pudo registrar el pago: ${error.message}`);
  }
}

async function atenderSolicitudCaja(idSolicitud) {
  try {
    await apiCaja(`/cajero/solicitudes/${encodeURIComponent(idSolicitud)}/atender`, { method: 'PATCH', body: '{}' });
    mostrarNotificacionCaja('Solicitud marcada como atendida.');
    await recargarCaja();
  } catch (error) {
    alert(error.message);
  }
}

function mostrarNotificacionCaja(texto) {
  const box = document.getElementById('notificaciones-caja');
  if (!box) return;
  box.textContent = texto;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 4500);
}

function iniciarTiempoRealCaja() {
  if (!window.realTime) return;
  realTime.connect();
  const refrescar = () => recargarCaja();
  realTime.on('pedido:actualizado', refrescar);
  realTime.on('cuenta:actualizada', refrescar);
  realTime.on('pago:registrado', refrescar);
}

document.addEventListener('DOMContentLoaded', () => {
  recargarCaja();
  iniciarTiempoRealCaja();
  setInterval(recargarCaja, 30000);
});
