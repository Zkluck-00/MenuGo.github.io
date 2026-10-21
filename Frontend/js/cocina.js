if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let pedidos = [];
let filtroActual = "todos";
let sonidoActivo = true;

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
    const nombresFiltros = {
    todos: "Todos los pedidos",
    Pendiente: "Pedidos pendientes",
    "En preparación": "Pedidos en preparación",
    listos: "Pedidos listos"
  };

  const indicador = document.getElementById("filtro-activo");

  if (indicador) {
    indicador.textContent =
      `Mostrando: ${nombresFiltros[estado] || estado}`;
  }
  filtroActual = estado;
  console.log("Filtrando pedidos por: ", estado);
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
  const horaActual = new Date().toLocaleTimeString();

  if (pedidosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h2 class="text-2xl font-black text-slate-800">No hay pedidos para mostrar</h2>
        <p class="mt-2 text-slate-500">Cocina solo ve pedidos pendientes, en preparacion o listos.</p>
      </div>`;
    
    const subtituloVacio = document.querySelector("header p");
    if (subtituloVacio) {
        subtituloVacio.textContent = `Pedidos activos en cola: 0 | Última actualización: ${horaActual}`;
    }
    return;
  }

  contenedor.innerHTML = pedidosFiltrados.map(renderPedido).join("");

  const subtitulo = document.querySelector("header p");
  if (subtitulo) {
      subtitulo.textContent = `Pedidos activos en cola: ${pedidosFiltrados.length} | Última actualización: ${horaActual}`;
  }
}
function renderObservaciones(item) {
  const observacion = [
    item.observacion,
    item.opcion,
    item.comentario
  ]
    .map((valor) => String(valor ?? "").trim())
    .find((texto) =>
      texto !== "" &&
      texto.toLowerCase() !== "sin observaciones"
    );

  if (!observacion) {
    return `
      <p class="mt-2 text-xs font-medium text-slate-400">
        Sin observaciones
      </p>
    `;
  }

  return `
    <div class="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p class="text-xs font-black uppercase tracking-wide text-amber-800">
        Observaciones del cliente
      </p>
      <p class="mt-1 whitespace-pre-line break-words text-sm font-semibold text-amber-950">${escapeHtml(observacion)}</p>
    </div>
  `;
}
function renderPedido(pedido) {
  const productos = pedido.productos || pedido.items || [];
  const estado = estadoPedido(pedido);
  const listo = esListo(pedido);
  const textoListo = textoListoSegunTipo(pedido);
  const paraLlevar = esPedidoLlevar(pedido);

const etiquetaTipo = paraLlevar
  ? "Para llevar"
  : "Consumo en mesa";

const colorTipo = paraLlevar
  ? "border-violet-200 bg-violet-50 text-violet-800"
  : "border-blue-200 bg-blue-50 text-blue-800";

const mensajeListo = paraLlevar
  ? "Preparación completada. Pedido listo para recoger."
  : "Preparación completada. El mesero ya puede llevar el pedido a la mesa.";
  const idPedido = escapeHtml(String(pedido.id_pedido || pedido.id));
  const codigo = pedido.codigo || `PED-${pedido.id_pedido || pedido.id}`;

  const productosHtml = productos.map((item) => `
    <li class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div class="flex items-start gap-3">
        <span class="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 px-2 text-lg font-black text-white">
          x${Number(item.cantidad || 1)}
        </span>

        <div class="min-w-0 flex-1">
          <p class="break-words text-base font-black text-slate-950">
            ${escapeHtml(item.nombre)}
          </p>
          ${renderObservaciones(item)}
          <p class="mt-2 text-sm font-bold text-slate-700">
            S/ ${soles(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1))}
          </p>
        </div>
      </div>
    </li>
  `).join("");

  const acciones = listo
    ? `
      <div class="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">
        ${mensajeListo}
      </div>
    `
    : `
      <div class="grid grid-cols-1 gap-3">
        ${estadoDb(pedido) !== "preparando" ? `
          <button
            type="button"
            onclick="cambiarEstado('${idPedido}', 'preparando')"
            class="w-full rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-500">
            En preparación
          </button>
        ` : ""}

        <button
          type="button"
          onclick="cambiarEstado('${idPedido}', 'listo')"
          class="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700">
          ${textoListo}
        </button>
      </div>
    `;

  return `
    <article class="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
      <header class="border-b border-slate-100 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-widest text-slate-500">
              Pedido
            </p>
            <h2 class="mt-1 break-words text-2xl font-black text-slate-950">
              ${escapeHtml(codigo)}
            </h2>
          </div>

          <span class="rounded-full px-3 py-1.5 text-sm font-black ${colorEstado(estado)}">
            ${escapeHtml(estado)}
          </span>
        </div>

        <p class="mt-3 text-xs font-semibold text-slate-500">
          ${escapeHtml(pedido.fecha || "")}
          ${escapeHtml(pedido.hora || "")}
        </p>
      </header>

     <div class="mb-4 rounded-2xl border p-4 ${colorTipo}">
  <p class="text-xs font-black uppercase tracking-widest">
    ${etiquetaTipo}
  </p>

  ${paraLlevar ? `
    <p class="mt-2 text-2xl font-black">
      Retiro del pedido
    </p>
    <p class="mt-1 text-sm font-medium">
      Revisa los productos y sus observaciones antes de empacarlos.
    </p>
  ` : `
    <p class="mt-2 break-words text-3xl font-black">
      Mesa ${escapeHtml(pedido.mesa || "No asignada")}
    </p>
    <p class="mt-1 text-sm font-medium">
      Prepara el pedido para su entrega en mesa.
    </p>
  `}
</div>

        <dl class="mb-5 space-y-2 text-sm text-slate-600">
          <div>
            <dt class="inline font-bold text-slate-800">Tipo:</dt>
            <dd class="inline break-words">
              ${escapeHtml(pedido.tipoConsumo || pedido.tipo_pedido || "No definido")}
            </dd>
          </div>

          <div>
            <dt class="inline font-bold text-slate-800">Cliente:</dt>
            <dd class="inline break-words">
              ${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Consumidor final")}
            </dd>
          </div>

          ${esPedidoLlevar(pedido) ? `
            <div>
              <dt class="inline font-bold text-slate-800">Celular:</dt>
              <dd class="inline break-words">
                ${escapeHtml(pedido.telefono_llevar || pedido.telefono || "No registrado")}
              </dd>
            </div>
          ` : ""}
        </dl>

        <h3 class="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Productos del pedido
        </h3>

        <ul class="mb-5 space-y-3">
          ${productosHtml}
        </ul>

        <div class="mt-auto border-t border-slate-200 pt-4">
          <div class="mb-4 flex items-center justify-between gap-3">
            <span class="text-sm font-bold text-slate-500">Total</span>
            <span class="text-xl font-black text-slate-950">
              S/ ${soles(pedido.total)}
            </span>
          </div>

          ${acciones}
        </div>
      </div>
    </article>
  `;
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
    mostrarNotificacion(`Pedido actualizado a: ${nuevoEstado}`, "success");
    await mostrarPedidos();
  } catch (error) {
    alert(`No se pudo actualizar el pedido: ${error.message}`);
  }
}

function recargarCocina() {
  mostrarPedidos();
}

function toggleSonido() {
  sonidoActivo = !sonidoActivo;
  const btn = document.getElementById("btn-sonido");
  if (btn) {
    btn.innerHTML = sonidoActivo ? "🔊 Sonido ON" : "🔇 Sonido OFF";
    btn.className = sonidoActivo 
      ? "flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-2xl font-bold text-xs shadow-sm transition transform active:scale-95"
      : "flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-3 rounded-2xl font-bold text-xs shadow-sm transition transform active:scale-95";
  }
  mostrarNotificacion(sonidoActivo ? "Alerta sonora activada" : "Alerta sonora desactivada", "success");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      alert(`No se pudo activar pantalla completa: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

document.addEventListener("fullscreenchange", () => {
  const btn = document.getElementById("btn-fullscreen");
  if (!btn) return;
  if (document.fullscreenElement) {
    btn.innerHTML = "🗗 Salir";
    btn.className = "flex items-center gap-2 bg-orange-100 hover:bg-orange-200 text-orange-800 px-4 py-3 rounded-2xl font-bold text-xs shadow-sm transition transform active:scale-95";
  } else {
    btn.innerHTML = "🖥️ Pantalla Completa";
    btn.className = "flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-2xl font-bold text-xs shadow-sm transition transform active:scale-95";
  }
});

function reproducirAlertaSonora() {
  if (!sonidoActivo) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 587.33; 
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

function iniciarEscuchaEventosCocina() {
  if (typeof realTime === "undefined" || !realTime) return;
  realTime.connect();

  realTime.on("pedido:creado", () => {
    reproducirAlertaSonora();
    mostrarNotificacion("¡Nuevo pedido recibido en cocina!", "success");
    mostrarPedidos();
  });

  realTime.on("pedido:actualizado", () => {
    mostrarPedidos();
  });
}

function mostrarNotificacion(mensaje, tipo = "success") {
    const contenedor = document.getElementById("toast-container");
    if (!contenedor) return;

    const toast = document.createElement("div");
    toast.className = `pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-bold text-white transition-all transform translate-y-2 opacity-0 ${
        tipo === "success" ? "bg-emerald-600" : "bg-slate-900"
    }`;

    toast.innerHTML = `
        <span>${tipo === "success" ? "✅" : "🔔"}</span>
        <span>${escapeHtml(mensaje)}</span>
    `;

    contenedor.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    }, 10);

    setTimeout(() => {
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

document.addEventListener("DOMContentLoaded", () => {
  mostrarPedidos();
  iniciarEscuchaEventosCocina();
  setInterval(() => {
    if (!document.hidden) mostrarPedidos();
  }, 15000);
});

// Módulo de Cocina - MenuGo
console.log("Panel de cocina inicializado correctamente");