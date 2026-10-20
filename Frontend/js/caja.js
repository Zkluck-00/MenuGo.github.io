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

// Una cuenta puede cobrarse parcialmente si al menos un producto esta entregado.
function productosCobrablesCaja(cuenta) {
  return (cuenta.detalles || []).filter((detalle) =>
    detalle.puede_pagarse && Number(detalle.monto_pendiente || 0) > 0
  );
}

// Los indicadores del dashboard y las tarjetas usan la misma clasificacion.
function clasificarCuentaCaja(cuenta) {
  const cobrables = productosCobrablesCaja(cuenta).length;
  const bloqueados = (cuenta.detalles || []).filter((detalle) =>
    !detalle.puede_pagarse && Number(detalle.monto_pendiente || 0) > 0
  ).length;

  return {
    cobrables,
    bloqueados,
    tipo: cobrables === 0 ? 'esperando' : bloqueados > 0 ? 'parcial' : 'lista'
  };
}

function calcularIndicadoresCaja(cuentas, resumen) {
  const estados = { lista: 0, parcial: 0, esperando: 0 };
  for (const cuenta of cuentas) {
    estados[clasificarCuentaCaja(cuenta).tipo] += 1;
  }

  const porMetodo = resumen.por_metodo || {};
  const digital = ['yape', 'plin', 'tarjeta_credito', 'tarjeta_debito']
    .reduce((total, metodo) => total + Number(porMetodo[metodo] || 0), 0);

  return {
    cuentas: cuentas.length,
    listas: estados.lista,
    parciales: estados.parcial,
    esperando: estados.esperando,
    solicitudes: cuentas.filter((cuenta) => Boolean(cuenta.solicitud_cuenta)).length,
    porCobrar: cuentas.reduce((total, cuenta) => total + Number(cuenta.total_pendiente || 0), 0),
    pagosHoy: Number(resumen.pagos_hoy_cajero || 0),
    efectivo: Number(porMetodo.efectivo || 0),
    digital,
    totalHoy: Number(resumen.total_hoy_cajero || 0)
  };
}

function actualizarEstadoActualizacionCaja(correcto) {
  const estado = document.getElementById('estado-actualizacion-caja');
  if (!estado) return;
  if (correcto) {
    const hora = new Date().toLocaleTimeString('es-PE');
    estado.textContent = `Actualizado a las ${hora}`;
    estado.className = 'text-xs font-bold text-emerald-700';
  } else {
    estado.textContent = 'No se pudo actualizar. Revisa tu conexion.';
    estado.className = 'text-xs font-bold text-red-700';
  }
}

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
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || 'Error de servidor');
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
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

let recargaCajaEnCurso = false;

async function recargarCaja() {
  // Evita que el temporizador y los eventos en vivo dupliquen las peticiones.
  if (recargaCajaEnCurso) return;
  recargaCajaEnCurso = true;
  const contenedor = document.getElementById('contenedor-cuentas');
  if (contenedor) contenedor.innerHTML = '<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando informacion de caja...</div>';
  try {
    await cargarDatosCaja();
    renderEstadisticasCaja();
    renderAlertasCaja();
    cambiarFiltroCuentas(filtroCaja, false);
    actualizarEstadoActualizacionCaja(true);
  } catch (error) {
    actualizarEstadoActualizacionCaja(false);
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-xl font-black">No se pudo cargar Caja</h2><p class="mt-2 text-sm font-semibold">${escapeCaja(error.message)}</p></div>`;
  } finally {
    recargaCajaEnCurso = false;
  }
}

function renderEstadisticasCaja() {
  const datos = calcularIndicadoresCaja(cuentasCaja, resumenCaja);
  const valores = {
    'stat-cuentas': datos.cuentas,
    'stat-listas': datos.listas,
    'stat-parciales': datos.parciales,
    'stat-espera': datos.esperando,
    'stat-solicitudes': datos.solicitudes,
    'stat-por-cobrar': solesCaja(datos.porCobrar),
    'stat-cobradas': datos.pagosHoy,
    'stat-efectivo': solesCaja(datos.efectivo),
    'stat-tarjeta': solesCaja(datos.digital),
    'stat-total': solesCaja(datos.totalHoy)
  };

  for (const [id, valor] of Object.entries(valores)) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  }
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
  box.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3"><div><p class="font-black text-orange-900">${solicitadas.length} solicitud(es) de cuenta esperan en Caja</p><p class="mt-1 text-sm font-semibold text-orange-800">Puedes cobrar productos entregados aunque otros sigan en cocina.</p></div><button onclick="cambiarFiltroCuentas('solicitadas')" class="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white">Ver solicitudes</button></div>`;
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
  if (filtroCaja === 'listas') lista = lista.filter((c) => productosCobrablesCaja(c).length > 0);
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
    const { cobrables, bloqueados: noListos, tipo } = clasificarCuentaCaja(cuenta);
    const puedeCobrar = cobrables > 0;
    const estadoCobro = tipo === 'esperando' ? 'Esperando entrega' : tipo === 'parcial' ? 'Cobro parcial disponible' : 'Lista para cobrar';
    const estiloEstado = tipo === 'esperando' ? 'bg-amber-100 text-amber-700' : tipo === 'parcial' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';
    const solicitud = cuenta.solicitud_cuenta;
    return `<article class="rounded-3xl border ${solicitud ? 'border-orange-300' : 'border-slate-200'} bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-black uppercase tracking-wide ${cuenta.es_llevar ? 'text-blue-600' : 'text-slate-500'}">${cuenta.es_llevar ? 'Pedido para llevar' : 'Cuenta de mesa'}</p>
          <h2 class="mt-1 text-2xl font-black text-slate-950">${escapeCaja(cuenta.etiqueta)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${cuenta.mesas?.length ? cuenta.mesas.map((m) => `Mesa ${m}`).join(', ') : 'Sin mesa asignada'}</p>
        </div>
        <span class="rounded-full ${estiloEstado} px-3 py-1.5 text-xs font-black">${estadoCobro}</span>
      </div>
      ${solicitud ? `<div class="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-3"><p class="text-sm font-black text-orange-800">Cliente solicito la cuenta</p><p class="mt-1 text-xs font-semibold text-orange-700">${escapeCaja(solicitud.nota || '')} · ${fechaCaja(solicitud.fecha_solicitud)}</p></div>` : ''}
      <div class="mt-4 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-[11px] font-black uppercase text-slate-500">Total</p><p class="mt-1 font-black">${solesCaja(cuenta.total)}</p></div>
        <div class="rounded-2xl bg-emerald-50 p-3"><p class="text-[11px] font-black uppercase text-emerald-700">Pagado</p><p class="mt-1 font-black text-emerald-700">${solesCaja(cuenta.total_pagado)}</p></div>
        <div class="rounded-2xl bg-orange-50 p-3"><p class="text-[11px] font-black uppercase text-orange-700">Pendiente</p><p class="mt-1 font-black text-orange-700">${solesCaja(cuenta.total_pendiente)}</p></div>
      </div>
      ${noListos ? `<p class="mt-3 text-xs font-bold text-amber-700">${noListos} producto(s) aun no estan habilitados para cobro.</p>` : ''}
      <div class="mt-4 flex gap-2">
        <button ${puedeCobrar ? '' : 'disabled'} onclick="abrirCobroCaja('${cuenta.id_cuenta}')" class="flex-1 rounded-2xl ${puedeCobrar ? 'bg-slate-950 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300'} px-4 py-3 text-sm font-black text-white">${puedeCobrar ? (noListos ? 'Cobrar productos entregados' : 'Cobrar en caja') : 'Esperar entrega'}</button>
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
  if (intentoPagoCajaPendiente && intentoPagoCajaPendiente.idCuenta !== String(idCuenta)) {
    return alert('Primero confirma el resultado del cobro anterior antes de abrir otra cuenta.');
  }
  const cuenta = cuentasCaja.find((c) => String(c.id_cuenta) === String(idCuenta));
  if (!cuenta) return alert('Cuenta no encontrada.');
  const items = productosCobrablesCaja(cuenta);
  if (!items.length) return alert('Esta cuenta aun no tiene productos disponibles para cobrar.');
  const totalDisponible = items.reduce((suma, item) => suma + Number(item.monto_pendiente), 0);
  const panel = document.getElementById('panel-cobro');
  const contenido = document.getElementById('contenido-cobro');

  contenido.innerHTML = `<div class="border-b border-slate-200 p-5"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-orange-600">Cobro por Caja</p><h2 class="mt-1 text-3xl font-black">${escapeCaja(cuenta.etiqueta)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">Saldo de la cuenta: ${solesCaja(cuenta.total_pendiente)} · Disponible para cobrar: ${solesCaja(totalDisponible)}</p></div><button onclick="cerrarCobroCaja()" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black">Cerrar</button></div></div>
  <div class="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_390px]">
    <section class="rounded-3xl border border-slate-200 p-4">
      <div class="mb-3 flex items-center justify-between gap-3"><h3 class="font-black">Productos a cobrar</h3><button onclick="seleccionarTodosCaja()" type="button" class="text-xs font-black text-orange-600">Seleccionar todos</button></div>
      <div>${items.map((item) => `<label class="flex items-start gap-3 border-b border-slate-100 py-3"><input type="checkbox" class="item-cobro-caja mt-1 h-5 w-5" data-id="${item.id_detalle_producto}" data-monto="${item.monto_pendiente}" checked onchange="actualizarTotalCobroCaja()"><span class="flex-1"><strong>${escapeCaja(item.nombre)}</strong><br><small class="text-slate-500">${escapeCaja(item.observacion || `Pedido #${item.id_pedido}`)}</small></span><strong>${solesCaja(item.monto_pendiente)}</strong></label>`).join('')}</div>
    </section>
    <form onsubmit="registrarPagoCaja(event, '${cuenta.id_cuenta}')" class="rounded-3xl bg-slate-50 p-4">
      <div class="rounded-2xl bg-white p-4 text-center"><p class="text-xs font-black uppercase text-slate-500">Total seleccionado</p><p id="total-cobro-caja" class="mt-1 text-3xl font-black text-slate-950">${solesCaja(totalDisponible)}</p></div>
      <label class="mt-4 block"><span class="text-xs font-black uppercase text-slate-500">Metodo de pago</span><select id="metodo-cobro-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" onchange="actualizarCamposPagoCaja()"><option value="Efectivo">Efectivo</option><option value="Yape">Yape</option><option value="Plin">Plin</option><option value="Tarjeta credito">Tarjeta credito</option><option value="Tarjeta debito">Tarjeta debito</option></select></label>
      <div id="campos-pago-caja" class="mt-3"></div>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Pagado por</span><input id="pagado-por-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" value="Cliente" /></label>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Mesa/persona pagadora (opcional)</span><input id="mesa-pagadora-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" placeholder="Ej. Mesa 4 o Invitado" /></label>
      <label class="mt-3 block"><span class="text-xs font-black uppercase text-slate-500">Comprobante</span><select id="comprobante-caja" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold" onchange="actualizarComprobanteCaja()"><option value="boleta">Boleta</option><option value="factura">Factura</option></select></label>
      <div id="datos-comprobante-caja" class="mt-3"></div>
      <button id="boton-registrar-caja" type="submit" disabled class="mt-5 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Registrar cobro</button>
    </form>
  </div>`;
  panel.classList.remove('hidden');
  actualizarCamposPagoCaja();
  actualizarComprobanteCaja();
  actualizarTotalCobroCaja();
}

function cerrarCobroCaja() {
  if (pagoCajaEnCurso || intentoPagoCajaPendiente) {
    alert('Antes de cerrar, confirma el resultado del cobro pendiente. Reintenta la misma operacion o consulta el historial.');
    return;
  }
  document.getElementById('panel-cobro')?.classList.add('hidden');
  const contenido = document.getElementById('contenido-cobro');
  if (contenido) contenido.innerHTML = '';
}

function itemsCobroCaja() {
  return Array.from(document.querySelectorAll('.item-cobro-caja:checked')).map((i) => ({ id_detalle_producto: Number(i.dataset.id), monto: Number(i.dataset.monto) }));
}

// Suma en centimos: 0.10 + 0.20 debe terminar como 0.30, nunca 0.30000000004.
function totalSeleccionadoCaja() {
  return itemsCobroCaja().reduce((suma, item) => suma + Math.round(Number(item.monto) * 100), 0) / 100;
}

function seleccionarTodosCaja() {
  document.querySelectorAll('.item-cobro-caja').forEach((i) => { i.checked = true; });
  actualizarTotalCobroCaja();
}

function actualizarTotalCobroCaja() {
  const total = totalSeleccionadoCaja();
  const el = document.getElementById('total-cobro-caja');
  if (el) el.textContent = solesCaja(total);
  actualizarVueltoCaja();
}

// Misma precision monetaria que el backend del commit 05 (NUMERIC(12,2)).
function centavosEfectivoCaja(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const [soles, decimales = ''] = texto.split('.');
  const centavos = Number(soles) * 100 + Number(decimales.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) && centavos <= 999999999999 ? centavos : null;
}

// Calcula el estado del formulario sin depender de HTML o acceso a la BD.
function evaluarEfectivoCaja(recibido, total) {
  const totalCentavos = Math.round(Number(total) * 100);
  const texto = String(recibido ?? '').trim();
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) {
    return { valido: false, estado: 'sin-productos', mensaje: 'Selecciona productos para cobrar.', valor: 0, mensajeError: 'Selecciona al menos un producto pendiente.' };
  }
  if (!texto) {
    return { valido: false, estado: 'vacio', mensaje: 'Ingresa el dinero que recibiste del cliente.', valor: 0, mensajeError: 'El efectivo recibido debe cubrir el total seleccionado.' };
  }
  const recibidoCentavos = centavosEfectivoCaja(texto);
  if (recibidoCentavos === null) {
    return { valido: false, estado: 'invalido', mensaje: 'Escribe un monto valido con un maximo de 2 decimales.', valor: 0, mensajeError: 'Ingresa un monto recibido valido (hasta dos decimales).' };
  }
  if (recibidoCentavos < totalCentavos) {
    return { valido: false, estado: 'insuficiente', mensaje: 'Falta efectivo para cubrir el cobro.', valor: (totalCentavos - recibidoCentavos) / 100, mensajeError: 'El efectivo recibido debe cubrir el total seleccionado.' };
  }
  return { valido: true, estado: 'correcto', mensaje: recibidoCentavos === totalCentavos ? 'Pago exacto: no se necesita vuelto.' : 'Verifica el vuelto antes de registrar el cobro.', valor: (recibidoCentavos - totalCentavos) / 100 };
}

let pagoCajaEnCurso = false;
let intentoPagoCajaPendiente = null;

// Se genera una sola clave por intento logico; no en cada pulsacion.
// Requiere un origen seguro (HTTPS o localhost) para obtener aleatoriedad fuerte.
function nuevaClaveIdempotenciaCaja() {
  const cripto = window.crypto;
  if (typeof cripto?.randomUUID === 'function') return cripto.randomUUID();
  if (typeof cripto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cripto.getRandomValues(bytes);
    return `menugo-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('No se pudo generar la clave segura de pago. Abre MenuGo desde HTTPS o localhost.');
}

function prepararIntentoPagoCaja(idCuenta, datos) {
  const firma = JSON.stringify(datos);
  if (intentoPagoCajaPendiente) {
    if (intentoPagoCajaPendiente.idCuenta !== String(idCuenta) || intentoPagoCajaPendiente.firma !== firma) {
      throw new Error('Hay un cobro cuyo resultado no se pudo confirmar. Reintenta con los mismos datos antes de cambiarlos o consulta el historial de pagos.');
    }
    return intentoPagoCajaPendiente;
  }
  intentoPagoCajaPendiente = {
    idCuenta: String(idCuenta),
    firma,
    datos: { ...datos, idempotency_key: nuevaClaveIdempotenciaCaja() },
  };
  return intentoPagoCajaPendiente;
}


// Los billetes son atajos de importe recibido, NO agregan productos a la cuenta.
function seleccionarMontoEfectivoCaja(monto) {
  const input = document.getElementById('monto-recibido-caja');
  if (!input || pagoCajaEnCurso) return;
  const valor = monto === 'exacto' ? totalSeleccionadoCaja() : Number(monto);
  if (!Number.isFinite(valor) || valor < 0) return;
  input.value = valor.toFixed(2);
  actualizarVueltoCaja();
  if (typeof input.focus === 'function') input.focus();
}

function actualizarBilletesCaja() {
  const totalCentavos = Math.round(totalSeleccionadoCaja() * 100);
  document.querySelectorAll('[data-billete-caja]').forEach((boton) => {
    const valor = centavosEfectivoCaja(boton.dataset.billeteCaja);
    boton.disabled = pagoCajaEnCurso || totalCentavos <= 0 || valor === null || valor < totalCentavos;
    boton.title = boton.disabled && !pagoCajaEnCurso ? 'Este billete no cubre el total seleccionado.' : '';
  });
}

function actualizarBotonCobroCaja() {
  const boton = document.getElementById('boton-registrar-caja');
  if (!boton) return;
  const metodo = document.getElementById('metodo-cobro-caja')?.value || 'Efectivo';
  const total = totalSeleccionadoCaja();
  const efectivoValido = metodo !== 'Efectivo' || evaluarEfectivoCaja(
    document.getElementById('monto-recibido-caja')?.value, total
  ).valido;
  boton.disabled = pagoCajaEnCurso || total <= 0 || !efectivoValido;
  boton.textContent = pagoCajaEnCurso ? 'Registrando pago...' : 'Registrar cobro';
}

function actualizarCamposPagoCaja() {
  const metodo = document.getElementById('metodo-cobro-caja')?.value || 'Efectivo';
  const box = document.getElementById('campos-pago-caja');
  if (!box) return;
  if (metodo === 'Efectivo') {
    box.innerHTML = `<section id="panel-efectivo-caja" class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-labelledby="titulo-efectivo-caja">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 id="titulo-efectivo-caja" class="font-black text-emerald-900">Cobro en efectivo</h4>
        <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Monto del cliente</span>
      </div>
      <label for="monto-recibido-caja" class="block text-sm font-black text-emerald-800">Efectivo recibido (S/)</label>
      <input id="monto-recibido-caja" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-describedby="ayuda-efectivo-caja estado-efectivo-caja" class="mt-1 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 text-xl font-black text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200" oninput="actualizarVueltoCaja()" />
      <p id="ayuda-efectivo-caja" class="mt-1 text-xs font-medium text-emerald-800">Ingresa el monto realmente entregado. No se asume un pago exacto.</p>
      <p class="mt-4 text-xs font-black uppercase tracking-wide text-emerald-900">Importes rapidos</p>
      <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <button type="button" onclick="seleccionarMontoEfectivoCaja('exacto')" class="rounded-xl border border-emerald-300 bg-white px-2 py-2.5 text-xs font-black text-emerald-900 hover:bg-emerald-100">Exacto</button>
        ${[20, 50, 100, 200].map((billete) => `<button type="button" data-billete-caja="${billete}" onclick="seleccionarMontoEfectivoCaja(${billete})" class="rounded-xl border border-emerald-300 bg-white px-2 py-2.5 text-xs font-black text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40">S/ ${billete}</button>`).join('')}
      </div>
      <div id="resumen-efectivo-caja" class="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <p id="etiqueta-vuelto-caja" class="text-xs font-black uppercase tracking-wide text-slate-600">Vuelto estimado</p>
        <p id="vuelto-caja" class="mt-1 text-3xl font-black text-slate-900">S/ 0.00</p>
        <p id="estado-efectivo-caja" role="status" aria-live="polite" class="mt-1 text-xs font-semibold text-slate-600">Ingresa el efectivo recibido.</p>
      </div>
    </section>`;
    // Evita suponer que el cliente entrego exactamente el importe del pedido.
    actualizarVueltoCaja();
  } else {
    box.innerHTML = `<div class="rounded-2xl border border-purple-200 bg-purple-50 p-3"><label class="block"><span class="text-xs font-black uppercase text-purple-700">Codigo/referencia de aprobacion</span><input id="referencia-pago-caja" maxlength="30" class="mt-1 w-full rounded-xl border border-purple-200 bg-white px-3 py-2 font-bold" placeholder="Codigo de operacion"></label><p class="mt-2 text-xs text-purple-800">La referencia se registra manualmente; no verifica el pago con el banco.</p></div>`;
  }
  actualizarBotonCobroCaja();
}

function actualizarVueltoCaja() {
  const input = document.getElementById('monto-recibido-caja');
  const etiqueta = document.getElementById('etiqueta-vuelto-caja');
  const monto = document.getElementById('vuelto-caja');
  const estado = document.getElementById('estado-efectivo-caja');
  const resumen = document.getElementById('resumen-efectivo-caja');
  if (!input || !etiqueta || !monto || !estado || !resumen) {
    actualizarBotonCobroCaja();
    return;
  }
  const calculo = evaluarEfectivoCaja(input.value, totalSeleccionadoCaja());
  etiqueta.textContent = calculo.estado === 'insuficiente' ? 'Dinero faltante' : 'Vuelto estimado';
  monto.textContent = solesCaja(calculo.valor);
  estado.textContent = calculo.mensaje;
  const alerta = calculo.estado === 'insuficiente' || calculo.estado === 'invalido';
  if (typeof input.setAttribute === 'function') input.setAttribute('aria-invalid', alerta ? 'true' : 'false');
  if (calculo.valido) {
    resumen.className = 'mt-4 rounded-xl border border-emerald-300 bg-emerald-100 p-3';
    monto.className = 'mt-1 text-3xl font-black text-emerald-900';
  } else if (alerta) {
    resumen.className = 'mt-4 rounded-xl border border-red-300 bg-red-50 p-3';
    monto.className = 'mt-1 text-3xl font-black text-red-800';
  } else {
    resumen.className = 'mt-4 rounded-xl border border-slate-200 bg-white p-3';
    monto.className = 'mt-1 text-3xl font-black text-slate-900';
  }
  actualizarBilletesCaja();
  actualizarBotonCobroCaja();
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

  if (pagoCajaEnCurso) return; // Evita reenvios por doble clic mientras responde el servidor.
  const metodo = document.getElementById('metodo-cobro-caja')?.value || 'Efectivo';
  let referencia = '';
  let montoRecibido;
  if (metodo === 'Efectivo') {
    // No confiar en el vuelto del navegador; el backend hace el calculo definitivo.
    montoRecibido = document.getElementById('monto-recibido-caja')?.value?.trim() || '';
    const validacion = evaluarEfectivoCaja(montoRecibido, total);
    if (!validacion.valido) {
      actualizarVueltoCaja();
      return alert(validacion.mensajeError);
    }
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

  // Se congelan los datos y se reutiliza la MISMA clave en reintentos.
  // No se genera una clave nueva cuando la red pierde la respuesta.
  let intento;
  try {
    intento = prepararIntentoPagoCaja(idCuenta, {
      metodo_pago: metodo,
      monto_recibido: metodo === 'Efectivo' ? montoRecibido : undefined,
      detalles: items,
      tipo_comprobante: tipo,
      dni: tipo === 'boleta' ? documento : undefined,
      ruc: tipo === 'factura' ? documento : undefined,
      razon_social: tipo === 'factura' ? razon : undefined,
      pagado_por: document.getElementById('pagado-por-caja')?.value || 'Cliente',
      mesa_pagadora: document.getElementById('mesa-pagadora-caja')?.value || null,
      referencia: referencia || null
    });
  } catch (error) {
    return alert(error.message);
  }

  pagoCajaEnCurso = true;
  actualizarBotonCobroCaja();
  let cobroConfirmado = false;
  try {
    const registro = await apiCaja(`/cajero/cuentas/${encodeURIComponent(idCuenta)}/pagos`, {
      method: 'POST',
      body: JSON.stringify(intento.datos)
    });
    cobroConfirmado = true;
    intentoPagoCajaPendiente = null;
    const vueltoConfirmado = Number(registro.data?.vuelto || 0);
    const mensaje = registro.repetido
      ? `Pago ya registrado (#${registro.data?.id_pago}). No se duplico el cobro.`
      : metodo === 'Efectivo'
        ? `Pago registrado correctamente. Vuelto confirmado: ${solesCaja(vueltoConfirmado)}.`
        : 'Pago registrado correctamente por Caja.';
    mostrarNotificacionCaja(mensaje);
    await recargarCaja();
  } catch (error) {
    // HTTP 400/404: el backend rechazo la operacion sin registrarla.
    // Sin respuesta (red) o HTTP 409: resultado incierto, conservar clave y datos.
    if ([400, 404].includes(error.status)) intentoPagoCajaPendiente = null;
    const aviso = !error.status
      ? 'No se pudo confirmar si el cobro se registro. Reintenta SIN cambiar los datos para reutilizar la misma clave; no abras un cobro nuevo.'
      : `No se pudo registrar el pago: ${error.message}`;
    alert(aviso);
  } finally {
    pagoCajaEnCurso = false;
    if (cobroConfirmado) cerrarCobroCaja();
    actualizarBotonCobroCaja();
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
