if (window.MENUGO_PERSONAL_BLOQUEADO)
  throw new Error("Acceso bloqueado. Inicia sesion.");
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let vistaMesero = "listos";
let pedidosListos = [];
let pedidosMesero = [];
let mesasBackend = [];

function soles(valor) {
  return Number(valor || 0).toFixed(2);
}
function normalizar(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase();
}
function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false)
    throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDatosMesero() {
  const [listos, pedidos, mesas] = await Promise.all([
    apiJson("/mesero/pedidos/listos"),
    apiJson("/mesero/pedidos?estado=listo,entregado"),
    apiJson("/mesas"),
  ]);
  pedidosListos = listos.data || [];
  pedidosMesero = pedidos.data || [];
  mesasBackend = mesas.data || [];
}
async function recargarMesero() {
  const c = document.getElementById("contenedor-mesero");
  if (c)
    c.innerHTML =
      '<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando pedidos...</div>';
  try {
    await cargarDatosMesero();
    renderEstadisticas();
    renderVistaMesero();
  } catch (e) {
    if (c)
      c.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-xl font-black">No se pudo cargar el panel</h2><p class="mt-2">${escapeHtml(e.message)}</p></div>`;
  }
}
function renderEstadisticas() {
  const ocupadas = mesasBackend.filter((m) =>
    ["ocupada", "unida"].includes(normalizar(m.estado)),
  ).length;
  const solicitudes = mesasBackend.filter(
    (m) => m.solicitud_cuenta || m.solicitudCuenta,
  ).length;
  const llevar = pedidosListos.filter((p) => pedidoEsLlevar(p)).length;
  const entregados = pedidosMesero.filter(
    (p) => normalizar(p.estado_db || p.estadoPedido) === "entregado",
  ).length;
  document.getElementById("stat-mesas").textContent = ocupadas;
  document.getElementById("stat-solicitudes").textContent = solicitudes;
  document.getElementById("stat-listos").textContent = pedidosListos.length;
  document.getElementById("stat-llevar").textContent = llevar;
  document.getElementById("stat-entregados").textContent = entregados;
}
function cambiarVistaMesero(vista) {
  vistaMesero = vista;
  document.querySelectorAll(".vista-mesero").forEach((btn) => {
    const activo = btn.dataset.vista === vista;
    btn.className = activo
      ? "vista-mesero rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
      : "vista-mesero rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700";
  });
  renderVistaMesero();
}
function renderVistaMesero() {
  if (vistaMesero === "llevar")
    return renderPedidosListos(pedidosListos.filter((p) => pedidoEsLlevar(p)));
  if (vistaMesero === "historial") return renderHistorialMesero();
  return renderPedidosListos(pedidosListos);
}
function pedidoEsLlevar(p) {
  return normalizar(p.tipo_pedido || p.tipoConsumo).includes("llevar");
}
function renderPedidosListos(lista) {
  const c = document.getElementById("contenedor-mesero");
  if (!c) return;
  if (!lista.length) {
    c.innerHTML =
      '<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 class="text-2xl font-black">No hay pedidos listos</h2><p class="mt-2 text-slate-500">Apareceran aqui cuando Cocina los marque como listos.</p></div>';
    return;
  }
  c.innerHTML = lista
    .map(
      (p) =>
        `<article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5"><div class="mb-4 flex items-start justify-between gap-3"><div><p class="text-sm font-black uppercase text-emerald-600">Listo para ${pedidoEsLlevar(p) ? "recoger" : "llevar a mesa"}</p><h2 class="text-2xl font-black">${escapeHtml(p.codigo || `PED-${p.id_pedido}`)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(p.cliente || p.nombre_cliente || "Cliente")}</p></div><span class="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-700">Listo</span></div><div class="mb-4 grid grid-cols-3 gap-3"><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Mesa</p><p class="mt-1 font-black">${escapeHtml(p.mesa || "No aplica")}</p></div><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Tipo</p><p class="mt-1 font-black">${escapeHtml(p.tipoConsumo || p.tipo_pedido)}</p></div><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Total</p><p class="mt-1 font-black">S/ ${soles(p.total)}</p></div></div><ul class="mb-4 space-y-2">${(p.productos || []).map((i) => `<li class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="flex justify-between gap-3"><div><p class="text-sm font-black">${escapeHtml(i.nombre)} x${Number(i.cantidad || 1)}</p><p class="text-xs text-slate-500">${escapeHtml(i.observacion || i.opcion || "Sin observaciones")}</p></div><strong>S/ ${soles(i.subtotal || Number(i.precio || 0) * Number(i.cantidad || 1))}</strong></div></li>`).join("")}</ul><button onclick="marcarEntregado('${escapeHtml(String(p.id_pedido || p.id))}')" class="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">${pedidoEsLlevar(p) ? "Marcar recogido" : "Marcar entregado a mesa"}</button></article>`,
    )
    .join("");
}
function renderHistorialMesero() {
  const entregados = pedidosMesero.filter(
    (p) => normalizar(p.estado_db || p.estadoPedido) === "entregado",
  );
  const c = document.getElementById("contenedor-mesero");
  if (!entregados.length) {
    c.innerHTML =
      '<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center font-bold text-slate-500">Sin pedidos entregados.</div>';
    return;
  }
  c.innerHTML = entregados
    .map(
      (p) =>
        `<article class="rounded-3xl border border-slate-200 bg-white p-5"><p class="text-xs font-black uppercase text-emerald-600">Entregado</p><h2 class="mt-1 text-xl font-black">${escapeHtml(p.codigo || `PED-${p.id_pedido}`)}</h2><p class="mt-1 text-sm text-slate-500">${escapeHtml(p.mesa || p.tipoConsumo || "")}</p><p class="mt-2 font-black">S/ ${soles(p.total)}</p></article>`,
    )
    .join("");
}
async function marcarEntregado(id) {
  try {
    await apiJson(`/mesero/pedidos/${encodeURIComponent(id)}/entregar`, {
      method: "PATCH",
      body: "{}",
    });
    alert(
      "Pedido marcado como entregado. Caja ya puede cobrar los productos entregados.",
    );
    await recargarMesero();
  } catch (e) {
    alert(`No se pudo marcar entregado: ${e.message}`);
  }
}
function abrirPanelUnirMesas() {
  const panel = document.getElementById("panel-unir-mesas");
  if (!panel) return;
  panel.classList.remove("hidden");
  const principal = document.getElementById("unir-principal");
  const opciones = document.getElementById("unir-opciones");
  const libres = mesasBackend.filter((m) =>
    ["libre", "ocupada"].includes(normalizar(m.estado)),
  );
  principal.innerHTML = libres
    .map(
      (m) =>
        `<option value="${m.numero_mesa || m.numero}">Mesa ${m.numero_mesa || m.numero} - ${m.estado}</option>`,
    )
    .join("");
  opciones.innerHTML = libres
    .map(
      (m) =>
        `<label class="rounded-xl bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" class="mesa-unir" value="${m.numero_mesa || m.numero}"> Mesa ${m.numero_mesa || m.numero}</label>`,
    )
    .join("");
}
function cerrarPanelUnirMesas() {
  document.getElementById("panel-unir-mesas")?.classList.add("hidden");
}
async function confirmarUnionMesas() {
  const principal = Number(
    document.getElementById("unir-principal")?.value || 0,
  );
  const secundarias = Array.from(
    document.querySelectorAll(".mesa-unir:checked"),
  )
    .map((i) => Number(i.value))
    .filter((n) => n && n !== principal);
  if (!principal || !secundarias.length)
    return alert("Selecciona mesa principal y secundarias.");
  try {
    await apiJson("/mesas/unir", {
      method: "POST",
      body: JSON.stringify({
        mesa_principal: principal,
        mesas_a_unir: secundarias,
      }),
    });
    alert("Mesas unidas. El cobro final sera gestionado por Caja.");
    cerrarPanelUnirMesas();
    await recargarMesero();
  } catch (e) {
    alert(`No se pudo unir mesas: ${e.message}`);
  }
}
function iniciarEscuchaEventosMesero() {
  if (!window.realTime) return;
  realTime.connect();
  const refrescar = () => recargarMesero();
  realTime.on("pedido:creado", refrescar);
  realTime.on("pedido:actualizado", refrescar);
  realTime.on("mesa:actualizada", refrescar);
  realTime.on("cuenta:actualizada", refrescar);
}
document.addEventListener("DOMContentLoaded", () => {
  recargarMesero();
  iniciarEscuchaEventosMesero();
  setInterval(recargarMesero, 20000);
});
