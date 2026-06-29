const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let pedidosActuales = [];
let mesaActualCliente = null;

function soles(valor) { return Number(valor || 0).toFixed(2); }
function normalizar(valor) { return String(valor || "").trim().toLowerCase(); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function obtenerMesaActual() {
  const params = new URLSearchParams(window.location.search);
  const mesaUrl = params.get("mesa");
  if (mesaUrl) { localStorage.setItem("mesa", mesaUrl); localStorage.setItem("mesaActual", mesaUrl); return mesaUrl; }
  return localStorage.getItem("mesa") || localStorage.getItem("mesaActual") || "Sin mesa asignada";
}

function obtenerTokenMesaActual() {
  const params = new URLSearchParams(window.location.search);
  const tokenUrl = params.get("token");
  if (tokenUrl) { localStorage.setItem("mesaToken", tokenUrl); return tokenUrl; }
  return localStorage.getItem("mesaToken") || "";
}

function urlMenuMesa(numeroMesa) {
  const token = obtenerTokenMesaActual();
  if (numeroMesa && token) return `menu.html?mesa=${encodeURIComponent(numeroMesa)}&token=${encodeURIComponent(token)}`;
  return numeroMesa ? `menu.html?mesa=${encodeURIComponent(numeroMesa)}` : "menu.html";
}

function totalItem(item) { return Number(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1)); }
function totalPedido(pedido) { return Number(pedido.total || (pedido.productos || []).reduce((s, item) => s + totalItem(item), 0)); }
function totalPendientePedido(pedido) { return normalizar(pedido.estadoPago) === "pagado" ? 0 : totalPedido(pedido); }

function claseEstadoPedido(estado) {
  const e = normalizar(estado);
  if (e.includes("entregado")) return "bg-blue-100 text-blue-700";
  if (e.includes("listo")) return "bg-emerald-100 text-emerald-700";
  if (e.includes("prepar")) return "bg-yellow-100 text-yellow-700";
  if (e.includes("cancel")) return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function textoEstadoCliente(estado) {
  const e = normalizar(estado);
  if (e.includes("entregado")) return "Entregado por el mesero";
  if (e.includes("listo")) return "Listo para entregar";
  if (e.includes("prepar")) return "En preparacion";
  if (e.includes("cancel")) return "Cancelado";
  return "Pendiente en cocina";
}

function itemHtml(item) {
  return `<li class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="flex items-start justify-between gap-3"><div><p class="text-sm font-black text-slate-950">${escapeHtml(item.nombre)} x${Number(item.cantidad || 1)}</p><p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || "Sin observaciones")}</p></div><p class="text-sm font-black">S/ ${soles(totalItem(item))}</p></div></li>`;
}

function pedidoHtml(pedido) {
  const estado = pedido.estadoPedido || pedido.estado || "Pendiente";
  return `<article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5"><div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p class="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p><h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.fecha || "")} ${escapeHtml(pedido.hora || "")}</p></div><span class="w-fit rounded-full px-3 py-1.5 text-sm font-black ${claseEstadoPedido(estado)}">${textoEstadoCliente(estado)}</span></div><ul class="mb-4 space-y-2">${(pedido.productos || []).map(itemHtml).join("")}</ul><div class="grid grid-cols-2 gap-3"><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Total</p><p class="text-xl font-black">S/ ${soles(totalPedido(pedido))}</p></div><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Pendiente</p><p class="text-xl font-black text-orange-600">S/ ${soles(totalPendientePedido(pedido))}</p></div></div></article>`;
}

async function cargarPedidosMesa() {
  const mesa = obtenerMesaActual();
  mesaActualCliente = mesa;
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (!numero) return [];
  const data = await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}`);
  return data.data || [];
}

async function renderPedidoActual() {
  const contenedor = document.getElementById("contenedor-pedido-actual");
  if (!contenedor) return;
  const mesa = obtenerMesaActual();
  document.getElementById("stat-mesa").textContent = mesa;
  document.getElementById("btn-agregar-header").href = urlMenuMesa(String(mesa).match(/\d+/)?.[0] || "");
  document.getElementById("btn-agregar-footer").href = document.getElementById("btn-agregar-header").href;
  contenedor.innerHTML = `<div class="rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando pedido desde la BD...</div>`;

  try {
    pedidosActuales = await cargarPedidosMesa();
  } catch (error) {
    contenedor.innerHTML = `<div class="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar el pedido</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
    return;
  }

  if (!pedidosActuales.length) {
    contenedor.innerHTML = `<div class="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 class="text-2xl font-black text-slate-800">No hay pedidos activos</h2><p class="mx-auto mt-2 max-w-xl text-slate-500">Cuando confirmes un pedido, aqui veras el estado de cocina, entrega y el total acumulado.</p></div>`;
  } else {
    contenedor.innerHTML = pedidosActuales.map(pedidoHtml).join("");
  }

  document.getElementById("stat-pedidos").textContent = pedidosActuales.length;
  document.getElementById("stat-pendiente").textContent = soles(pedidosActuales.reduce((s, p) => s + totalPendientePedido(p), 0));
  document.getElementById("stat-cuenta").textContent = pedidosActuales.length ? "Activa" : "Sin cuenta";
}

async function cargarPedidosMesa() {
  const mesa = obtenerMesaActual();
  mesaActualCliente = mesa;
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (!numero) return [];
  
  try {
    const data = await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}`);
    const pedidos = data.data || [];
    
    const pedidosActivos = pedidos.filter(p => {
      const estado = p.estado_db || p.estado || '';
      const pagoCompleto = p.pago_completo === true;
      const estadoPago = p.estadoPago || '';
      
      return estado !== 'cancelado' && !pagoCompleto && estadoPago !== 'Pagado';
    });
    
    return pedidosActivos;
  } catch (error) {
    console.error('Error cargando pedidos:', error);
    return [];
  }
}

function tienePedidosPendientes() {
  return pedidosActuales.some(p => {
    const estado = p.estado_db || p.estado || '';
    const pagoCompleto = p.pago_completo === true;
    const estadoPago = p.estadoPago || '';
    return estado !== 'cancelado' && !pagoCompleto && estadoPago !== 'Pagado';
  });
}

function totalPendientePedido(pedido) {
  const pagoCompleto = pedido.pago_completo === true;
  const estadoPago = pedido.estadoPago || '';
  if (pagoCompleto || estadoPago === 'Pagado') {
    return 0;
  }
  return totalPedido(pedido);
}

async function renderPedidoActual() {
  const contenedor = document.getElementById("contenedor-pedido-actual");
  if (!contenedor) return;
  const mesa = obtenerMesaActual();
  const numeroMesa = String(mesa).match(/\d+/)?.[0] || "";
  
  document.getElementById("stat-mesa").textContent = mesa;
  document.getElementById("btn-agregar-header").href = urlMenuMesa(numeroMesa);
  document.getElementById("btn-agregar-footer").href = document.getElementById("btn-agregar-header").href;
  contenedor.innerHTML = `<div class="rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando pedido desde la BD...</div>`;

  try {
    pedidosActuales = await cargarPedidosMesa();
  } catch (error) {
    contenedor.innerHTML = `<div class="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar el pedido</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
    return;
  }

  const hayPendientes = tienePedidosPendientes();

  if (!pedidosActuales.length || !hayPendientes) {
    contenedor.innerHTML = `
      <div class="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 class="text-2xl font-black text-slate-800">No hay pedidos activos</h2>
        <p class="mx-auto mt-2 max-w-xl text-slate-500">Todos los pedidos de esta mesa ya fueron entregados y pagados. Puedes comenzar un nuevo pedido.</p>
        <div class="mt-6">
          <a href="${urlMenuMesa(numeroMesa)}" class="rounded-2xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600">Hacer un nuevo pedido</a>
        </div>
      </div>`;
  } else {
    contenedor.innerHTML = pedidosActuales.map(pedidoHtml).join("");
  }

  const totalPendiente = pedidosActuales.reduce((s, p) => s + totalPendientePedido(p), 0);
  document.getElementById("stat-pedidos").textContent = pedidosActuales.length;
  document.getElementById("stat-pendiente").textContent = soles(totalPendiente);
  document.getElementById("stat-cuenta").textContent = hayPendientes ? "Activa" : "Sin cuenta activa";
}

function pedidoHtml(pedido) {
  const estado = pedido.estadoPedido || pedido.estado || "Pendiente";
  const pagoCompleto = pedido.pago_completo === true;
  const estadoPago = pedido.estadoPago || '';
  const pendiente = totalPendientePedido(pedido);
  
  let estadoTexto = textoEstadoCliente(estado);
  if (pagoCompleto || estadoPago === 'Pagado') {
    estadoTexto = 'Pagado';
  }
  
  const estadoClase = (pagoCompleto || estadoPago === 'Pagado') 
    ? 'bg-emerald-100 text-emerald-700' 
    : claseEstadoPedido(estado);
  
  return `<article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p>
        <h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</h2>
        <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.fecha || "")} ${escapeHtml(pedido.hora || "")}</p>
      </div>
      <span class="w-fit rounded-full px-3 py-1.5 text-sm font-black ${estadoClase}">${estadoTexto}</span>
    </div>
    <ul class="mb-4 space-y-2">${(pedido.productos || []).map(itemHtml).join("")}</ul>
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-xs font-black uppercase text-slate-500">Total</p>
        <p class="text-xl font-black">S/ ${soles(totalPedido(pedido))}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-xs font-black uppercase text-slate-500">Pendiente</p>
        <p class="text-xl font-black text-orange-600">S/ ${soles(pendiente)}</p>
      </div>
    </div>
  </article>`;
}


function recargarPedidoActual() {
  return renderPedidoActual();
}

function abrirModalComentario() {
  const modal = document.getElementById("modal-comentario-mesero");
  if (!modal) return;
  document.getElementById("motivo-comentario-mesero").value = "";
  document.getElementById("detalle-comentario-mesero").value = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function cerrarModalComentario() {
  const modal = document.getElementById("modal-comentario-mesero");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

async function enviarComentarioMesero(event) {
  event.preventDefault();
  const mesa = obtenerMesaActual();
  const numero = String(mesa || "").match(/\d+/)?.[0];
  const motivo = document.getElementById("motivo-comentario-mesero")?.value || "";
  const detalle = document.getElementById("detalle-comentario-mesero")?.value || "";
  const boton = document.getElementById("btn-enviar-comentario-mesero");

  if (!numero) return alert("No se pudo identificar la mesa. Escanea nuevamente el QR.");
  if (!motivo) return alert("Selecciona el motivo del comentario.");

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Enviando...";
    }
    await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}/comentario`, {
      method: "POST",
      body: JSON.stringify({
        motivo,
        detalle,
        qr_token: obtenerTokenMesaActual(),
      }),
    });
    cerrarModalComentario();
    document.getElementById("aviso-comentario")?.classList.remove("hidden");
    alert("Comentario enviado al mesero.");
  } catch (error) {
    alert(`No se pudo enviar el comentario: ${error.message}`);
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Enviar al mesero";
    }
  }
}

async function solicitarCuenta() {
  if (!pedidosActuales.length) {
    alert("No hay pedidos activos para solicitar cuenta.");
    return;
  }
  
  const hayPendientes = tienePedidosPendientes();
  if (!hayPendientes) {
    alert("No hay pedidos pendientes de pago. Todos los pedidos de esta mesa ya fueron pagados.");
    return;
  }
  
  const numero = String(mesaActualCliente || "").match(/\d+/)?.[0];
  try {
    await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}/solicitar-cuenta`, { 
      method: "POST", 
      body: JSON.stringify({ nota: "Cliente solicita cuenta desde seguimiento" }) 
    });
    document.getElementById("aviso-solicitud")?.classList.remove("hidden");
    alert("Solicitud de cuenta enviada al mesero y guardada en BD.");
  } catch (error) {
    alert(`No se pudo solicitar cuenta: ${error.message}`);
  }
}

function iniciarEscuchaEventosPedidoActual() {
  if (typeof realTime !== 'undefined' && realTime) {
    realTime.connect();

    const handlePedidoActualizado = () => {
      renderPedidoActual();
    };

    realTime.on('pedido:creado', handlePedidoActualizado);
    realTime.on('pedido:actualizado', handlePedidoActualizado);
    realTime.on('pago:registrado', handlePedidoActualizado);
    realTime.on('cuenta:actualizada', handlePedidoActualizado);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderPedidoActual();
  iniciarEscuchaEventosPedidoActual();
  setInterval(renderPedidoActual, 15000);
});
