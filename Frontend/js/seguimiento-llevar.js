const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let codigoActual = "";
let timerSeguimiento = null;

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

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
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

function estadoInfo(estadoDb) {
  const estado = normalizar(estadoDb);
  if (estado === "preparando") return { indice: 1, titulo: "En preparación", mensaje: "Cocina ya está preparando tu pedido.", clase: "bg-yellow-100 text-yellow-800" };
  if (estado === "listo") return { indice: 2, titulo: "Listo para recoger", mensaje: "Tu pedido ya está listo. Acércate a caja o al mesero con tu código.", clase: "bg-emerald-100 text-emerald-800" };
  if (estado === "entregado") return { indice: 3, titulo: "Entregado", mensaje: "El pedido ya fue entregado al cliente.", clase: "bg-blue-100 text-blue-800" };
  if (estado === "pagado") return { indice: 3, titulo: "Pagado", mensaje: "El pedido figura como pagado.", clase: "bg-blue-100 text-blue-800" };
  if (estado === "cancelado") return { indice: 0, titulo: "Cancelado", mensaje: "El pedido fue cancelado.", clase: "bg-red-100 text-red-800" };
  return { indice: 0, titulo: "Pendiente en cocina", mensaje: "Tu pedido fue recibido y está pendiente de preparación.", clase: "bg-slate-100 text-slate-800" };
}

function pasoHtml(nombre, indice, actual) {
  const activo = actual >= indice;
  return `
    <div class="flex items-center gap-3 rounded-2xl border ${activo ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-slate-50"} p-3">
      <div class="grid h-9 w-9 place-items-center rounded-full ${activo ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-500"} text-sm font-black">${indice + 1}</div>
      <p class="font-black ${activo ? "text-slate-950" : "text-slate-500"}">${escapeHtml(nombre)}</p>
    </div>`;
}

function renderSeguimiento(pedido) {
  const contenedor = document.getElementById("seguimiento-contenido");
  if (!contenedor) return;

  const codigo = pedido.codigo_seguimiento || pedido.codigo_llevar || pedido.codigo || codigoActual;
  const estado = estadoInfo(pedido.estado_db || pedido.estado_seguimiento || pedido.estadoPedido || pedido.estado);
  const productos = pedido.productos || pedido.items || [];

  contenedor.className = "mt-5 rounded-3xl bg-white p-5 shadow-md shadow-slate-900/5";
  contenedor.innerHTML = `
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p class="text-sm font-black uppercase tracking-wide text-orange-600">Código de recojo</p>
        <h2 class="mt-1 text-4xl font-black text-slate-950">${escapeHtml(codigo)}</h2>
        <p class="mt-2 text-sm font-semibold text-slate-500">Cliente: ${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Cliente")}</p>
        <p class="text-sm font-semibold text-slate-500">Celular: ${escapeHtml(pedido.telefono_llevar || pedido.telefono || "")}</p>
      </div>
      <span class="rounded-full px-4 py-2 text-sm font-black ${estado.clase}">${escapeHtml(estado.titulo)}</span>
    </div>

    <div class="mt-5 rounded-3xl border border-orange-100 bg-orange-50 p-5">
      <h3 class="text-2xl font-black text-slate-950">${escapeHtml(estado.titulo)}</h3>
      <p class="mt-2 font-semibold text-slate-700">${escapeHtml(estado.mensaje)}</p>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
      ${pasoHtml("Pendiente", 0, estado.indice)}
      ${pasoHtml("Preparación", 1, estado.indice)}
      ${pasoHtml("Listo", 2, estado.indice)}
      ${pasoHtml("Entregado", 3, estado.indice)}
    </div>

    <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section class="rounded-3xl border border-slate-200 bg-white p-4">
        <h3 class="text-xl font-black text-slate-950">Detalle del pedido</h3>
        <div class="mt-3 space-y-2">
          ${productos.map((item) => `
            <article class="rounded-2xl bg-slate-50 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-black text-slate-950">${escapeHtml(item.nombre)} x${Number(item.cantidad || 1)}</p>
                  <p class="text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || item.comentario || "Sin observaciones")}</p>
                </div>
                <p class="font-black text-slate-800">S/ ${soles(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1))}</p>
              </div>
            </article>`).join("")}
        </div>
      </section>
      <aside class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Total</p>
        <p class="mt-1 text-3xl font-black text-slate-950">S/ ${soles(pedido.total)}</p>
        <p class="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">Pago</p>
        <p class="mt-1 font-black ${normalizar(pedido.estadoPago).includes("pagado") ? "text-emerald-700" : "text-orange-700"}">${escapeHtml(pedido.estadoPago || "Pendiente")}</p>
        <a href="MenuParaLlevar.html" class="mt-5 block rounded-2xl bg-orange-500 px-4 py-3 text-center text-sm font-black text-white hover:bg-orange-600">Hacer otro pedido</a>
      </aside>
    </div>`;
}

function renderError(mensaje) {
  const contenedor = document.getElementById("seguimiento-contenido");
  if (!contenedor) return;
  contenedor.className = "mt-5 rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700 shadow-sm";
  contenedor.innerHTML = `<h2 class="text-2xl font-black">No se pudo consultar el pedido</h2><p class="mt-2 font-semibold">${escapeHtml(mensaje)}</p>`;
}

async function consultarSeguimiento(codigo) {
  codigoActual = String(codigo || "").trim().toUpperCase();
  const input = document.getElementById("codigo-seguimiento");
  if (input) input.value = codigoActual;

  if (!codigoActual) {
    renderError("Ingresa un código válido, por ejemplo LLEV-001.");
    return;
  }

  try {
    const data = await apiJson(`/pedidos/llevar/seguimiento/${encodeURIComponent(codigoActual)}`);
    renderSeguimiento(data.data);
  } catch (error) {
    renderError(error.message);
  }
}

function consultarSeguimientoManual() {
  const codigo = document.getElementById("codigo-seguimiento")?.value || "";
  consultarSeguimiento(codigo);
}

function iniciarAutoActualizacion() {
  if (timerSeguimiento) clearInterval(timerSeguimiento);
  timerSeguimiento = setInterval(() => {
    if (!document.hidden && codigoActual) consultarSeguimiento(codigoActual);
  }, 10000);

  if (typeof realTime !== "undefined" && realTime) {
    realTime.connect();
    realTime.on("pedido:actualizado", (pedido) => {
      const codigo = pedido?.codigo_seguimiento || pedido?.codigo_llevar || pedido?.codigo;
      if (!codigo || codigo === codigoActual) consultarSeguimiento(codigoActual);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const codigo = params.get("codigo") || localStorage.getItem("ultimoCodigoLlevar") || "";
  if (codigo) consultarSeguimiento(codigo);
  iniciarAutoActualizacion();
});
