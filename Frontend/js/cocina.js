if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let pedidos = [];
let filtroActual = "todos";

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
}

function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function soles(valor) {
  return Number(valor || 0).toFixed(2);
}

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarPedidos() {
  const data = await apiJson("/cocina/pedidos");
  pedidos = data.data || [];
}

function estadoPedido(pedido) {
  return pedido.estadoPedido || pedido.estado || "Pendiente";
}

function estadoDb(pedido) {
  return pedido.estado_db || normalizar(estadoPedido(pedido));
}

function esEntregadoOPagado(pedido) {
  const e = estadoDb(pedido);
  return ["entregado", "cancelado"].includes(e);
}

function esListo(pedido) {
  return estadoDb(pedido) === "listo" || normalizar(estadoPedido(pedido)).includes("listo");
}

function esPedidoLlevar(pedido) {
  const tipo = normalizar(pedido.tipo_pedido || pedido.tipoConsumo);
  return tipo.includes("llevar") || tipo.includes("recoger");
}

function textoListoSegunTipo(pedido) {
  return esPedidoLlevar(pedido) ? "Listo para recoger" : "Listo para llevar a la mesa";
}

function pedidosActivosCocina() {
  return pedidos.filter((pedido) => !esEntregadoOPagado(pedido));
}

function filtrarPedidos(estado) {
  filtroActual = estado;
  mostrarPedidos();
}

function coincideFiltro(pedido) {
  if (filtroActual === "todos") return true;
  if (filtroActual === "listos") return esListo(pedido);
  if (filtroActual === "Pendiente") return estadoDb(pedido) === "pendiente";
  if (filtroActual === "En preparación") return estadoDb(pedido) === "preparando";
  return normalizar(estadoPedido(pedido)) === normalizar(filtroActual);
}

async function mostrarPedidos() {
  const contenedor = document.getElementById("contenedor-pedidos");
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="col-span-full rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
      Cargando pedidos desde la base de datos...
    </div>`;

  try {
    await cargarPedidos();
  } catch (error) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
        <h2 class="text-2xl font-black">No se pudo conectar con cocina</h2>
        <p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p>
      </div>`;
    return;
  }

  const pedidosFiltrados = pedidosActivosCocina().filter(coincideFiltro);
  if (pedidosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h2 class="text-2xl font-black text-slate-800">No hay pedidos para mostrar</h2>
        <p class="mt-2 text-slate-500">Cocina solo ve pedidos pendientes, en preparacion o listos.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = pedidosFiltrados.map(renderPedido).join("");
}

function renderPedido(pedido) {
  const productos = pedido.productos || pedido.items || [];
  const estado = estadoPedido(pedido);
  const listo = esListo(pedido);
  const textoListo = textoListoSegunTipo(pedido);

  const productosHtml = productos.map((item) => `
    <li class="rounded-2xl border border-slate-200 bg-white p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black text-slate-950">${escapeHtml(item.nombre)} · x${Number(item.cantidad || 1)}</p>
          <p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || item.comentario || "Sin observaciones")}</p>
        </div>
        <span class="text-sm font-black text-slate-700">S/ ${soles(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1))}</span>
      </div>
    </li>`).join("");

  const acciones = listo
    ? `<div class="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">
         Pedido listo. Desde este momento aparece en el panel del mesero para entregarlo.
       </div>`
    : `<div class="grid grid-cols-1 gap-3">
         ${estadoDb(pedido) !== "preparando" ? `<button type="button" onclick="cambiarEstado('${escapeHtml(String(pedido.id_pedido || pedido.id))}', 'preparando')" class="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-yellow-500">En preparacion</button>` : ""}
         <button type="button" onclick="cambiarEstado('${escapeHtml(String(pedido.id_pedido || pedido.id))}', 'listo')" class="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">${textoListo}</button>
       </div>`;

  return `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p>
          <h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido || pedido.id}`)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.fecha || "")} ${escapeHtml(pedido.hora || "")}</p>
        </div>
        <span class="rounded-full px-3 py-1.5 text-sm font-black ${colorEstado(estado)}">${escapeHtml(estado)}</span>
      </div>
      <div class="mb-4 rounded-2xl bg-slate-50 p-4 text-sm">
        <p><strong>Tipo:</strong> ${escapeHtml(pedido.tipoConsumo || pedido.tipo_pedido || "No definido")}</p>
        <p><strong>Mesa:</strong> ${escapeHtml(pedido.mesa || "No aplica")}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Consumidor final")}</p>
        <p><strong>Total:</strong> S/ ${soles(pedido.total)}</p>
      </div>
      <ul class="mb-4 space-y-2">${productosHtml}</ul>
      ${acciones}
    </article>`;
}

function colorEstado(estado) {
  const e = normalizar(estado);
  if (e.includes("listo")) return "bg-emerald-100 text-emerald-700";
  if (e.includes("prepar")) return "bg-yellow-100 text-yellow-700";
  if (e.includes("entregado")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

async function cambiarEstado(idPedido, nuevoEstado) {
  try {
    await apiJson(`/cocina/pedidos/${encodeURIComponent(idPedido)}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    await mostrarPedidos();
  } catch (error) {
    alert(`No se pudo actualizar el pedido: ${error.message}`);
  }
}

function recargarCocina() {
  mostrarPedidos();
}

document.addEventListener("DOMContentLoaded", () => {
  mostrarPedidos();
  setInterval(mostrarPedidos, 15000);
  function iniciarEscuchaEventosCocina() {
  realTime.connect();

  const handlePedidoActualizado = () => {
    mostrarPedidos();
  };

  realTime.on('pedido:creado', handlePedidoActualizado);
  realTime.on('pedido:actualizado', handlePedidoActualizado);
}

document.addEventListener('DOMContentLoaded', () => {
  mostrarPedidos();
  iniciarEscuchaEventosCocina();
  setInterval(mostrarPedidos, 15000);
});
});
