if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let filtroMesas = "todas";
let mesasBase = [];

function soles(valor) { return Number(valor || 0).toFixed(2); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarMesas() {
  const data = await apiJson("/mesas");
  mesasBase = data.data || [];
}

async function recargarMesas() {
  const contenedor = document.getElementById("contenedor-mesas");
  if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando mesas desde la BD...</div>`;
  try {
    await cargarMesas();
    renderEstadisticasMesas();
    renderAlertasComentariosMesa();
    renderMesas();
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar mesas</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
  }
}

function renderEstadisticasMesas() {
  const contar = (estado) => mesasBase.filter((m) => m.estado === estado).length;
  document.getElementById("stat-libres").textContent = contar("libre");
  document.getElementById("stat-ocupadas").textContent = contar("ocupada");
  document.getElementById("stat-pagadas").textContent = contar("pagada");
  document.getElementById("stat-limpieza").textContent = contar("limpieza");
  document.getElementById("stat-unidas").textContent = contar("unida");
}

function cambiarFiltroMesas(filtro) {
  filtroMesas = filtro;
  document.querySelectorAll(".filtro-mesa").forEach((btn) => {
    const activo = btn.dataset.filtro === filtro;
    btn.className = activo
      ? "filtro-mesa rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
      : "filtro-mesa rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100";
  });
  renderMesas();
}

function claseEstado(estado) {
  if (estado === "libre") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (estado === "ocupada") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (estado === "pagada") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (estado === "limpieza") return "bg-purple-100 text-purple-700 ring-purple-200";
  if (estado === "unida") return "bg-slate-200 text-slate-800 ring-slate-300";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function textoEstado(estado) {
  return ({ libre: "Libre", ocupada: "Ocupada", pagada: "Pagada", limpieza: "En limpieza", unida: "Unida" })[estado] || "Sin estado";
}

function alertaDeMesa(mesa) {
  return mesa.alertaCliente || mesa.comentario_cliente || null;
}

function solicitudCuentaDeMesa(mesa) {
  return mesa.solicitudCuenta || mesa.solicitud_cuenta || null;
}

function notificacionesDeMesa(mesa) {
  const notificaciones = [];
  const alerta = alertaDeMesa(mesa);
  const solicitudCuenta = solicitudCuentaDeMesa(mesa);

  if (alerta) {
    notificaciones.push({
      tipo: "comentario",
      mesa,
      id: alerta.id_comentario_mesa,
      etiqueta: "Aviso del cliente",
      titulo: alerta.motivo || "Informe del cliente",
      detalle: alerta.detalle || "Sin detalle adicional",
      color: "orange",
    });
  }

  if (solicitudCuenta) {
    notificaciones.push({
      tipo: "cuenta",
      mesa,
      id: solicitudCuenta.id_solicitud,
      etiqueta: "Solicitud de cuenta",
      titulo: "Cliente solicita cuenta",
      detalle: solicitudCuenta.nota || "El cliente solicita que el mesero se acerque para cobrar la cuenta.",
      color: "blue",
    });
  }

  return notificaciones;
}

function botonAtenderNotificacion(notificacion, modo = "oscuro") {
  const clase = modo === "claro"
    ? "rounded-xl bg-white px-3 py-2 text-xs font-black text-orange-700 ring-1 ring-orange-200"
    : "rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white";
  const accion = notificacion.tipo === "cuenta"
    ? `atenderSolicitudCuenta('${escapeHtml(String(notificacion.id))}')`
    : `atenderComentarioMesa('${escapeHtml(String(notificacion.id))}')`;
  return `<button type="button" onclick="${accion}" class="${clase}">Atendida</button>`;
}

function renderAlertasComentariosMesa() {
  const panel = document.getElementById("alertas-comentarios-mesa");
  if (!panel) return;

  const alertas = mesasBase.flatMap((mesa) => notificacionesDeMesa(mesa));

  if (!alertas.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-wide text-orange-700">Notificaciones de clientes</p>
        <h2 class="text-xl font-black text-slate-950">${alertas.length} aviso(s) requieren atencion</h2>
      </div>
      <span class="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">Pendiente de revision</span>
    </div>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${alertas.map((alerta) => `
        <article class="rounded-2xl border ${alerta.tipo === "cuenta" ? "border-blue-200" : "border-orange-200"} bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-slate-500">Mesa ${escapeHtml(alerta.mesa.numero_mesa || alerta.mesa.numero)}</p>
              <p class="text-xs font-black uppercase tracking-wide ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.etiqueta)}</p>
              <h3 class="mt-1 text-lg font-black ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.titulo)}</h3>
            </div>
            ${botonAtenderNotificacion(alerta)}
          </div>
          <p class="mt-2 text-sm font-semibold text-slate-600">${escapeHtml(alerta.detalle)}</p>
        </article>`).join("")}
    </div>`;
}

function renderMesas() {
  const contenedor = document.getElementById("contenedor-mesas");
  if (!contenedor) return;
  const mesas = filtroMesas === "todas" ? mesasBase : mesasBase.filter((m) => m.estado === filtroMesas);
  if (!mesas.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">No hay mesas en este estado</h2></div>`;
    return;
  }
  contenedor.innerHTML = mesas.map((mesa) => {
    const numero = mesa.numero_mesa || mesa.numero;
    const notificaciones = notificacionesDeMesa(mesa);
    const alertaHtml = notificaciones.length ? notificaciones.map((alerta) => `
      <div class="mt-4 rounded-2xl border ${alerta.tipo === "cuenta" ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"} p-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-xs font-black uppercase tracking-wide ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.etiqueta)}</p>
            <p class="mt-1 text-sm font-black ${alerta.tipo === "cuenta" ? "text-blue-800" : "text-orange-800"}">${escapeHtml(alerta.titulo)}</p>
          </div>
          ${botonAtenderNotificacion(alerta, "claro")}
        </div>
        <p class="mt-2 text-xs font-semibold ${alerta.tipo === "cuenta" ? "text-blue-800" : "text-orange-800"}">${escapeHtml(alerta.detalle)}</p>
      </div>`).join("") : "";

    return `<article class="rounded-3xl border ${notificaciones.length ? 'border-orange-300' : 'border-slate-200'} bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="flex items-start justify-between gap-3"><div><p class="text-sm font-black uppercase tracking-wide text-slate-500">Mesa</p><h2 class="text-3xl font-black text-slate-950">${numero}</h2></div><span class="rounded-full px-3 py-1.5 text-xs font-black ring-1 ${claseEstado(mesa.estado)}">${textoEstado(mesa.estado)}</span></div>
      <p class="mt-3 text-sm font-semibold text-slate-500">${escapeHtml(mesa.nota || mesa.grupo?.nombre || "Sin grupo")}</p>
      ${alertaHtml}
      <div class="mt-4 grid grid-cols-2 gap-2 text-sm"><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Pendiente</p><p class="font-black">S/ ${soles(mesa.pendiente)}</p></div><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Pagado</p><p class="font-black">S/ ${soles(mesa.pagado)}</p></div></div>
      <div class="mt-4 grid grid-cols-1 gap-2"><a href="tomar_pedido.html?mesa=${encodeURIComponent(numero)}" class="rounded-2xl bg-orange-500 px-4 py-3 text-center text-sm font-black text-white hover:bg-orange-600">Tomar pedido</a><a href="../Cliente/menu.html?mesa=${encodeURIComponent(numero)}" class="rounded-2xl border border-slate-300 px-4 py-3 text-center text-sm font-black text-slate-700 hover:bg-slate-50">Abrir QR/menu</a></div>
    </article>`;
  }).join("");
}

async function atenderComentarioMesa(idComentario) {
  if (!idComentario) return;
  try {
    await apiJson(`/mesas/comentarios/${encodeURIComponent(idComentario)}/atender`, { method: "PATCH", body: JSON.stringify({}) });
    await recargarMesas();
  } catch (error) {
    alert(`No se pudo marcar como atendida: ${error.message}`);
  }
}

async function atenderSolicitudCuenta(idSolicitud) {
  if (!idSolicitud) return;
  try {
    await apiJson(`/mesas/solicitudes-cuenta/${encodeURIComponent(idSolicitud)}/atender`, { method: "PATCH", body: JSON.stringify({}) });
    await recargarMesas();
  } catch (error) {
    alert(`No se pudo marcar la solicitud de cuenta como atendida: ${error.message}`);
  }
}

async function restaurarMesasDemo() {
  alert("Ahora las mesas vienen de la base de datos. Para liberar una mesa registra el pago completo de su cuenta.");
}

function iniciarEscuchaEventosMesas() {
  if (typeof realTime === 'undefined' || !realTime) return;
  realTime.connect();

  const handleMesaActualizada = () => {
    recargarMesas();
  };

  realTime.on('mesa:actualizada', handleMesaActualizada);
  realTime.on('pedido:creado', handleMesaActualizada);
  realTime.on('pedido:actualizado', handleMesaActualizada);
  realTime.on('pago:registrado', handleMesaActualizada);
  realTime.on('cuenta:actualizada', handleMesaActualizada);
  realTime.on('comentario:mesa', handleMesaActualizada);
}

document.addEventListener("DOMContentLoaded", () => {
  recargarMesas();
  iniciarEscuchaEventosMesas();
  setInterval(() => {
    if (!document.hidden) recargarMesas();
  }, 15000);
});
