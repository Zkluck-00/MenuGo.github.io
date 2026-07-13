if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let vistaMesero = "listos";
let pedidosListos = [];
let pedidosMesero = [];
let cuentasActivas = [];
let mesasBackend = [];

function soles(valor) { return Number(valor || 0).toFixed(2); }
function normalizar(valor) { return String(valor || "").trim().toLowerCase(); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDatosMesero() {
  const [listos, pedidos, cuentas, mesas] = await Promise.all([
    apiJson("/mesero/pedidos/listos"),
    apiJson("/mesero/pedidos?estado=listo,entregado,pagado"),
    apiJson("/cuentas/activas"),
    apiJson("/mesas"),
  ]);
  pedidosListos = listos.data || [];
  pedidosMesero = pedidos.data || [];
  cuentasActivas = (cuentas.data || []).filter((cuenta) => Number(cuenta.total_pendiente || 0) > 0);
  mesasBackend = mesas.data || [];
}

async function recargarMesero() {
  const contenedor = document.getElementById("contenedor-mesero");
  if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando datos del mesero desde la BD...</div>`;
  try {
    await cargarDatosMesero();
    renderEstadisticas();
    renderVistaMesero();
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar el panel</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
  }
}

function renderEstadisticas() {
  const pendientesPago = cuentasActivas.filter((c) => Number(c.total_pendiente || 0) > 0).length;
  const porCobrar = cuentasActivas.reduce((s, c) => s + Number(c.total_pendiente || 0), 0);
  const listosLlevar = pedidosListos.filter((p) => normalizar(p.tipo_pedido || p.tipoConsumo).includes("llevar")).length;
  document.getElementById("stat-cuentas").textContent = cuentasActivas.length;
  document.getElementById("stat-pendientes").textContent = pendientesPago;
  document.getElementById("stat-listos").textContent = pedidosListos.length;
  document.getElementById("stat-llevar").textContent = listosLlevar;
  document.getElementById("stat-total").textContent = soles(porCobrar);
}

function cambiarVistaMesero(vista) {
  vistaMesero = vista;
  document.querySelectorAll(".vista-mesero").forEach((btn) => {
    const activo = btn.dataset.vista === vista;
    btn.className = activo
      ? "vista-mesero rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
      : "vista-mesero rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100";
  });
  renderVistaMesero();
}

function renderVistaMesero() {
  if (vistaMesero === "local") return renderCuentasLocales();
  if (vistaMesero === "llevar") return renderPedidosListos(pedidosListos.filter((p) => normalizar(p.tipo_pedido || p.tipoConsumo).includes("llevar")));
  if (vistaMesero === "cerradas") return renderHistorialMesero();
  return renderPedidosListos(pedidosListos);
}

function pedidoEsLlevar(pedido) { return normalizar(pedido.tipo_pedido || pedido.tipoConsumo).includes("llevar"); }

function renderPedidosListos(lista) {
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  if (!lista.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">No hay pedidos listos</h2><p class="mt-2 text-slate-500">El mesero solo ve pedidos cuando cocina los marca como listos.</p></div>`;
    return;
  }

  contenedor.innerHTML = lista.map((pedido) => `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black uppercase tracking-wide text-emerald-600">Listo para ${pedidoEsLlevar(pedido) ? "recoger" : "llevar a mesa"}</p>
          <h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Cliente")}</p>
          ${pedido.telefono || pedido.telefono_cliente ? `<p class="text-sm font-semibold text-slate-500">${escapeHtml(pedido.telefono || pedido.telefono_cliente)}</p>` : ''}
        </div>
        <span class="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-700">${escapeHtml(pedido.estadoPedido || "Listo")}</span>
      </div>
      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Mesa</p><p class="mt-1 text-xl font-black">${escapeHtml(pedido.mesa || "No aplica")}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Tipo</p><p class="mt-1 text-xl font-black">${escapeHtml(pedido.tipoConsumo || pedido.tipo_pedido)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Total</p><p class="mt-1 text-xl font-black">S/ ${soles(pedido.total)}</p></div>
      </div>
      <ul class="mb-4 space-y-2">
        ${(pedido.productos || []).map((item) => `<li class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="flex items-start justify-between gap-3"><div><p class="text-sm font-black text-slate-950">${escapeHtml(item.nombre)} x${Number(item.cantidad || 1)}</p><p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || "Sin observaciones")}</p></div><p class="text-sm font-black">S/ ${soles(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1))}</p></div></li>`).join("")}
      </ul>
      <button type="button" onclick="marcarEntregado('${escapeHtml(String(pedido.id_pedido || pedido.id))}')" class="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">${pedidoEsLlevar(pedido) ? "Marcar recogido" : "Marcar entregado a mesa"}</button>
    </article>`).join("");
}

function renderCuentasLocales() {
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  const cuentasPendientes = cuentasActivas.filter((cuenta) => Number(cuenta.total_pendiente || 0) > 0);
  if (!cuentasPendientes.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">No hay cuentas pendientes de pago</h2><p class="mt-2 text-slate-500">Los pedidos ya pagados no aparecen aqui; solo se mostraran en listos para mesa o recoger cuando cocina los marque como listos.</p></div>`;
    return;
  }
  contenedor.innerHTML = cuentasPendientes.map((cuenta) => {
    const detalles = (cuenta.detalles || []).filter((item) => !item.pagado && Number(item.subtotal) - Number(item.monto_pagado || 0) > 0);
    const tieneNoEntregados = detalles.some((item) => item.estado_pedido !== 'entregado');
    const puedePagar = !tieneNoEntregados && detalles.length > 0;
    
    const esLlevarEfectivo = cuenta.tipo_pedido === "llevar" && cuenta.metodoPago === "Efectivo al recoger";
    const vueltoEstimado = cuenta.vuelto_estimado || 0;
    const montoRecibido = cuenta.monto_recibido || cuenta.total_pendiente || 0;
    
    return `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div><p class="text-sm font-black uppercase tracking-wide text-slate-500">Cuenta activa</p><h2 class="text-2xl font-black text-slate-950">${escapeHtml(cuenta.etiqueta)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">Mesas: ${(cuenta.mesas || []).map((m) => `Mesa ${m}`).join(", ")}</p></div>
        <span class="rounded-full bg-orange-100 px-3 py-1.5 text-sm font-black text-orange-700">Pendiente S/ ${soles(cuenta.total_pendiente)}</span>
      </div>
      <div class="mb-4 grid grid-cols-3 gap-3">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Total</p><p class="mt-1 text-xl font-black">S/ ${soles(cuenta.total)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Pagado</p><p class="mt-1 text-xl font-black text-emerald-600">S/ ${soles(cuenta.total_pagado)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Debe</p><p class="mt-1 text-xl font-black text-orange-600">S/ ${soles(cuenta.total_pendiente)}</p></div>
      </div>
      ${esLlevarEfectivo ? `
      <div class="mb-4 rounded-2xl bg-emerald-50 p-3 border border-emerald-200">
        <p class="text-sm font-black text-emerald-700">Cliente paga con: S/ ${soles(montoRecibido)}</p>
        <p class="text-sm font-black text-emerald-700">Vuelto a entregar: S/ ${soles(vueltoEstimado)}</p>
      </div>` : ''}
      <div class="mt-4 flex gap-3">
        <button onclick="abrirGestionCuenta('${escapeHtml(String(cuenta.id_cuenta))}')" 
          class="flex-1 rounded-2xl ${puedePagar ? 'bg-slate-950 hover:bg-slate-800' : 'bg-slate-400 cursor-not-allowed'} px-4 py-3 text-sm font-black text-white transition"
          ${!puedePagar ? 'disabled' : ''}>
          ${puedePagar ? 'Registrar pago' : 'Esperar entrega de productos'}
        </button>
        <span class="rounded-2xl bg-orange-100 px-4 py-3 text-sm font-black text-orange-700">
           Debe S/ ${soles(cuenta.total_pendiente)}
        </span>
      </div>
      ${tieneNoEntregados ? `<div class="mt-2 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">Hay productos que aun no han sido entregados a la mesa. No se puede registrar el pago hasta que esten entregados.</div>` : ''}
    </article>`;
  }).join("");
}

function renderHistorialMesero() {
  const entregados = pedidosMesero.filter((p) => ["entregado", "pagado"].includes(p.estado_db));
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  if (!entregados.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">Sin historial cerrado</h2></div>`;
    return;
  }
  contenedor.innerHTML = entregados.map((p) => `<article class="rounded-3xl border border-slate-200 bg-white p-5"><h2 class="text-xl font-black">${escapeHtml(p.codigo)}</h2><p class="mt-1 text-sm text-slate-500">${escapeHtml(p.mesa)} - ${escapeHtml(p.estadoPedido)}</p><p class="mt-2 font-black">S/ ${soles(p.total)}</p></article>`).join("");
}

async function marcarEntregado(idPedido) {
  try {
    await apiJson(`/mesero/pedidos/${encodeURIComponent(idPedido)}/entregar`, { method: "PATCH", body: JSON.stringify({}) });
    alert("Pedido marcado como entregado.");
    await recargarMesero();
  } catch (error) {
    alert(`No se pudo marcar entregado: ${error.message}`);
  }
}

function abrirGestionCuenta(idCuenta) {
  const cuenta = cuentasActivas.find((c) => String(c.id_cuenta) === String(idCuenta));
  if (!cuenta) return alert("Cuenta no encontrada.");
  
  const panel = document.getElementById("panel-gestion");
  const contenido = document.getElementById("contenido-gestion");
  const detallesPendientes = (cuenta.detalles || []).filter((item) => Number(item.subtotal || 0) - Number(item.monto_pagado || 0) > 0);
  
  const noEntregados = detallesPendientes.filter((item) => item.estado_pedido !== 'entregado');
  if (noEntregados.length > 0) {
    alert("No se puede registrar el pago porque hay productos que aun no han sido entregados a la mesa.");
    return;
  }
  
  const esLlevarEfectivo = cuenta.tipo_pedido === "llevar" && cuenta.metodoPago === "Efectivo al recoger";
  const vueltoEstimado = cuenta.vuelto_estimado || 0;
  const montoRecibido = cuenta.monto_recibido || cuenta.total_pendiente || 0;
  
  const itemsHtml = detallesPendientes.map((item) => `
    <label class="flex items-start gap-3 border-b border-slate-100 py-3">
      <input type="checkbox" class="item-pago h-5 w-5" data-id="${item.id_detalle_producto}" data-monto="${Number(item.subtotal) - Number(item.monto_pagado || 0)}" checked>
      <span class="flex-1"><strong>${escapeHtml(item.nombre)}</strong><br><small>${escapeHtml(item.observacion || "")}</small></span>
      <strong>S/ ${soles(Number(item.subtotal) - Number(item.monto_pagado || 0))}</strong>
    </label>`).join("");
  
  const totalPendiente = Number(cuenta.total_pendiente || 0);
  contenido.innerHTML = `
  <input type="hidden" id="monto-pago" value="${totalPendiente}">
  <div class="border-b border-slate-200 p-5">
    <div class="flex justify-between gap-3">
      <div>
        <p class="text-sm font-black uppercase tracking-wide text-slate-500">Registrar pago</p>
        <h2 class="mt-1 text-3xl font-black text-slate-950">${escapeHtml(cuenta.etiqueta)}</h2>
        ${esLlevarEfectivo ? `<p class="mt-1 text-sm font-semibold text-emerald-600">Vuelto estimado: S/ ${soles(vueltoEstimado)}</p>` : ''}
        ${esLlevarEfectivo ? `<p class="text-sm font-semibold text-slate-500">Cliente pagara con: S/ ${soles(montoRecibido)}</p>` : ''}
      </div>
      <button onclick="cerrarGestion()" class="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-black">Cerrar</button>
    </div>
  </div>
  <div class="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_360px]">
    <section class="rounded-3xl border border-slate-200 p-4">
      <h3 class="mb-3 font-black">Productos pendientes</h3>
      ${itemsHtml || "<p>No hay productos pendientes.</p>"}
    </section>
    <form onsubmit="registrarPagoCuenta(event, '${cuenta.id_cuenta}')" class="rounded-3xl bg-slate-50 p-4">
      <label class="block">
        <span class="text-xs font-black uppercase text-slate-500">Metodo de pago</span>
        <select id="metodo-pago-gestion" class="mt-1 w-full rounded-xl border px-3 py-2">
          <option value="Efectivo">Efectivo</option>
          <option value="Yape">Yape</option>
          <option value="Tarjeta">Tarjeta</option>
        </select>
      </label>
      <div id="simulacion-pago-gestion" class="mt-3"></div>
      <label class="mt-3 block">
        <span class="text-xs font-black uppercase text-slate-500">Comprobante</span>
        <select id="tipo-comprobante" class="mt-1 w-full rounded-xl border px-3 py-2" onchange="actualizarValidacionDocumentoGestion()">
          <option value="boleta">Boleta</option>
          <option value="factura">Factura</option>
        </select>
      </label>
      <label class="mt-3 block">
        <span class="text-xs font-black uppercase text-slate-500" id="label-documento-gestion">Documento</span>
        <input id="documento-pago" value="" maxlength="11" class="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Ingrese documento">
        <p id="error-documento-gestion" class="mt-1 hidden text-xs font-bold text-red-600">El documento debe tener 8 digitos para boleta o 11 digitos para factura</p>
      </label>
      <button class="mt-5 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white">Guardar pago</button>
    </form>
  </div>`;

  const metodoSelect = document.getElementById("metodo-pago-gestion");
  if (metodoSelect) {
    metodoSelect.addEventListener("change", () => actualizarSimulacionPagoGestion());
    actualizarSimulacionPagoGestion();
  }
  
  const docInput = document.getElementById("documento-pago");
  if (docInput) {
    docInput.addEventListener("input", function(e) {
      this.value = this.value.replace(/\D/g, '');
      validarDocumentoGestion();
    });
    docInput.addEventListener("blur", function(e) {
      validarDocumentoGestion();
    });
  }
  
  const tipoSelect = document.getElementById("tipo-comprobante");
  if (tipoSelect) {
    tipoSelect.addEventListener("change", function() {
      validarDocumentoGestion();
      actualizarLabelDocumentoGestion();
    });
  }
  
  actualizarLabelDocumentoGestion();
  validarDocumentoGestion();
  panel.classList.remove("hidden");
}
function actualizarLabelDocumentoGestion() {
  const tipo = document.getElementById("tipo-comprobante")?.value || "boleta";
  const label = document.getElementById("label-documento-gestion");
  if (label) {
    label.textContent = tipo === "factura" ? "RUC (11 dígitos)" : "DNI (8 dígitos)";
  }
  const input = document.getElementById("documento-pago");
  if (input) {
    input.maxLength = tipo === "factura" ? 11 : 8;
    input.placeholder = tipo === "factura" ? "Ingrese RUC" : "Ingrese DNI";
  }
}

function validarDocumentoGestion() {
  const tipo = document.getElementById("tipo-comprobante")?.value || "boleta";
  const input = document.getElementById("documento-pago");
  const error = document.getElementById("error-documento-gestion");
  if (!input || !error) return;
  
  const valor = input.value.replace(/\D/g, '');
  input.value = valor;
  
  const longitudRequerida = tipo === "factura" ? 11 : 8;
  const esValido = valor.length === longitudRequerida || valor.length === 0;
  
  if (!esValido && valor.length > 0) {
    error.classList.remove("hidden");
    input.classList.add("border-red-500", "ring-2", "ring-red-100");
  } else {
    error.classList.add("hidden");
    input.classList.remove("border-red-500", "ring-2", "ring-red-100");
  }
  
  return esValido;
}

function actualizarValidacionDocumentoGestion() {
  actualizarLabelDocumentoGestion();
  validarDocumentoGestion();
}
function cerrarGestion() {
  document.getElementById("panel-gestion")?.classList.add("hidden");
  const contenido = document.getElementById("contenido-gestion");
  if (contenido) contenido.innerHTML = "";
}

function actualizarSimulacionPagoGestion() {
  const metodo = document.getElementById("metodo-pago-gestion")?.value || "Efectivo";
  const box = document.getElementById("simulacion-pago-gestion");
  if (!box) return;

  const totalPendiente = Number(document.getElementById("monto-pago")?.value || 0);

  if (metodo === "Yape") {
    box.className = "mt-3 rounded-2xl border border-purple-200 bg-purple-50 p-3";
    box.innerHTML = `<label class="block"><span class="text-xs font-black uppercase text-purple-700">Celular Yape</span><input id="yape-celular" type="text" maxlength="9" placeholder="999 999 999" class="mt-1 w-full rounded-xl border border-purple-200 px-3 py-2 font-bold"></label><div class="mt-2"><span class="text-xs font-black uppercase text-purple-700">Codigo</span><div class="mt-1 grid grid-cols-6 gap-1">${Array.from({ length: 6 }, () => `<input type="text" maxlength="1" class="codigo-yape-gestion h-10 w-full rounded-xl border border-purple-200 text-center font-black">`).join('')}</div></div>`;
    activarCajasCodigoYapeGestion();
  } else if (metodo === "Tarjeta") {
    box.className = "mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3";
    box.innerHTML = `<label class="block"><span class="text-xs font-black uppercase text-slate-500">Numero de tarjeta</span><input id="tarjeta-numero" type="text" maxlength="19" placeholder="0000 0000 0000 0000" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold"></label><div class="mt-2 grid grid-cols-2 gap-2"><input id="tarjeta-vencimiento" type="text" maxlength="5" placeholder="MM/AA" class="rounded-xl border border-slate-200 px-3 py-2 font-bold"><input id="tarjeta-cvv" type="password" maxlength="3" placeholder="CVV" class="rounded-xl border border-slate-200 px-3 py-2 font-bold"></div>`;
  } else {
    box.className = "mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3";
    box.innerHTML = `<label class="block"><span class="text-xs font-black uppercase text-emerald-700">Monto recibido</span><input id="monto-recibido-gestion" type="number" step="0.10" min="0" class="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2 font-bold" placeholder="${soles(totalPendiente)}"></label><p class="mt-2 text-sm font-bold text-emerald-800">Vuelto: S/ <span id="vuelto-gestion">0.00</span></p>`;
    const montoRecibido = document.getElementById("monto-recibido-gestion");
    if (montoRecibido) {
      montoRecibido.value = totalPendiente;
      montoRecibido.addEventListener("input", () => {
        const recibido = Number(montoRecibido.value || 0);
        const vuelto = Math.max(recibido - totalPendiente, 0);
        const vueltoSpan = document.getElementById("vuelto-gestion");
        if (vueltoSpan) vueltoSpan.textContent = soles(vuelto);
      });
    }
  }
}

function activarCajasCodigoYapeGestion() {
  const inputs = Array.from(document.querySelectorAll('.codigo-yape-gestion'));
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

async function registrarPagoCuenta(event, idCuenta) {
  event.preventDefault();
  
  const tipoComprobante = document.getElementById("tipo-comprobante")?.value || "boleta";
  const documento = document.getElementById("documento-pago")?.value || "";
  
  if (tipoComprobante === "boleta" && documento.length !== 8 && documento.length > 0) {
    alert("El DNI debe tener 8 digitos.");
    return;
  }
  
  if (tipoComprobante === "factura" && documento.length !== 11 && documento.length > 0) {
    alert("El RUC debe tener 11 digitos.");
    return;
  }
  
  const items = Array.from(document.querySelectorAll(".item-pago:checked")).map((input) => ({
    id_detalle_producto: Number(input.dataset.id),
    monto: Number(input.dataset.monto)
  })).filter((item) => item.id_detalle_producto && item.monto > 0);
  
  const metodoPago = document.getElementById("metodo-pago-gestion")?.value || "Efectivo";
  const montoPendiente = Number(document.getElementById("monto-pago")?.value || 0);
  let monto = items.length ? items.reduce((s, item) => s + Number(item.monto || 0), 0) : montoPendiente;
  
  if (monto <= 0) {
    alert("Esta cuenta ya no tiene monto pendiente por cobrar.");
    cerrarGestion();
    recargarMesero();
    return;
  }

  if (metodoPago === "Efectivo") {
    const recibido = Number(document.getElementById("monto-recibido-gestion")?.value || 0);
    if (recibido > 0 && recibido < monto) {
      alert("El monto recibido no puede ser menor al total a pagar.");
      return;
    }
  }
  
  if (metodoPago === "Yape") {
    const celular = (document.getElementById("yape-celular")?.value || "").replace(/\D/g, "");
    const codigos = Array.from(document.querySelectorAll('.codigo-yape-gestion')).map(i => i.value).join('');
    if (celular.length !== 9) {
      alert("Ingresa un celular Yape valido de 9 digitos.");
      return;
    }
    if (codigos.length !== 6) {
      alert("Ingresa el codigo de aprobacion Yape de 6 digitos.");
      return;
    }
  }
  
  if (metodoPago === "Tarjeta") {
    const numero = (document.getElementById("tarjeta-numero")?.value || "").replace(/\D/g, "");
    const cvv = (document.getElementById("tarjeta-cvv")?.value || "").replace(/\D/g, "");
    if (numero.length < 13 || cvv.length !== 3) {
      alert("Ingresa datos de tarjeta validos para la simulacion.");
      return;
    }
  }
  
  if (!idCuenta) {
    alert("Error: No se encontro la cuenta.");
    return;
  }
  
  if (monto <= 0) {
    alert("Error: El monto a pagar debe ser mayor a 0.");
    return;
  }
  
  const payload = {
    id_cuenta: Number(idCuenta),
    metodoPago: metodoPago,
    monto: monto,
    detalles: items,
    tipo_comprobante: tipoComprobante,
    dni: tipoComprobante === "boleta" ? documento : undefined,
    ruc: tipoComprobante === "factura" ? documento : undefined,
    razon_social: tipoComprobante === "factura" ? "Cliente" : undefined,
    pagado_por: "Cliente"
  };
  
  try {
    const response = await fetch(`${API_BASE}/cuentas/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || data.error || "Error al registrar pago");
    }
    
    const pedidoActualizado = data.data || {};
    
    localStorage.setItem("ultimaBoleta", JSON.stringify({
      ...pedidoActualizado,
      cliente: pedidoActualizado.cliente || pedidoActualizado.nombre_cliente || "Cliente",
      numeroBoleta: pedidoActualizado.numeroBoleta || `BOL-${String(Date.now()).slice(-6)}`,
      fecha: new Date().toISOString(),
      productos: pedidoActualizado.detalles || pedidoActualizado.productos || [],
      total: pedidoActualizado.total || monto,
      metodoPago: metodoPago,
      tipoConsumo: pedidoActualizado.tipo_pedido || "llevar",
      documento: documento || "00000000"
    }));
    
    alert("Pago registrado correctamente. Generando boleta...");
    cerrarGestion();
    
    window.location.href = "boleta.html";
  } catch (error) {
    console.error("Error en pago:", error);
    alert(`No se pudo registrar el pago: ${error.message}`);
  }
}

function abrirPanelUnirMesas() {
  const panel = document.getElementById("panel-unir-mesas");
  if (!panel) return;
  panel.classList.remove("hidden");
  const principal = document.getElementById("unir-principal");
  const opciones = document.getElementById("unir-opciones");
  const libres = mesasBackend.filter((m) => ["libre", "ocupada"].includes(m.estado));
  principal.innerHTML = libres.map((m) => `<option value="${m.numero_mesa || m.numero}">Mesa ${m.numero_mesa || m.numero} - ${m.estado}</option>`).join("");
  opciones.innerHTML = libres.map((m) => `<label class="rounded-xl bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" class="mesa-unir" value="${m.numero_mesa || m.numero}"> Mesa ${m.numero_mesa || m.numero}</label>`).join("");
}

function cerrarPanelUnirMesas() { document.getElementById("panel-unir-mesas")?.classList.add("hidden"); }

async function confirmarUnionMesas() {
  const principal = Number(document.getElementById("unir-principal")?.value || 0);
  const secundarias = Array.from(document.querySelectorAll(".mesa-unir:checked")).map((i) => Number(i.value)).filter((n) => n && n !== principal);
  if (!principal || secundarias.length === 0) return alert("Selecciona mesa principal y secundarias.");
  try {
    await apiJson("/mesas/unir", { method: "POST", body: JSON.stringify({ mesa_principal: principal, mesas_a_unir: secundarias }) });
    alert("Mesas unidas en la base de datos.");
    cerrarPanelUnirMesas();
    await recargarMesero();
  } catch (error) {
    alert(`No se pudo unir mesas: ${error.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  recargarMesero();
  setInterval(recargarMesero, 20000);
  function iniciarEscuchaEventosMesero() {
  realTime.connect();

  const handlePedidoActualizado = () => {
    recargarMesero();
  };

  realTime.on('pedido:creado', handlePedidoActualizado);
  realTime.on('pedido:actualizado', handlePedidoActualizado);
  realTime.on('mesa:actualizada', handlePedidoActualizado);
  realTime.on('cuenta:actualizada', handlePedidoActualizado);
  realTime.on('pago:registrado', handlePedidoActualizado);
}

document.addEventListener('DOMContentLoaded', () => {
  recargarMesero();
  iniciarEscuchaEventosMesero();
  setInterval(recargarMesero, 20000);
});
});