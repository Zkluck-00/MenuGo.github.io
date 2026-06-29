const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let carritoResumen = JSON.parse(localStorage.getItem("pedido")) || [];
const MAX_PLATOS_PEDIDO = 7;

function contarPlatosResumen() {
  return carritoResumen.reduce((total, item) => total + Number(item.cantidad || 0), 0);
}

function normalizarResumenMaximo() {
  let restantes = MAX_PLATOS_PEDIDO;
  let huboCambios = false;
  const normalizado = [];

  carritoResumen.forEach((item) => {
    const cantidadOriginal = Number(item.cantidad || 0);
    const cantidad = Math.max(0, cantidadOriginal);
    if (cantidad <= 0 || restantes <= 0) {
      huboCambios = true;
      return;
    }
    const cantidadPermitida = Math.min(cantidad, restantes);
    if (cantidadPermitida !== cantidadOriginal) huboCambios = true;
    normalizado.push({ ...item, cantidad: cantidadPermitida });
    restantes -= cantidadPermitida;
  });

  if (huboCambios || normalizado.length !== carritoResumen.length) {
    carritoResumen = normalizado;
    localStorage.setItem("pedido", JSON.stringify(carritoResumen));
  }
}

function soles(valor) { return Number(valor || 0).toFixed(2); }
function calcularTotal() { return carritoResumen.reduce((s, item) => s + Number(item.precio || 0) * Number(item.cantidad || 1), 0); }
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

function renderResumenLocal() {
  normalizarResumenMaximo();

  const lista = document.getElementById("lista-resumen");
  const totalEl = document.getElementById("total-resumen");
  const mesaEl = document.getElementById("mesa-resumen");
  if (!lista || !totalEl) return;
  if (mesaEl) mesaEl.textContent = obtenerMesaActual();

  if (carritoResumen.length === 0) {
    lista.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p class="font-bold text-slate-600">No hay platos en el resumen.</p><a href="${urlMenuConMesa()}" class="mt-4 inline-flex rounded-xl bg-orange-500 px-5 py-3 font-black text-white hover:bg-orange-600">Volver al menu</a></div>`;
    totalEl.textContent = "0.00";
    return;
  }

  lista.innerHTML = carritoResumen.map((item) => `
    <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div><h3 class="font-black text-slate-950">${escapeHtml(item.nombre)}</h3><p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml([item.variante, item.opcion || item.comentario].filter(Boolean).join(" · "))}</p></div>
        <div class="text-right"><p class="text-sm font-black text-slate-500">x${item.cantidad || 1}</p><p class="mt-1 font-black text-slate-950">S/ ${soles(item.precio * (item.cantidad || 1))}</p></div>
      </div>
    </article>`).join("");
  totalEl.textContent = soles(calcularTotal());
}

function urlMenuConMesa() {
  const mesa = obtenerMesaActual();
  const token = obtenerTokenMesaActual();
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) return `menu.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
  return numero ? `menu.html?mesa=${encodeURIComponent(numero)}` : "menu.html";
}

function urlPedidoActualConMesa() {
  const mesa = obtenerMesaActual();
  const token = obtenerTokenMesaActual();
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) return `pedido_actual.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
  return numero ? `pedido_actual.html?mesa=${encodeURIComponent(numero)}` : "pedido_actual.html";
}

function normalizarItemParaApi(item) {
  return {
    id: item.id,
    codigo_producto: item.codigo_producto || item.id,
    nombre: item.nombre,
    precio: Number(item.precio || 0),
    cantidad: Number(item.cantidad || 1),
    variante: item.variante || "Unico",
    opcion: item.opcion || item.comentario || "Preparacion normal",
    comentario: item.comentario || item.opcion || "Preparacion normal",
    categoria: item.categoria || "plato",
  };
}

async function confirmarPedidoLocal() {
  normalizarResumenMaximo();
  if (carritoResumen.length === 0) return alert("Agrega al menos un plato antes de confirmar.");
  if (contarPlatosResumen() > MAX_PLATOS_PEDIDO) return alert(`Solo puedes confirmar maximo ${MAX_PLATOS_PEDIDO} platos/productos por pedido.`);
  const mesa = obtenerMesaActual();
  const numeroMesa = Number(String(mesa || "").match(/\d+/)?.[0] || 0);
  if (!numeroMesa) return alert("No se encontro numero de mesa.");

  const main = document.getElementById("contenido-resumen");
  const boton = document.querySelector('button[onclick="confirmarPedidoLocal()"]');
  if (boton) boton.disabled = true;

  try {
    const data = await apiJson("/pedidos", {
      method: "POST",
      body: JSON.stringify({
        tipo_pedido: "mesa",
        id_mesa: numeroMesa,
        qr_token: obtenerTokenMesaActual(),
        token_mesa: obtenerTokenMesaActual(),
        nombre_cliente: `Mesa ${numeroMesa}`,
        telefono: localStorage.getItem("telefonoCliente") || "999999999",
        items: carritoResumen.map(normalizarItemParaApi),
      }),
    });

    const pedido = data.data;
    localStorage.setItem("ultimoPedido", JSON.stringify(pedido));
    localStorage.removeItem("pedido");
    carritoResumen = [];

    main.innerHTML = `
      <section class="rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-900/10">
        <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 class="text-3xl font-black text-slate-950">Pedido enviado a cocina</h1>
        <p class="mx-auto mt-3 max-w-xl text-slate-600">Tu pedido fue registrado para la <strong>Mesa ${numeroMesa}</strong>. El mesero solo lo entregará cuando este listo.</p>
        <div class="mx-auto mt-6 max-w-sm rounded-2xl bg-slate-50 p-4 text-left text-sm">
          <p><strong>Codigo:</strong> ${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</p>
          <p><strong>Estado:</strong> ${escapeHtml(pedido.estadoPedido || "Pendiente")}</p>
          <p><strong>Total:</strong> S/ ${soles(pedido.total)}</p>
        </div>
        <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="${urlPedidoActualConMesa()}" class="rounded-2xl bg-slate-950 px-6 py-3 font-black text-white hover:bg-slate-800">Ver pedido actual</a>
          <a href="${urlMenuConMesa()}" class="rounded-2xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600">Agregar mas platos</a>
          <a href="index.html" class="rounded-2xl border border-slate-300 px-6 py-3 font-black text-slate-700 hover:bg-slate-50">Volver al inicio</a>
        </div>
      </section>`;
  } catch (error) {
    alert(`No se pudo registrar el pedido en la BD: ${error.message}`);
    if (boton) boton.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", renderResumenLocal);
