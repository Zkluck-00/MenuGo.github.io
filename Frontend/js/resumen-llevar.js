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

function soles(valor) {
  return Number(valor || 0).toFixed(2);
}

function calcularTotal() {
  return carritoResumen.reduce((s, item) => s + Number(item.precio || 0) * Number(item.cantidad || 1), 0);
}

function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function telefonoLimpio(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 9);
}

function obtenerClienteLocal() {
  const nombre = localStorage.getItem("nombreCliente") || "";
  const apellidos = localStorage.getItem("apellidosCliente") || "";
  return `${nombre} ${apellidos}`.trim();
}

function obtenerDatosClienteLlevar() {
  const nombreInput = document.getElementById("nombre-llevar");
  const celularInput = document.getElementById("celular-llevar");
  const observacionInput = document.getElementById("observacion-llevar");

  const nombre = String(nombreInput?.value || "").trim();
  const celular = telefonoLimpio(celularInput?.value || "");
  const observacion = String(observacionInput?.value || "").trim();

  return { nombre, celular, observacion };
}

function guardarDatosClienteLlevar(datos) {
  localStorage.setItem("nombreCliente", datos.nombre || "Cliente");
  localStorage.setItem("apellidosCliente", "");
  localStorage.setItem("telefonoCliente", datos.celular || "");
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

function inicializarDatosCliente() {
  const nombreInput = document.getElementById("nombre-llevar");
  const celularInput = document.getElementById("celular-llevar");
  const clienteEl = document.getElementById("cliente-resumen");

  const nombreGuardado = obtenerClienteLocal();
  const telefonoGuardado = telefonoLimpio(localStorage.getItem("telefonoCliente") || "");

  if (nombreInput && !nombreInput.value) nombreInput.value = nombreGuardado || "";
  if (celularInput && !celularInput.value) celularInput.value = telefonoGuardado || "";
  if (clienteEl) clienteEl.textContent = nombreInput?.value?.trim() || "Cliente para llevar";

  nombreInput?.addEventListener("input", () => {
    if (clienteEl) clienteEl.textContent = nombreInput.value.trim() || "Cliente para llevar";
  });
  celularInput?.addEventListener("input", () => {
    celularInput.value = telefonoLimpio(celularInput.value);
  });
}

function renderResumenLlevar() {
  normalizarResumenMaximo();

  const lista = document.getElementById("lista-resumen");
  const totalEl = document.getElementById("total-resumen");
  if (!lista || !totalEl) return;

  if (carritoResumen.length === 0) {
    lista.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p class="font-bold text-slate-600">No hay platos en el resumen.</p><a href="MenuParaLlevar.html" class="mt-4 inline-flex rounded-xl bg-orange-500 px-5 py-3 font-black text-white hover:bg-orange-600">Volver al menu</a></div>`;
    totalEl.textContent = "0.00";
    return;
  }

  lista.innerHTML = carritoResumen.map((item) => `
    <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-black text-slate-950">${escapeHtml(item.nombre)}</h3>
          <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml([item.variante, item.opcion || item.comentario].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-black text-slate-500">x${item.cantidad || 1}</p>
          <p class="mt-1 font-black text-slate-950">S/ ${soles(Number(item.precio || 0) * Number(item.cantidad || 1))}</p>
        </div>
      </div>
    </article>`).join("");
  totalEl.textContent = soles(calcularTotal());
}

function metodoSeleccionado() {
  return document.querySelector('input[name="metodoPago"]:checked')?.value || "Yape";
}

function actualizarInterfazPago() {
  const metodo = metodoSeleccionado();
  const efectivoBox = document.getElementById("box-efectivo");
  const digitalBox = document.getElementById("box-pago-digital");
  if (efectivoBox) efectivoBox.classList.toggle("hidden", metodo !== "Efectivo al recoger");
  if (!digitalBox) return;

  if (metodo === "Yape") {
    digitalBox.className = "mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4";
    digitalBox.innerHTML = `<h3 class="font-black text-purple-800">Simulacion de pago con Yape</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Celular Yape</span><input id="celular-yape" type="text" inputmode="numeric" maxlength="9" placeholder="999999999" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-400"></label><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Codigo de aprobacion</span><input id="codigo-yape-simple" type="text" maxlength="6" inputmode="numeric" placeholder="123456" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-400"></label>`;
    document.getElementById("celular-yape")?.addEventListener("input", (e) => { e.target.value = telefonoLimpio(e.target.value); });
    document.getElementById("codigo-yape-simple")?.addEventListener("input", (e) => { e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 6); });
  } else if (metodo === "Tarjeta") {
    digitalBox.className = "mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4";
    digitalBox.innerHTML = `<h3 class="font-black text-slate-800">Simulacion de pago con tarjeta</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Numero de tarjeta</span><input id="tarjeta-numero" type="text" maxlength="19" placeholder="0000 0000 0000 0000" class="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-orange-400"></label><div class="mt-3 grid grid-cols-2 gap-3"><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Vencimiento</span><input id="tarjeta-vencimiento" type="text" maxlength="5" placeholder="MM/AA" class="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold"></label><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">CVV</span><input id="tarjeta-cvv" type="password" maxlength="3" placeholder="***" class="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold"></label></div>`;
    document.getElementById("tarjeta-numero")?.addEventListener("input", (e) => { e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 16); });
    document.getElementById("tarjeta-cvv")?.addEventListener("input", (e) => { e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 3); });
  } else {
    digitalBox.className = "mt-4 hidden";
    digitalBox.innerHTML = "";
  }
  calcularVuelto();
}

function calcularVuelto() {
  const pagoConInput = document.getElementById("pago-con");
  const vueltoEl = document.getElementById("vuelto-estimado");
  if (!pagoConInput || !vueltoEl) return;
  const vuelto = Math.max(Number(pagoConInput.value || 0) - calcularTotal(), 0);
  vueltoEl.textContent = soles(vuelto);
}

function validarClienteLlevar() {
  const datos = obtenerDatosClienteLlevar();
  if (datos.nombre.length < 2) {
    alert("Ingresa el nombre del cliente para identificar el pedido al recoger.");
    document.getElementById("nombre-llevar")?.focus();
    return null;
  }
  if (datos.celular.length !== 9) {
    alert("Ingresa un celular valido de 9 digitos para el pedido para llevar.");
    document.getElementById("celular-llevar")?.focus();
    return null;
  }
  guardarDatosClienteLlevar(datos);
  return datos;
}

function validarPagoSimulado(metodoPago) {
  if (metodoPago === "Efectivo al recoger") {
    const pagoCon = Number(document.getElementById("pago-con")?.value || 0);
    if (pagoCon > 0 && pagoCon < calcularTotal()) {
      alert("El monto con el que pagara no puede ser menor al total.");
      return false;
    }
    return true;
  }
  if (metodoPago === "Yape") {
    const celular = telefonoLimpio(document.getElementById("celular-yape")?.value || "");
    const codigo = String(document.getElementById("codigo-yape-simple")?.value || "").replace(/\D/g, "");
    if (celular.length !== 9 || codigo.length !== 6) {
      alert("Ingresa celular Yape de 9 digitos y codigo de 6 digitos.");
      return false;
    }
  }
  if (metodoPago === "Tarjeta") {
    const numero = String(document.getElementById("tarjeta-numero")?.value || "").replace(/\D/g, "");
    const cvv = String(document.getElementById("tarjeta-cvv")?.value || "").replace(/\D/g, "");
    if (numero.length < 13 || cvv.length !== 3) {
      alert("Ingresa datos de tarjeta validos para la simulacion.");
      return false;
    }
  }
  return true;
}

function itemApi(item) {
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

function urlSeguimiento(codigo) {
  return `seguimiento_llevar.html?codigo=${encodeURIComponent(codigo)}`;
}

function renderPedidoRegistrado(pedido, metodoPago, pagoCon, vueltoEstimado) {
  const codigo = pedido.codigo_seguimiento || pedido.codigo_llevar || pedido.codigo || `LLEV-${String(pedido.id_pedido || pedido.id || "").padStart(3, "0")}`;
  const cliente = pedido.cliente || pedido.nombre_cliente || "Cliente";
  const main = document.getElementById("contenido-resumen");
  if (!main) return;
  main.innerHTML = `
    <section class="mx-auto max-w-2xl rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-900/10">
      <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✅</div>
      <p class="text-sm font-black uppercase tracking-wide text-orange-600">Pedido para recoger registrado</p>
      <h1 class="mt-2 text-3xl font-black text-slate-950">Guarda tu codigo: ${escapeHtml(codigo)}</h1>
      <p class="mx-auto mt-3 max-w-xl text-slate-600">Tu pedido fue enviado a cocina. Puedes revisar el seguimiento hasta que aparezca como listo para recoger.</p>
      <div class="mx-auto mt-6 max-w-md rounded-2xl bg-slate-50 p-4 text-left text-sm">
        <p><strong>Codigo:</strong> ${escapeHtml(codigo)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(cliente)}</p>
        <p><strong>Celular:</strong> ${escapeHtml(pedido.telefono_llevar || pedido.telefono || "")}</p>
        <p><strong>Estado:</strong> ${escapeHtml(pedido.estadoPedido || pedido.estado || "Pendiente en cocina")}</p>
        <p><strong>Metodo:</strong> ${escapeHtml(metodoPago)}</p>
        <p><strong>Total:</strong> S/ ${soles(pedido.total)}</p>
        ${metodoPago === "Efectivo al recoger" ? `<p><strong>Vuelto estimado:</strong> S/ ${soles(vueltoEstimado)}</p>` : ""}
      </div>
      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a href="${escapeHtml(urlSeguimiento(codigo))}" class="rounded-2xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600">Ver seguimiento</a>
        <a href="MenuParaLlevar.html" class="rounded-2xl border border-slate-300 px-6 py-3 font-black text-slate-700 hover:bg-slate-50">Nuevo pedido</a>
      </div>
    </section>`;
}

async function confirmarPedidoLlevar() {
  normalizarResumenMaximo();
  if (carritoResumen.length === 0) return alert("Agrega al menos un plato antes de confirmar.");
  if (contarPlatosResumen() > MAX_PLATOS_PEDIDO) return alert(`Solo puedes confirmar maximo ${MAX_PLATOS_PEDIDO} platos/productos por pedido.`);

  const datosCliente = validarClienteLlevar();
  if (!datosCliente) return;

  const metodoPago = metodoSeleccionado();
  if (!validarPagoSimulado(metodoPago)) return;

  const esEfectivo = metodoPago === "Efectivo al recoger";
  const pagoCon = Number(document.getElementById("pago-con")?.value || 0);

  try {
    const data = await apiJson("/pedidos", {
      method: "POST",
      body: JSON.stringify({
        tipo_pedido: "llevar",
        nombre_cliente: datosCliente.nombre,
        telefono: datosCliente.celular,
        telefono_llevar: datosCliente.celular,
        observacion_llevar: datosCliente.observacion,
        metodoPago,
        estadoPago: esEfectivo ? "Pendiente" : "Pagado",
        documento: "00000000",
        items: carritoResumen.map(itemApi),
      }),
    });

    const pedido = {
      ...data.data,
      metodoPago,
      pagoCon: esEfectivo ? pagoCon : calcularTotal(),
      vueltoEstimado: esEfectivo ? Math.max(pagoCon - calcularTotal(), 0) : 0,
      estadoPago: esEfectivo ? "Pendiente" : "Pagado",
    };
    localStorage.setItem("ultimoPedido", JSON.stringify(pedido));
    localStorage.setItem("ultimoCodigoLlevar", pedido.codigo_seguimiento || pedido.codigo_llevar || pedido.codigo || "");
    localStorage.removeItem("pedido");
    carritoResumen = [];

    renderPedidoRegistrado(pedido, metodoPago, pedido.pagoCon, pedido.vueltoEstimado);
  } catch (error) {
    alert(`No se pudo registrar el pedido en la BD: ${error.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarDatosCliente();
  renderResumenLlevar();
  document.querySelectorAll('input[name="metodoPago"]').forEach((input) => input.addEventListener("change", actualizarInterfazPago));
  document.getElementById("pago-con")?.addEventListener("input", calcularVuelto);
  actualizarInterfazPago();
});