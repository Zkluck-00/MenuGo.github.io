if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let cuentasCruzadas = [];
let pagosCruzados = [];
let refreshInterval = null;
let refrescandoAutomatico = true;
let ultimaSeleccionGuardada = null;
let estaCargando = false;

function soles(valor) { return Number(valor || 0).toFixed(2); }
function normalizar(valor) { return String(valor || "").trim().toLowerCase(); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarPagoCruzado() {
  const [cuentas, pagos] = await Promise.all([apiJson("/cuentas/activas"), apiJson("/cuentas/pagos")]);
  cuentasCruzadas = cuentas.data || [];
  pagosCruzados = pagos.data || [];
}

async function recargarPagoCruzado(silencioso = false) {
  if (estaCargando) return;
  estaCargando = true;

  const cuentaBeneficiadaSeleccionada = document.getElementById('mesa-beneficiada-cruzada')?.value;
  const cuentaPagadoraSeleccionada = document.getElementById('mesa-pagadora-cruzada')?.value;
  const itemsSeleccionadosAntes = Array.from(document.querySelectorAll('.item-cruzado:checked'))
    .map(input => Number(input.dataset.id));

  if (!silencioso) {
    const contenedor = document.getElementById('items-beneficiada');
    if (contenedor && !contenedor.querySelector('.guardando-temp')) {
      contenedor.innerHTML = `<div class="bg-white p-8 text-center"><h3 class="text-xl font-black text-slate-800">Cargando...</h3></div>`;
    }
  }

  try {
    await cargarPagoCruzado();
    renderSelectsCruzados();
    renderEstadisticasCruzadas();
    renderHistorialPagosCruzados();
    actualizarCamposMetodoCruzado();
    actualizarCamposComprobanteCruzado();
    actualizarSimulacionPagoCruzado();

    if (cuentaBeneficiadaSeleccionada) {
      const select = document.getElementById('mesa-beneficiada-cruzada');
      if (select) {
        select.value = cuentaBeneficiadaSeleccionada;
      }
    }

    if (cuentaPagadoraSeleccionada) {
      const select = document.getElementById('mesa-pagadora-cruzada');
      if (select) {
        select.value = cuentaPagadoraSeleccionada;
      }
    }

    if (!silencioso) {
      renderItemsBeneficiada();

      if (itemsSeleccionadosAntes.length > 0) {
        document.querySelectorAll('.item-cruzado').forEach(input => {
          const id = Number(input.dataset.id);
          if (itemsSeleccionadosAntes.includes(id)) {
            input.checked = true;
          }
        });
        actualizarTotalCruzado();
      }
    }
  } catch (error) {
    if (!silencioso) {
      const contenedor = document.getElementById('items-beneficiada');
      if (contenedor) {
        contenedor.innerHTML = `<div class="bg-red-50 p-8 text-center text-red-700">
          <h3 class="text-xl font-black">No se pudo cargar</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>`;
      }
    }
  } finally {
    estaCargando = false;
  }
}

function pausarAutoRefresh() {
  refrescandoAutomatico = false;
}

function reanudarAutoRefresh() {
  refrescandoAutomatico = true;
}

function iniciarAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (!document.hidden && refrescandoAutomatico) {
      recargarPagoCruzado(true);
    }
  }, 30000);
}

function cuentasConPendiente() { return cuentasCruzadas.filter((c) => Number(c.total_pendiente || 0) > 0); }
function cuentaPorId(id) { return cuentasCruzadas.find((c) => String(c.id_cuenta || c.id) === String(id)); }

function renderSelectsCruzados() {
  const cuentas = cuentasConPendiente();
  const pagadora = document.getElementById("mesa-pagadora-cruzada");
  const beneficiada = document.getElementById("mesa-beneficiada-cruzada");
  if (!pagadora || !beneficiada) return;
  const opciones = cuentas.map((c) => `<option value="${c.id_cuenta}">${escapeHtml(c.etiqueta)} - Debe S/ ${soles(c.total_pendiente)}</option>`).join("");
  pagadora.innerHTML = `<option value="Cliente externo / invitado">Cliente externo / invitado</option>${opciones}`;
  beneficiada.innerHTML = opciones || `<option value="">No hay cuentas activas</option>`;
}

function renderEstadisticasCruzadas() {
  const cuentas = cuentasConPendiente();
  const totalPendiente = cuentas.reduce((s, c) => s + Number(c.total_pendiente || 0), 0);
  document.getElementById("stat-cuentas-cruzadas").textContent = cuentas.length;
  document.getElementById("stat-deudas-cruzadas").textContent = cuentas.length;
  document.getElementById("stat-pendiente-cruzado").textContent = soles(totalPendiente);
  document.getElementById("stat-pagos-cruzados").textContent = pagosCruzados.length;
}

function renderItemsBeneficiada() {
  const cuentaId = document.getElementById("mesa-beneficiada-cruzada")?.value;
  const contenedor = document.getElementById("items-beneficiada");
  if (!contenedor) return;
  
  const cuenta = cuentaPorId(cuentaId);
  if (!cuenta) {
    contenedor.innerHTML = `<div class="bg-white p-8 text-center"><h3 class="text-xl font-black text-slate-800">No hay cuenta seleccionada</h3></div>`;
    actualizarTotalCruzado();
    return;
  }
  
  const detalles = (cuenta.detalles || []).filter((d) => !d.pagado && Number(d.subtotal) - Number(d.monto_pagado || 0) > 0);
  if (!detalles.length) {
    contenedor.innerHTML = `<div class="bg-white p-8 text-center"><h3 class="text-xl font-black text-slate-800">Sin productos pendientes</h3></div>`;
    actualizarTotalCruzado();
    return;
  }
  
  let seleccionadosAnteriores = [];
  if (ultimaSeleccionGuardada && ultimaSeleccionGuardada.cuentaId === cuentaId) {
    seleccionadosAnteriores = ultimaSeleccionGuardada.items;
  }
  
  contenedor.innerHTML = `<table class="w-full text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">Pagar</th><th class="p-3">Producto</th><th class="p-3 text-center">Cant.</th><th class="p-3 text-right">Pendiente</th></tr></thead><tbody>${detalles.map((item) => {
    const pendiente = Number(item.subtotal) - Number(item.monto_pagado || 0);
    const tipo = normalizar(item.categoria).includes("bebida") || normalizar(item.tipo_producto).includes("bebida") ? "bebida" : "comida";
    const estabaSeleccionado = seleccionadosAnteriores.includes(item.id_detalle_producto);
    return `<tr class="border-t border-slate-100"><td class="p-3"><input type="checkbox" class="item-cruzado h-5 w-5" data-id="${item.id_detalle_producto}" data-monto="${pendiente}" data-tipo="${tipo}" ${estabaSeleccionado ? 'checked' : ''} onchange="guardarSeleccionActual(); actualizarTotalCruzado()"></td><td class="p-3"><p class="font-black text-slate-950">${escapeHtml(item.nombre)}</p><p class="text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || "")}</p></td><td class="p-3 text-center font-bold">${item.cantidad}</td><td class="p-3 text-right font-black">S/ ${soles(pendiente)}</td></tr>`;
  }).join("")}</tbody></table>`;
  
  actualizarTotalCruzado();
}

function guardarSeleccionActual() {
  const cuentaId = document.getElementById("mesa-beneficiada-cruzada")?.value;
  if (!cuentaId) return;
  const itemsSeleccionados = Array.from(document.querySelectorAll(".item-cruzado:checked")).map(input => Number(input.dataset.id));
  ultimaSeleccionGuardada = {
    cuentaId: cuentaId,
    items: itemsSeleccionados
  };
}

function actualizarCamposMetodoCruzado() {
  const metodo = document.getElementById("metodo-pago-cruzado")?.value || "Efectivo";
  const efectivo = document.getElementById("campos-efectivo-cruzado");
  if (efectivo) efectivo.classList.toggle("hidden", normalizar(metodo) !== "efectivo");
  actualizarTotalCruzado();
}

function actualizarCamposComprobanteCruzado() {
  const tipo = document.getElementById("comprobante-cruzado")?.value || "Sin comprobante";
  const box = document.getElementById("campos-comprobante-cruzado");
  const labelDoc = document.getElementById("label-doc-cruzado");
  const labelNombre = document.getElementById("label-nombre-cruzado");
  const docInput = document.getElementById("documento-cruzado");
  const nombreInput = document.getElementById("nombre-comprobante-cruzado");
  
  if (!box) return;
  
  const esSinComprobante = tipo === "Sin comprobante";
  box.classList.toggle("hidden", esSinComprobante);
  
  if (esSinComprobante) {
    if (docInput) docInput.value = "";
    if (nombreInput) nombreInput.value = "";
    return;
  }
  
  if (labelDoc) labelDoc.textContent = tipo === "Factura" ? "RUC" : "DNI";
  if (labelNombre) labelNombre.textContent = tipo === "Factura" ? "Razon social" : "Nombre del cliente";
  if (docInput) docInput.placeholder = tipo === "Factura" ? "RUC de la empresa" : "DNI del cliente";
  if (nombreInput) nombreInput.placeholder = tipo === "Factura" ? "Razon social" : "Nombre del cliente";
}

function itemsSeleccionados() {
  return Array.from(document.querySelectorAll(".item-cruzado:checked")).map((input) => ({ id_detalle_producto: Number(input.dataset.id), monto: Number(input.dataset.monto), tipo: input.dataset.tipo }));
}

function actualizarTotalCruzado() {
  const total = itemsSeleccionados().reduce((s, item) => s + Number(item.monto || 0), 0);
  const totalEl = document.getElementById("total-cruzado");
  if (totalEl) totalEl.textContent = soles(total);
  const recibido = Number(document.getElementById("monto-recibido-cruzado")?.value || 0);
  const vuelto = document.getElementById("vuelto-cruzado");
  if (vuelto) vuelto.textContent = soles(Math.max(recibido - total, 0));
}

function actualizarSimulacionPagoCruzado() {
  const metodo = document.getElementById("metodo-pago-cruzado")?.value || "Efectivo";
  const box = document.getElementById("simulacion-pago-cruzado");
  if (!box) return;

  if (metodo === "Yape") {
    box.className = "mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4";
    box.innerHTML = `<h3 class="font-black text-purple-800">Simulacion de pago con Yape</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Celular Yape</span><input id="yape-celular" type="text" inputmode="numeric" maxlength="9" placeholder="999 999 999" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold"></label><div class="mt-3"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Codigo de aprobacion</span><div class="grid grid-cols-6 gap-2">${Array.from({ length: 6 }, (_, i) => `<input type="text" inputmode="numeric" maxlength="1" class="codigo-yape-cruzado h-12 w-full rounded-xl border border-purple-200 text-center text-xl font-black">`).join('')}</div></div>`;
    activarCajasCodigoYapeCruzado();
  } else if (metodo === "Tarjeta") {
    box.className = "mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4";
    box.innerHTML = `<h3 class="font-black text-slate-800">Simulacion de pago con tarjeta</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Numero de tarjeta</span><input id="tarjeta-numero" type="text" maxlength="19" placeholder="0000 0000 0000 0000" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label><div class="mt-3 grid grid-cols-2 gap-3"><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Vencimiento</span><input id="tarjeta-vencimiento" type="text" maxlength="5" placeholder="MM/AA" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">CVV</span><input id="tarjeta-cvv" type="password" maxlength="3" placeholder="***" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label></div></div>`;
  } else {
    box.className = "mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4";
    box.innerHTML = `<h3 class="font-black text-emerald-800">Pago en efectivo</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-emerald-700">Monto recibido</span><input id="monto-recibido-cruzado" type="number" step="0.10" min="0" oninput="actualizarTotalCruzado()" class="w-full rounded-xl border border-emerald-200 px-4 py-3 font-bold"></label><p class="mt-2 text-sm font-bold text-emerald-800">Vuelto estimado: S/ <span id="vuelto-cruzado">0.00</span></p>`;
  }
}

function activarCajasCodigoYapeCruzado() {
  const inputs = Array.from(document.querySelectorAll('.codigo-yape-cruzado'));
  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && inputs[index + 1]) inputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && inputs[index - 1]) inputs[index - 1].focus();
    });
  });
}

function seleccionarItemsCruzados(modo) {
  document.querySelectorAll(".item-cruzado").forEach((input) => {
    if (modo === "todos") input.checked = true;
    else if (modo === "ninguno") input.checked = false;
    else input.checked = input.dataset.tipo === modo;
  });
  actualizarTotalCruzado();
}

async function registrarPagoCruzado(event) {
  event.preventDefault();
  const cuentaId = Number(document.getElementById("mesa-beneficiada-cruzada")?.value || 0);
  const items = itemsSeleccionados();
  const monto = items.reduce((s, item) => s + Number(item.monto || 0), 0);
  if (!cuentaId || items.length === 0 || monto <= 0) return alert("Selecciona una cuenta y al menos un producto pendiente.");
  const metodo = document.getElementById("metodo-pago-cruzado")?.value || "Efectivo";
  const tipoComprobante = document.getElementById("comprobante-cruzado")?.value || "Sin comprobante";
let documento = "";
let nombre = "";

if (tipoComprobante !== "Sin comprobante") {
  documento = document.getElementById("documento-cruzado")?.value || "";
  nombre = document.getElementById("nombre-comprobante-cruzado")?.value || "";
  
  if (!documento || !nombre) {
    alert("Completa los datos del comprobante (documento y nombre).");
    return;
  }
}
  const pagadora = document.getElementById("mesa-pagadora-cruzada")?.value || "Cliente externo / invitado";
  try {
    await apiJson("/cuentas/pagos", {
      method: "POST",
      body: JSON.stringify({
        id_cuenta: cuentaId,
        metodoPago: metodo,
        monto,
        detalles: items,
        tipo_comprobante: tipoComprobante === "factura" ? "factura" : "boleta",
        dni: tipoComprobante === "factura" ? undefined : documento,
        ruc: tipoComprobante === "factura" ? documento : undefined,
        razon_social: tipoComprobante === "factura" ? nombre : undefined,
        pagado_por: nombre,
        mesa_pagadora: pagadora,
        notas: "Pago cruzado registrado desde panel mesero",
      }),
    });
    alert("Pago cruzado registrado en la base de datos.");
    await recargarPagoCruzado();
  } catch (error) {
    alert(`No se pudo registrar pago cruzado: ${error.message}`);
  }
}

function renderHistorialPagosCruzados() {
  const contenedor = document.getElementById("historial-pagos-cruzados");
  if (!contenedor) return;
  if (!pagosCruzados.length) {
    contenedor.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Aun no hay pagos registrados.</div>`;
    return;
  }
  contenedor.innerHTML = pagosCruzados.slice(0, 20).map((pago) => `<article class="rounded-2xl border border-slate-200 bg-white p-4 text-sm"><div class="flex justify-between gap-3"><strong>Pago #${pago.id_pago}</strong><strong class="text-emerald-600">S/ ${soles(pago.monto)}</strong></div><p class="mt-1 text-slate-600">${escapeHtml(pago.metodo_pago)} · ${escapeHtml(pago.tipo_comprobante || "boleta")}</p><p class="mt-1 text-xs text-slate-500">Pagador: ${escapeHtml(pago.pagado_por || pago.mesa_pagadora || "Cliente")}</p></article>`).join("");
}

document.getElementById("metodo-pago-cruzado")?.addEventListener("change", () => actualizarSimulacionPagoCruzado());
document.getElementById("mesa-beneficiada-cruzada")?.addEventListener("change", () => {
  guardarSeleccionActual();
  renderItemsBeneficiada();
});
document.getElementById("mesa-pagadora-cruzada")?.addEventListener("focus", pausarAutoRefresh);
document.getElementById("mesa-beneficiada-cruzada")?.addEventListener("focus", pausarAutoRefresh);
document.getElementById("metodo-pago-cruzado")?.addEventListener("focus", pausarAutoRefresh);
document.getElementById("comprobante-cruzado")?.addEventListener("focus", pausarAutoRefresh);
document.querySelectorAll("input, select").forEach(el => {
  el.addEventListener("blur", () => {
    setTimeout(reanudarAutoRefresh, 5000);
  });
});

function iniciarEscuchaEventosPagoCruzado() {
  realTime.connect();

  const handleActualizacion = () => {
    recargarPagoCruzado(true);
  };

  const handlePagoRegistrado = (pago) => {
    const cuentaBeneficiada = document.getElementById('mesa-beneficiada-cruzada')?.value;
    if (cuentaBeneficiada && String(pago.id_cuenta) === String(cuentaBeneficiada)) {
      recargarPagoCruzado(true);
    } else {
      recargarPagoCruzado(true);
    }
  };

  const handleCuentaActualizada = (cuenta) => {
    const cuentaBeneficiada = document.getElementById('mesa-beneficiada-cruzada')?.value;
    if (cuentaBeneficiada && String(cuenta.id_cuenta) === String(cuentaBeneficiada)) {
      renderItemsBeneficiada();
      actualizarTotalCruzado();
    }
    renderSelectsCruzados();
    renderEstadisticasCruzadas();
    renderHistorialPagosCruzados();
  };

  realTime.on('pedido:creado', handleActualizacion);
  realTime.on('pedido:actualizado', handleActualizacion);
  realTime.on('mesa:actualizada', handleActualizacion);
  realTime.on('cuenta:actualizada', handleCuentaActualizada);
  realTime.on('pago:registrado', handlePagoRegistrado);
}

function iniciarPagoCruzadoConAutoRefresh() {
  recargarPagoCruzado();
  iniciarAutoRefresh();
  iniciarEscuchaEventosPagoCruzado();
}

document.addEventListener('DOMContentLoaded', () => {
  iniciarPagoCruzadoConAutoRefresh();
});