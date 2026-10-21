'use strict';

// MenuGo - Commit 19: interfaz de cuentas divididas para el rol Cajero.
// Los saldos/precios oficiales y permisos se validan en PostgreSQL (commits 17 y 18).
// No guarda pagos locales ni duplica movimientos de caja.
const API_SUBCUENTAS_CAJA = window.MENUGO_API || 'http://localhost:4000/api';
const ALMACEN_REINTENTO_SUB = 'menugo_subcuenta_pago_pendiente_v1';
const estadoSub = {
  cuentas: [],
  idCuenta: null,
  detalle: null,
  turno: null,
  idPersonaPago: null,
  ocupado: false,
  cargando: false,
  pagoPendiente: null,
};

function elementoSub(id) { return document.getElementById(id); }
function escaparSub(valor) {
  return String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function idSeguroSub(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 && /^\d+$/.test(String(valor)) ? id : null;
}

// NUMERIC(12,2): calcular en centimos, sin sumas flotantes de 0.1 + 0.2.
function centimosSub(valor, aceptarCero = true) {
  if (!['number', 'string'].includes(typeof valor)) return null;
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const [entera, decimal = ''] = texto.split('.');
  const total = Number(entera) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(total) || total > 999999999999 || (!aceptarCero && total === 0)) return null;
  return total;
}
function cantidadValidaSub(valor) {
  return valor === '' || /^\d+(?:\.\d{1,3})?$/.test(valor) && Number(valor) > 0 && Number(valor) < 10000000;
}
function monedaCentimosSub(centimos) {
  return `S/ ${(Number(centimos) / 100).toFixed(2)}`;
}
function monedaSub(valor) {
  return monedaCentimosSub(centimosSub(valor) ?? 0);
}
function importeFijoSub(centimos) {
  return (centimos / 100).toFixed(2);
}
function mensajeSub(texto, tipo = 'info') {
  const nodo = elementoSub('mensaje-sub');
  if (!nodo) return;
  const clases = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  nodo.textContent = texto;
  nodo.className = `mb-5 rounded-2xl border p-4 text-sm font-semibold ${clases[tipo] || clases.info}`;
  nodo.classList.toggle('hidden', !texto);
}

async function apiSub(ruta, options = {}) {
  const respuesta = await fetch(`${API_SUBCUENTAS_CAJA}${ruta}`, {
    ...options,
    headers: headersAutenticadosPersonal('cajero', options.headers || {}),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    localStorage.removeItem('menugo_cajero_sesion');
    window.location.replace('login.html?access=required');
    const error = new Error('Sesion vencida. Inicia sesion nuevamente.');
    error.status = 401;
    throw error;
  }
  if (!respuesta.ok || datos.ok === false) {
    const error = new Error(datos.message || 'No se pudo completar la solicitud.');
    error.status = respuesta.status;
    error.code = datos.code || null;
    throw error;
  }
  return datos;
}

function cuentaActualSub() {
  return estadoSub.cuentas.find(c => Number(c.id_cuenta) === estadoSub.idCuenta) || null;
}
function personaActualSub(idPersona = estadoSub.idPersonaPago) {
  return (estadoSub.detalle?.subcuentas || []).find(p => Number(p.id_subcuenta) === Number(idPersona)) || null;
}
function productoActualSub(idProducto) {
  return (estadoSub.detalle?.productos || []).find(p => Number(p.id_detalle_producto) === Number(idProducto)) || null;
}
function saldoLibreSub(producto) {
  return Math.max(centimosSub(producto?.disponible_para_asignar) ?? 0, 0);
}
function productoEntregadoSub(producto) {
  if (!producto) return false;
  const detalle = (cuentaActualSub()?.detalles || []).find(
    d => Number(d.id_detalle_producto) === Number(producto.id_detalle_producto)
  );
  if (detalle) return detalle.puede_pagarse === true;
  const estado = String(producto.estado_pedido || '').toLowerCase();
  return estado === 'entregado' || (cuentaActualSub()?.es_llevar && estado === 'listo');
}
function asignacionListaSub(asignacion) {
  return (centimosSub(asignacion.monto_pendiente) ?? 0) > 0 &&
    productoEntregadoSub(productoActualSub(asignacion.id_detalle_producto));
}
function resumenCuentaSub() {
  const participantes = estadoSub.detalle?.subcuentas || [];
  const productos = estadoSub.detalle?.productos || [];
  return {
    asignado: participantes.reduce((s, p) => s + (centimosSub(p.total_asignado) ?? 0), 0),
    pagado: participantes.reduce((s, p) => s + (centimosSub(p.total_pagado) ?? 0), 0),
    libre: productos.reduce((s, p) => s + saldoLibreSub(p), 0),
    pendiente: centimosSub(cuentaActualSub()?.total_pendiente) ?? 0,
  };
}

function obtenerCajeroSub() {
  const sesion = typeof obtenerSesionPersonal === 'function' ? obtenerSesionPersonal('cajero') : null;
  return idSeguroSub(sesion?.id_trabajador);
}
function recuperarPendienteSub() {
  try {
    const intento = JSON.parse(sessionStorage.getItem(ALMACEN_REINTENTO_SUB) || 'null');
    if (intento && idSeguroSub(intento.id_cajero) === obtenerCajeroSub() &&
        idSeguroSub(intento.id_cuenta) && idSeguroSub(intento.id_subcuenta) &&
        typeof intento.datos?.idempotency_key === 'string' &&
        intento.datos.idempotency_key.length >= 16) {
      estadoSub.pagoPendiente = intento;
    } else {
      sessionStorage.removeItem(ALMACEN_REINTENTO_SUB);
    }
  } catch (_) { sessionStorage.removeItem(ALMACEN_REINTENTO_SUB); }
}
function guardarPendienteSub(intento) {
  estadoSub.pagoPendiente = intento;
  try { sessionStorage.setItem(ALMACEN_REINTENTO_SUB, JSON.stringify(intento)); }
  catch (_) { /* Sigue conservado en memoria mientras la pestaña este abierta. */ }
}
function borrarPendienteSub() {
  estadoSub.pagoPendiente = null;
  try { sessionStorage.removeItem(ALMACEN_REINTENTO_SUB); } catch (_) {}
}
function mostrarPendienteSub() {
  const intento = estadoSub.pagoPendiente;
  elementoSub('aviso-pendiente-sub')?.classList.toggle('hidden', !intento);
  const texto = elementoSub('descripcion-pendiente-sub');
  if (texto) texto.textContent = intento
    ? `Cuenta #${intento.id_cuenta}, participante #${intento.id_subcuenta}. Clave conservada para el mismo intento de cobro.`
    : '';
  const reintentar = elementoSub('btn-reintentar-sub');
  if (reintentar) reintentar.disabled = !intento || estadoSub.ocupado;
  bloquearFormulariosSub();
}
function bloquearFormulariosSub() {
  const bloquear = estadoSub.ocupado || Boolean(estadoSub.pagoPendiente);
  const hayCuenta = Boolean(estadoSub.detalle);
  for (const id of ['btn-crear-persona-sub', 'btn-guardar-asignacion-sub']) {
    const btn = elementoSub(id);
    if (btn) btn.disabled = bloquear || !hayCuenta;
  }
  const camposAsignacion = elementoSub('campos-asignacion-sub');
  if (camposAsignacion) camposAsignacion.disabled = bloquear || !hayCuenta ||
    !(estadoSub.detalle.subcuentas || []).some(p => p.estado === 'pendiente' && (centimosSub(p.total_pagado) ?? 0) === 0);
  const camposPago = elementoSub('campos-pago-sub');
  if (camposPago) camposPago.disabled = bloquear || !estadoSub.turno || !estadoSub.idPersonaPago;
  const botonPago = elementoSub('btn-registrar-pago-sub');
  if (botonPago) botonPago.disabled = bloquear || !estadoSub.turno || totalSeleccionadoSub() === 0;
}

function opcionesCuentasSub() {
  const selector = elementoSub('selector-cuenta-sub');
  if (!selector) return;
  const opciones = ['<option value="">Selecciona una cuenta...</option>'];
  for (const c of estadoSub.cuentas) {
    const nombre = `${c.etiqueta || 'Cuenta ' + c.id_cuenta} · ${
      (c.mesas || []).length ? (c.mesas || []).map(m => `Mesa ${m}`).join(', ') : 'Para llevar'
    } · ${monedaSub(c.total_pendiente)}`;
    opciones.push(`<option value="${idSeguroSub(c.id_cuenta)}">${escaparSub(nombre)}</option>`);
  }
  selector.innerHTML = opciones.join('');
  selector.value = estadoSub.idCuenta ? String(estadoSub.idCuenta) : '';
}

function renderProductosSub() {
  const lista = elementoSub('lista-productos-sub');
  const productos = estadoSub.detalle?.productos || [];
  if (!lista) return;
  elementoSub('contador-productos-sub').textContent = `${productos.length} producto(s)`;
  if (!productos.length) {
    lista.innerHTML = '<p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Esta cuenta no tiene productos pendientes o distribuibles.</p>';
    return;
  }
  lista.innerHTML = productos.map(p => {
    const libre = saldoLibreSub(p);
    const entregado = productoEntregadoSub(p);
    const reservado = centimosSub(p.total_asignado) ?? 0;
    const id = idSeguroSub(p.id_detalle_producto);
    return `<article class="rounded-2xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="break-words font-black">${escaparSub(p.nombre || 'Producto')}</h3>
          <p class="mt-1 text-xs text-slate-500">Producto #${id} · Pedido #${escaparSub(p.id_pedido)}</p>
          <span class="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${entregado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${entregado ? 'Entregado / cobrable' : 'Aun en Cocina / no cobrable'}</span>
        </div>
        <div class="text-right"><p class="text-xs font-bold text-slate-500">Libre para asignar</p><p class="text-lg font-black text-blue-700">${monedaCentimosSub(libre)}</p></div>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span>Subtotal: ${monedaSub(p.subtotal)} · Asignado: ${monedaCentimosSub(reservado)}</span>
        <button type="button" data-accion-sub="seleccionar-producto" data-producto-sub="${id}" ${libre ? '' : 'disabled'} class="rounded-lg bg-blue-50 px-3 py-2 font-black text-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Asignar a persona</button>
      </div>
    </article>`;
  }).join('');
}

function renderPersonasSub() {
  const lista = elementoSub('lista-personas-sub');
  if (!lista) return;
  const participantes = estadoSub.detalle?.subcuentas || [];
  if (!participantes.length) {
    lista.innerHTML = '<p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Aun no hay personas. Agrega una para repartir los productos de la mesa.</p>';
    return;
  }
  lista.innerHTML = participantes.map(persona => {
    const id = idSeguroSub(persona.id_subcuenta);
    const pagado = centimosSub(persona.total_pagado) ?? 0;
    const pendiente = centimosSub(persona.total_pendiente) ?? 0;
    const puedeEditar = persona.estado === 'pendiente' && pagado === 0;
    const hayCobrables = (persona.detalles || []).some(asignacionListaSub);
    return `<article class="rounded-2xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div><h3 class="break-words text-lg font-black">${escaparSub(persona.nombre)}</h3><p class="text-xs font-semibold ${persona.estado === 'pagada' ? 'text-emerald-700' : 'text-slate-500'}">${persona.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</p></div>
        <p class="text-lg font-black text-blue-800">${monedaCentimosSub(pendiente)}<span class="block text-right text-xs font-semibold text-slate-500">por pagar</span></p>
      </div>
      <p class="mt-2 text-xs text-slate-600">Asignado: ${monedaSub(persona.total_asignado)} · Pagado: ${monedaCentimosSub(pagado)}</p>
      <div class="mt-3 space-y-2">${(persona.detalles || []).length ? persona.detalles.map(d => {
        const producto = productoActualSub(d.id_detalle_producto);
        const idAsignacion = idSeguroSub(d.id_subcuenta_detalle);
        return `<div class="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs">
          <div class="min-w-0 flex-1"><p class="break-words font-semibold">${escaparSub(producto?.nombre || 'Producto')} · ${monedaSub(d.monto_asignado)}</p>
          <p class="mt-1 text-slate-500">Pendiente: ${monedaSub(d.monto_pendiente)}</p></div>
          ${puedeEditar ? `<button type="button" data-accion-sub="borrar-asignacion" data-persona-sub="${id}" data-asignacion-sub="${idAsignacion}" class="rounded-lg border border-rose-200 px-2 py-2 font-bold text-rose-700 hover:bg-rose-50">Quitar</button>` : ''}
        </div>`;
      }).join('') : '<p class="text-xs text-slate-500">Aun sin productos asignados.</p>'}</div>
      <button type="button" data-accion-sub="abrir-pago" data-persona-sub="${id}" ${pendiente > 0 && hayCobrables && persona.estado === 'pendiente' ? '' : 'disabled'} class="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">${pendiente > 0 && !hayCobrables ? 'Esperando entrega' : 'Cobrar a esta persona'}</button>
    </article>`;
  }).join('');
}

function disponiblesParaPersonaSub(idPersona) {
  const persona = personaActualSub(idPersona);
  if (!persona || persona.estado !== 'pendiente' || (centimosSub(persona.total_pagado) ?? 0) > 0) return [];
  const idsAsignados = new Set((persona?.detalles || []).map(d => Number(d.id_detalle_producto)));
  return (estadoSub.detalle?.productos || []).filter(p =>
    saldoLibreSub(p) > 0 && !idsAsignados.has(Number(p.id_detalle_producto))
  );
}
function actualizarAyudaAsignacionSub() {
  const producto = productoActualSub(elementoSub('select-producto-asignar')?.value);
  const ayuda = elementoSub('ayuda-asignar-sub');
  const libre = saldoLibreSub(producto);
  if (ayuda) ayuda.textContent = producto ? `Saldo libre para esta asignacion: ${monedaCentimosSub(libre)}` : 'Elige un producto con saldo libre.';
  const boton = elementoSub('btn-monto-libre-sub');
  if (boton) boton.disabled = !libre || estadoSub.ocupado || Boolean(estadoSub.pagoPendiente);
}
function renderFormularioAsignacionSub() {
  const personas = (estadoSub.detalle?.subcuentas || []).filter(
    p => p.estado === 'pendiente' && (centimosSub(p.total_pagado) ?? 0) === 0
  );
  const selectorPersona = elementoSub('select-persona-asignar');
  const selectorProducto = elementoSub('select-producto-asignar');
  if (!selectorPersona || !selectorProducto) return;
  const antesPersona = selectorPersona.value;
  selectorPersona.innerHTML = `<option value="">Seleccionar persona...</option>` + personas.map(p =>
    `<option value="${idSeguroSub(p.id_subcuenta)}">${escaparSub(p.nombre)}</option>`
  ).join('');
  selectorPersona.value = personas.some(p => String(p.id_subcuenta) === antesPersona) ? antesPersona : '';
  actualizarProductosAsignacionSub();
  bloquearFormulariosSub();
}
function actualizarProductosAsignacionSub(idPreferido = null) {
  const selectorPersona = elementoSub('select-persona-asignar');
  const selectorProducto = elementoSub('select-producto-asignar');
  if (!selectorProducto) return;
  const disponibles = disponiblesParaPersonaSub(selectorPersona?.value);
  const anterior = idPreferido == null ? selectorProducto.value : String(idPreferido);
  selectorProducto.innerHTML = '<option value="">Seleccionar producto...</option>' + disponibles.map(p =>
    `<option value="${idSeguroSub(p.id_detalle_producto)}">${escaparSub(p.nombre)} · ${monedaCentimosSub(saldoLibreSub(p))} libre</option>`
  ).join('');
  selectorProducto.value = disponibles.some(p => String(p.id_detalle_producto) === anterior) ? anterior : '';
  actualizarAyudaAsignacionSub();
}
function actualizarResumenSub() {
  const cuenta = cuentaActualSub();
  const resumen = resumenCuentaSub();
  elementoSub('titulo-cuenta-sub').textContent = cuenta?.etiqueta || `Cuenta #${estadoSub.idCuenta}`;
  elementoSub('mesas-cuenta-sub').textContent = (cuenta?.mesas || []).length
    ? cuenta.mesas.map(m => `Mesa ${m}`).join(' · ') : (cuenta?.es_llevar ? 'Pedido para llevar' : 'Cuenta del grupo');
  elementoSub('estado-cuenta-sub').textContent = estadoSub.detalle?.cuenta?.estado || 'pendiente';
  elementoSub('total-pendiente-sub').textContent = monedaCentimosSub(resumen.pendiente);
  elementoSub('total-asignado-sub').textContent = monedaCentimosSub(resumen.asignado);
  elementoSub('total-pagado-sub').textContent = monedaCentimosSub(resumen.pagado);
  elementoSub('total-libre-sub').textContent = monedaCentimosSub(resumen.libre);
}

function actualizarVistaSub() {
  const hay = Boolean(estadoSub.detalle);
  elementoSub('panel-principal-sub')?.classList.toggle('hidden', !hay);
  elementoSub('vacio-sub')?.classList.toggle('hidden', hay);
  if (!hay) return;
  actualizarResumenSub();
  renderProductosSub();
  renderPersonasSub();
  renderFormularioAsignacionSub();
  bloquearFormulariosSub();
}

async function cargarDatosSub() {
  if (estadoSub.cargando) return;
  estadoSub.cargando = true;
  const refresh = elementoSub('btn-actualizar-sub');
  if (refresh) refresh.disabled = true;
  try {
    const [cuentas, turno] = await Promise.all([
      apiSub('/cajero/cuentas'),
      apiSub('/cajero/turnos/actual'),
    ]);
    estadoSub.cuentas = Array.isArray(cuentas.data) ? cuentas.data : [];
    estadoSub.turno = turno.data?.estado === 'abierto' ? turno.data : null;
    elementoSub('estado-turno-sub').textContent = estadoSub.turno
      ? `Turno #${estadoSub.turno.id_turno} abierto` : 'Sin turno abierto: no es posible cobrar';
    const urlId = idSeguroSub(new URLSearchParams(window.location.search).get('id_cuenta'));
    if (!estadoSub.idCuenta && urlId && estadoSub.cuentas.some(c => Number(c.id_cuenta) === urlId)) {
      estadoSub.idCuenta = urlId;
    }
    if (estadoSub.idCuenta && !estadoSub.cuentas.some(c => Number(c.id_cuenta) === estadoSub.idCuenta)) {
      estadoSub.idCuenta = null;
      estadoSub.detalle = null;
      estadoSub.idPersonaPago = null;
      elementoSub('panel-pago-sub')?.classList.add('hidden');
    }
    opcionesCuentasSub();
    if (estadoSub.idCuenta) {
      const respuesta = await apiSub(`/cajero/cuentas/${estadoSub.idCuenta}/subcuentas`);
      estadoSub.detalle = respuesta.data || null;
    } else {
      estadoSub.detalle = null;
      if (!estadoSub.cuentas.length) {
        elementoSub('vacio-sub').textContent = 'No hay cuentas pendientes. Cuando una mesa tenga consumo por cobrar, aparecera aqui.';
      }
    }
    actualizarVistaSub();
    mostrarPendienteSub();
  } catch (error) {
    estadoSub.detalle = null;
    actualizarVistaSub();
    mensajeSub(`No se pudo consultar la division de cuentas: ${error.message}`, 'error');
  } finally {
    estadoSub.cargando = false;
    if (refresh) refresh.disabled = false;
  }
}

async function cambiarCuentaSub(id) {
  if (estadoSub.ocupado) return;
  estadoSub.idCuenta = idSeguroSub(id);
  estadoSub.detalle = null;
  estadoSub.idPersonaPago = null;
  elementoSub('panel-pago-sub')?.classList.add('hidden');
  try {
    const url = new URL(window.location.href);
    if (estadoSub.idCuenta) url.searchParams.set('id_cuenta', String(estadoSub.idCuenta));
    else url.searchParams.delete('id_cuenta');
    history.replaceState({}, '', url);
  } catch (_) { /* Sigue siendo posible seleccionar por el desplegable. */ }
  await cargarDatosSub();
}

async function ejecutarAccionSub(accion, textoExito) {
  if (estadoSub.ocupado || estadoSub.pagoPendiente) return;
  estadoSub.ocupado = true;
  bloquearFormulariosSub();
  try {
    await accion();
    mensajeSub(textoExito, 'ok');
    await cargarDatosSub();
  } catch (error) {
    mensajeSub(`${error.message}${!error.status ? ' Consulta Actualizar datos antes de reintentar la operacion.' : ''}`, 'error');
    if (!error.status) await cargarDatosSub();
  } finally {
    estadoSub.ocupado = false;
    bloquearFormulariosSub();
  }
}

async function crearPersonaSub(evento) {
  evento.preventDefault();
  const nombre = elementoSub('nombre-persona-sub')?.value.trim() || '';
  if (!estadoSub.idCuenta || !nombre || nombre.length > 80 || /[\x00-\x1f\x7f]/.test(nombre)) {
    return mensajeSub('Ingresa un nombre valido de hasta 80 caracteres.', 'error');
  }
  await ejecutarAccionSub(async () => {
    await apiSub(`/cajero/cuentas/${estadoSub.idCuenta}/subcuentas`, {
      method: 'POST', body: JSON.stringify({ nombre }),
    });
    elementoSub('nombre-persona-sub').value = '';
  }, 'Participante agregado. Ahora puedes asignarle importes de productos.');
}
async function asignarImporteSub(evento) {
  evento.preventDefault();
  const idCuenta = estadoSub.idCuenta;
  const idPersona = idSeguroSub(elementoSub('select-persona-asignar')?.value);
  const idProducto = idSeguroSub(elementoSub('select-producto-asignar')?.value);
  const monto = (elementoSub('monto-asignar-sub')?.value || '').trim();
  const cantidad = (elementoSub('cantidad-asignar-sub')?.value || '').trim();
  const centimos = centimosSub(monto, false);
  const producto = productoActualSub(idProducto);
  if (!idCuenta || !idPersona || !idProducto || centimos === null || centimos > saldoLibreSub(producto) || !cantidadValidaSub(cantidad)) {
    return mensajeSub('Selecciona persona y producto, e ingresa un importe positivo que no supere el saldo libre (hasta 2 decimales). Cantidad opcional hasta 3 decimales.', 'error');
  }
  if (!disponiblesParaPersonaSub(idPersona).some(p => Number(p.id_detalle_producto) === idProducto)) {
    return mensajeSub('Este producto ya esta asignado a esta persona o no tiene saldo libre.', 'error');
  }
  await ejecutarAccionSub(async () => {
    await apiSub(`/cajero/cuentas/${idCuenta}/subcuentas/${idPersona}/detalles`, {
      method: 'POST', body: JSON.stringify({
        id_detalle_producto: idProducto, monto_asignado: importeFijoSub(centimos),
        ...(cantidad ? { cantidad_asignada: cantidad } : {}),
      }),
    });
    elementoSub('monto-asignar-sub').value = '';
    elementoSub('cantidad-asignar-sub').value = '';
  }, 'Importe asignado. Puedes continuar repartiendo el saldo restante.');
}
async function quitarAsignacionSub(idPersona, idAsignacion) {
  if (!idSeguroSub(idPersona) || !idSeguroSub(idAsignacion) || !estadoSub.idCuenta) return;
  const persona = personaActualSub(idPersona);
  const detalle = persona?.detalles?.find(d => Number(d.id_subcuenta_detalle) === Number(idAsignacion));
  if (!persona || !detalle || (centimosSub(persona.total_pagado) ?? 0) > 0) return;
  if (!confirm(`Quitar la asignacion de ${monedaSub(detalle.monto_asignado)} a ${persona.nombre}?`)) return;
  await ejecutarAccionSub(async () => {
    await apiSub(`/cajero/cuentas/${estadoSub.idCuenta}/subcuentas/${idPersona}/detalles/${idAsignacion}`, {
      method: 'DELETE',
    });
  }, 'Asignacion retirada. Su importe vuelve a estar disponible para repartir.');
}

function abrirPagoSub(idPersona) {
  if (estadoSub.pagoPendiente) return mensajeSub('Resuelve primero el intento de cobro pendiente.', 'error');
  const persona = personaActualSub(idPersona);
  if (!persona || persona.estado !== 'pendiente' || (centimosSub(persona.total_pendiente) ?? 0) <= 0) {
    return mensajeSub('El participante no tiene saldo pendiente.', 'error');
  }
  estadoSub.idPersonaPago = Number(persona.id_subcuenta);
  elementoSub('panel-pago-sub')?.classList.remove('hidden');
  elementoSub('titulo-pago-sub').textContent = persona.nombre;
  elementoSub('metodo-pago-sub').value = 'Efectivo';
  elementoSub('recibido-pago-sub').value = '';
  elementoSub('referencia-pago-sub').value = '';
  elementoSub('documento-pago-sub').value = '';
  elementoSub('razon-social-sub').value = '';
  elementoSub('tipo-comprobante-sub').value = 'boleta';
  elementoSub('lista-seleccion-pago-sub').innerHTML = (persona.detalles || []).map(d => {
    const producto = productoActualSub(d.id_detalle_producto);
    const listo = asignacionListaSub(d);
    const pendiente = centimosSub(d.monto_pendiente) ?? 0;
    const id = idSeguroSub(d.id_detalle_producto);
    return `<label class="flex items-start gap-2 rounded-xl border border-slate-200 p-3 ${listo ? 'bg-white' : 'bg-amber-50'}">
      <input name="detalle-pago-sub" type="checkbox" data-id="${id}" data-monto="${pendiente}" ${listo ? 'checked' : 'disabled'} class="mt-1 h-4 w-4" />
      <span class="min-w-0 flex-1"><span class="block break-words text-sm font-bold">${escaparSub(producto?.nombre || 'Producto')}</span>
        <span class="text-xs text-slate-500">${listo ? 'Disponible para cobrar' : 'Esperando entrega'}</span></span>
      <strong class="whitespace-nowrap text-sm">${monedaCentimosSub(pendiente)}</strong>
    </label>`;
  }).join('');
  actualizarCamposPagoSub();
  actualizarComprobanteSub();
  actualizarTotalPagoSub();
  elementoSub('panel-pago-sub')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
function cerrarPagoSub() {
  if (estadoSub.ocupado || estadoSub.pagoPendiente) return;
  estadoSub.idPersonaPago = null;
  elementoSub('panel-pago-sub')?.classList.add('hidden');
}
function seleccionPagoSub() {
  return Array.from(document.querySelectorAll('input[name="detalle-pago-sub"]:checked'))
    .filter(n => !n.disabled && idSeguroSub(n.dataset.id) && Number.isSafeInteger(Number(n.dataset.monto)))
    .map(n => ({ id_detalle_producto: Number(n.dataset.id), montoCentimos: Number(n.dataset.monto) }));
}
function totalSeleccionadoSub() {
  return seleccionPagoSub().reduce((s, d) => s + d.montoCentimos, 0);
}
function actualizarTotalPagoSub() {
  const total = totalSeleccionadoSub();
  const nodo = elementoSub('total-pago-sub');
  if (nodo) nodo.textContent = monedaCentimosSub(total);
  for (const boton of document.querySelectorAll('[data-efectivo-sub]')) {
    const valor = boton.dataset.efectivoSub === 'exacto' ? total : (centimosSub(boton.dataset.efectivoSub) ?? 0);
    boton.disabled = valor < total || total === 0;
  }
  actualizarDineroPagoSub();
  bloquearFormulariosSub();
}
function actualizarCamposPagoSub() {
  const efectivo = elementoSub('metodo-pago-sub')?.value === 'Efectivo';
  elementoSub('bloque-efectivo-sub')?.classList.toggle('hidden', !efectivo);
  elementoSub('bloque-referencia-sub')?.classList.toggle('hidden', efectivo);
  actualizarDineroPagoSub();
}
function actualizarComprobanteSub() {
  const factura = elementoSub('tipo-comprobante-sub')?.value === 'factura';
  const etiqueta = elementoSub('etiqueta-documento-sub');
  const documento = elementoSub('documento-pago-sub');
  if (etiqueta) etiqueta.textContent = factura ? 'RUC (11 digitos)' : 'DNI (8 digitos)';
  if (documento) { documento.maxLength = factura ? 11 : 8; documento.placeholder = factura ? 'RUC' : 'DNI'; }
  elementoSub('bloque-razon-social-sub')?.classList.toggle('hidden', !factura);
}
function actualizarDineroPagoSub() {
  const estado = elementoSub('estado-efectivo-sub');
  if (!estado) return;
  const recibido = (elementoSub('recibido-pago-sub')?.value || '').trim();
  const centimos = centimosSub(recibido);
  const total = totalSeleccionadoSub();
  if (recibido === '' || centimos === null) {
    estado.textContent = 'Ingresa el monto recibido con hasta dos decimales.';
    estado.className = 'mt-3 text-sm font-black text-slate-600';
  } else if (centimos < total) {
    estado.textContent = `Falta ${monedaCentimosSub(total - centimos)}.`;
    estado.className = 'mt-3 text-sm font-black text-red-700';
  } else {
    estado.textContent = `Vuelto estimado: ${monedaCentimosSub(centimos - total)}.`;
    estado.className = 'mt-3 text-sm font-black text-emerald-800';
  }
}
function nuevaClaveSub() {
  if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  if (typeof window.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `menugo-sub-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('Este navegador requiere HTTPS o localhost para generar claves seguras de pago.');
}
function datosPagoSub() {
  if (!estadoSub.turno) throw new Error('Abre tu turno de caja antes de cobrar.');
  if (estadoSub.pagoPendiente) throw new Error('Hay una operacion anterior sin confirmar. Recuperala primero.');
  const persona = personaActualSub();
  if (!persona || persona.estado !== 'pendiente') throw new Error('Selecciona un participante pendiente.');
  const detalles = seleccionPagoSub();
  const total = detalles.reduce((s, d) => s + d.montoCentimos, 0);
  if (!total || !detalles.length) throw new Error('Selecciona al menos un producto ya entregado.');
  const metodo = elementoSub('metodo-pago-sub').value;
  const factura = elementoSub('tipo-comprobante-sub').value === 'factura';
  const documento = (elementoSub('documento-pago-sub').value || '').replace(/\D/g, '');
  const razon = (elementoSub('razon-social-sub').value || '').trim();
  if (factura && (documento.length !== 11 || !razon)) throw new Error('Para factura se necesita RUC de 11 digitos y razon social.');
  if (!factura && documento.length !== 8) throw new Error('Para boleta ingresa un DNI de 8 digitos.');
  const datos = {
    idempotency_key: nuevaClaveSub(),
    metodo_pago: metodo,
    detalles: detalles.map(d => ({ id_detalle_producto: d.id_detalle_producto })),
    tipo_comprobante: factura ? 'factura' : 'boleta',
    ...(factura ? { ruc: documento, razon_social: razon } : { dni: documento }),
    pagado_por: persona.nombre,
    mesa_pagadora: cuentaActualSub()?.mesas?.length ? `Mesa ${cuentaActualSub().mesas.join(', ')}` : null,
  };
  if (metodo === 'Efectivo') {
    const recibido = (elementoSub('recibido-pago-sub').value || '').trim();
    const centimos = centimosSub(recibido);
    if (centimos === null || centimos < total) throw new Error(`El efectivo recibido es insuficiente. Se requieren ${monedaCentimosSub(total)}.`);
    datos.monto_recibido = importeFijoSub(centimos);
  } else {
    const referencia = (elementoSub('referencia-pago-sub').value || '').trim();
    if (referencia.length < 3 || referencia.length > 100 || /[\x00-\x1f\x7f]/.test(referencia)) {
      throw new Error('Ingresa una referencia valida de 3 a 100 caracteres para el pago digital o tarjeta.');
    }
    datos.referencia = referencia;
  }
  return {
    id_cajero: obtenerCajeroSub(),
    id_cuenta: estadoSub.idCuenta,
    id_subcuenta: estadoSub.idPersonaPago,
    datos,
  };
}
async function enviarPagoSub(intento) {
  if (estadoSub.ocupado) return;
  estadoSub.ocupado = true;
  mostrarPendienteSub();
  let confirmado = false;
  try {
    const respuesta = await apiSub(
      `/cajero/cuentas/${intento.id_cuenta}/subcuentas/${intento.id_subcuenta}/pagos`,
      { method: 'POST', body: JSON.stringify(intento.datos) }
    );
    confirmado = true;
    borrarPendienteSub();
    estadoSub.idPersonaPago = null;
    elementoSub('panel-pago-sub')?.classList.add('hidden');
    mensajeSub(respuesta.repetido
      ? `Pago #${respuesta.data?.id_pago} recuperado; no se duplico el cobro.`
      : `Pago individual registrado. Vuelto confirmado: ${monedaSub(respuesta.data?.vuelto)}.`, 'ok');
    await cargarDatosSub();
  } catch (error) {
    if ([400, 401, 403, 404, 422].includes(error.status)) borrarPendienteSub();
    mensajeSub(!error.status
      ? 'La respuesta del pago se perdio. Reintenta la MISMA operacion desde el aviso amarillo (no crees otra).'
      : `No se pudo confirmar el pago: ${error.message}`, 'error');
  } finally {
    estadoSub.ocupado = false;
    mostrarPendienteSub();
    if (confirmado) bloquearFormulariosSub();
  }
}
async function registrarPagoSub(evento) {
  evento.preventDefault();
  if (estadoSub.ocupado || estadoSub.pagoPendiente) return;
  let intento;
  try { intento = datosPagoSub(); }
  catch (error) { return mensajeSub(error.message, 'error'); }
  guardarPendienteSub(intento); // Antes del primer POST para recuperar cortes de red.
  await enviarPagoSub(intento);
}
async function reintentarPagoSub() {
  if (!estadoSub.pagoPendiente || estadoSub.ocupado) return;
  await enviarPagoSub(estadoSub.pagoPendiente); // Cuerpo y clave EXACTAMENTE iguales.
}

function conectarEventosSub() {
  elementoSub('selector-cuenta-sub')?.addEventListener('change', e => cambiarCuentaSub(e.target.value));
  elementoSub('btn-actualizar-sub')?.addEventListener('click', () => cargarDatosSub());
  elementoSub('form-persona-sub')?.addEventListener('submit', crearPersonaSub);
  elementoSub('form-asignar-sub')?.addEventListener('submit', asignarImporteSub);
  elementoSub('form-pago-sub')?.addEventListener('submit', registrarPagoSub);
  elementoSub('btn-reintentar-sub')?.addEventListener('click', reintentarPagoSub);
  elementoSub('btn-cancelar-pago-sub')?.addEventListener('click', cerrarPagoSub);
  elementoSub('select-persona-asignar')?.addEventListener('change', () => actualizarProductosAsignacionSub());
  elementoSub('select-producto-asignar')?.addEventListener('change', actualizarAyudaAsignacionSub);
  elementoSub('btn-monto-libre-sub')?.addEventListener('click', () => {
    const producto = productoActualSub(elementoSub('select-producto-asignar')?.value);
    if (producto) elementoSub('monto-asignar-sub').value = importeFijoSub(saldoLibreSub(producto));
  });
  elementoSub('metodo-pago-sub')?.addEventListener('change', actualizarCamposPagoSub);
  elementoSub('tipo-comprobante-sub')?.addEventListener('change', actualizarComprobanteSub);
  elementoSub('recibido-pago-sub')?.addEventListener('input', actualizarDineroPagoSub);
  elementoSub('documento-pago-sub')?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, elementoSub('tipo-comprobante-sub').value === 'factura' ? 11 : 8);
  });
  elementoSub('lista-seleccion-pago-sub')?.addEventListener('change', actualizarTotalPagoSub);
  elementoSub('bloque-efectivo-sub')?.addEventListener('click', e => {
    const boton = e.target.closest?.('[data-efectivo-sub]');
    if (!boton || boton.disabled) return;
    const valor = boton.dataset.efectivoSub === 'exacto'
      ? totalSeleccionadoSub() : (centimosSub(boton.dataset.efectivoSub) ?? 0);
    elementoSub('recibido-pago-sub').value = importeFijoSub(valor);
    actualizarDineroPagoSub();
  });
  elementoSub('lista-productos-sub')?.addEventListener('click', e => {
    const boton = e.target.closest?.('[data-accion-sub="seleccionar-producto"]');
    if (!boton || boton.disabled || estadoSub.pagoPendiente) return;
    const selectorPersona = elementoSub('select-persona-asignar');
    if (!selectorPersona?.value) {
      const primera = (estadoSub.detalle?.subcuentas || []).find(p =>
        p.estado === 'pendiente' && (centimosSub(p.total_pagado) ?? 0) === 0 &&
        disponiblesParaPersonaSub(p.id_subcuenta).some(prod => String(prod.id_detalle_producto) === boton.dataset.productoSub)
      );
      if (!primera) return mensajeSub('Agrega o selecciona una persona que todavia no tenga este producto asignado.', 'error');
      selectorPersona.value = String(primera.id_subcuenta);
    }
    actualizarProductosAsignacionSub(boton.dataset.productoSub);
    elementoSub('select-producto-asignar')?.focus?.();
  });
  elementoSub('lista-personas-sub')?.addEventListener('click', e => {
    const boton = e.target.closest?.('[data-accion-sub]');
    if (!boton || boton.disabled || estadoSub.ocupado) return;
    const personaId = idSeguroSub(boton.dataset.personaSub);
    if (boton.dataset.accionSub === 'abrir-pago') abrirPagoSub(personaId);
    if (boton.dataset.accionSub === 'borrar-asignacion')
      quitarAsignacionSub(personaId, idSeguroSub(boton.dataset.asignacionSub));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.MENUGO_PERSONAL_BLOQUEADO) return;
  conectarEventosSub();
  recuperarPendienteSub();
  mostrarPendienteSub();
  await cargarDatosSub();
});
