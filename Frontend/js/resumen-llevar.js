const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let carritoResumen = JSON.parse(localStorage.getItem("pedido")) || [];

function soles(valor) { return Number(valor || 0).toFixed(2); }
function calcularTotal() { return carritoResumen.reduce((s, item) => s + Number(item.precio || 0) * Number(item.cantidad || 1), 0); }
function obtenerCliente() { const nombre = localStorage.getItem("nombreCliente") || "Cliente"; const apellidos = localStorage.getItem("apellidosCliente") || ""; return `${nombre} ${apellidos}`.trim(); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function renderResumenLlevar() {
  const lista = document.getElementById("lista-resumen");
  const totalEl = document.getElementById("total-resumen");
  const clienteEl = document.getElementById("cliente-resumen");
  if (!lista || !totalEl) return;
  if (clienteEl) clienteEl.textContent = obtenerCliente();

  if (carritoResumen.length === 0) {
    lista.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p class="font-bold text-slate-600">No hay platos en el resumen.</p><a href="MenuParaLlevar.html" class="mt-4 inline-flex rounded-xl bg-orange-500 px-5 py-3 font-black text-white hover:bg-orange-600">Volver al menu</a></div>`;
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

function metodoSeleccionado() { return document.querySelector('input[name="metodoPago"]:checked')?.value || "Yape"; }

function actualizarInterfazPago() {
  const metodo = metodoSeleccionado();
  const efectivoBox = document.getElementById("box-efectivo");
  const digitalBox = document.getElementById("box-pago-digital");
  if (efectivoBox) efectivoBox.classList.toggle("hidden", metodo !== "Efectivo al recoger");
  if (!digitalBox) return;
  if (metodo === "Yape") {
    digitalBox.className = "mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4";
    digitalBox.innerHTML = `<h3 class="font-black text-purple-800">Simulacion de pago con Yape</h3><label class="mt-4 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Celular Yape</span><input id="celular-yape" type="text" inputmode="numeric" maxlength="9" placeholder="999999999" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-400"></label><label class="mt-4 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Codigo de aprobacion</span><input id="codigo-yape-simple" type="text" maxlength="6" inputmode="numeric" placeholder="123456" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-400"></label>`;
  } else if (metodo === "Tarjeta") {
    digitalBox.className = "mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4";
    digitalBox.innerHTML = `<h3 class="font-black text-slate-800">Simulacion de pago con tarjeta</h3><label class="mt-4 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Numero de tarjeta</span><input id="tarjeta-numero" type="text" maxlength="19" placeholder="0000 0000 0000 0000" class="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-orange-400"></label><div class="mt-4 grid grid-cols-2 gap-3"><input id="tarjeta-vencimiento" type="text" maxlength="5" placeholder="MM/AA" class="rounded-xl border border-slate-300 px-4 py-3 font-bold"><input id="tarjeta-cvv" type="password" maxlength="3" placeholder="CVV" class="rounded-xl border border-slate-300 px-4 py-3 font-bold"></div>`;
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

function validarPagoSimulado(metodoPago) {
  if (metodoPago === "Efectivo al recoger") {
    const pagoCon = Number(document.getElementById("pago-con")?.value || 0);
    if (pagoCon > 0 && pagoCon < calcularTotal()) { alert("El monto con el que pagara no puede ser menor al total."); return false; }
    return true;
  }
  if (metodoPago === "Yape") {
    const celular = (document.getElementById("celular-yape")?.value || "").replace(/\D/g, "");
    const codigo = (document.getElementById("codigo-yape-simple")?.value || "").replace(/\D/g, "");
    if (celular.length !== 9 || codigo.length !== 6) { alert("Ingresa celular Yape de 9 digitos y codigo de 6 digitos."); return false; }
  }
  if (metodoPago === "Tarjeta") {
    const numero = (document.getElementById("tarjeta-numero")?.value || "").replace(/\D/g, "");
    const cvv = (document.getElementById("tarjeta-cvv")?.value || "").replace(/\D/g, "");
    if (numero.length < 13 || cvv.length !== 3) { alert("Ingresa datos de tarjeta validos para la simulacion."); return false; }
  }
  return true;
}

function itemApi(item) {
  return { id: item.id, codigo_producto: item.codigo_producto || item.id, nombre: item.nombre, precio: Number(item.precio || 0), cantidad: Number(item.cantidad || 1), variante: item.variante || "Unico", opcion: item.opcion || item.comentario || "Preparacion normal", comentario: item.comentario || item.opcion || "Preparacion normal", categoria: item.categoria || "plato" };
}

async function confirmarPedidoLlevar() {
  if (carritoResumen.length === 0) return alert("Agrega al menos un plato antes de confirmar.");
  const metodoPago = metodoSeleccionado();
  if (!validarPagoSimulado(metodoPago)) return;

  const esEfectivo = metodoPago === "Efectivo al recoger";
  const pagoCon = Number(document.getElementById("pago-con")?.value || 0);
  const main = document.getElementById("contenido-resumen");

  try {
    const data = await apiJson("/pedidos", {
      method: "POST",
      body: JSON.stringify({
        tipo_pedido: "llevar",
        nombre_cliente: obtenerCliente(),
        telefono: localStorage.getItem("telefonoCliente") || "999999999",
        telefono_llevar: localStorage.getItem("telefonoCliente") || "999999999",
        metodoPago,
        estadoPago: esEfectivo ? "Pendiente" : "Pagado",
        documento: "00000000",
        items: carritoResumen.map(itemApi),
      }),
    });
    const pedido = { ...data.data, metodoPago, pagoCon: esEfectivo ? pagoCon : calcularTotal(), vueltoEstimado: esEfectivo ? Math.max(pagoCon - calcularTotal(), 0) : 0, estadoPago: esEfectivo ? "Pendiente" : "Pagado" };
    localStorage.setItem("ultimoPedido", JSON.stringify(pedido));
    localStorage.removeItem("pedido");
    carritoResumen = [];

    if (!esEfectivo) { window.location.href = "boleta.html"; return; }

    main.innerHTML = `<section class="rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-900/10"><div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-3xl">⌛</div><h1 class="text-3xl font-black text-slate-950">Pedido registrado con pago pendiente</h1><p class="mx-auto mt-3 max-w-xl text-slate-600">Tu pedido fue enviado a cocina. El mesero lo entregará cuando este listo para recoger.</p><div class="mx-auto mt-6 max-w-sm rounded-2xl bg-slate-50 p-4 text-left text-sm"><p><strong>Codigo:</strong> ${escapeHtml(pedido.codigo)}</p><p><strong>Cliente:</strong> ${escapeHtml(pedido.cliente || pedido.nombre_cliente)}</p><p><strong>Metodo:</strong> ${escapeHtml(metodoPago)}</p><p><strong>Total:</strong> S/ ${soles(pedido.total)}</p><p><strong>Vuelto estimado:</strong> S/ ${soles(pedido.vueltoEstimado)}</p></div><div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><a href="MenuParaLlevar.html" class="rounded-2xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600">Nuevo pedido</a><a href="index.html" class="rounded-2xl border border-slate-300 px-6 py-3 font-black text-slate-700 hover:bg-slate-50">Volver al inicio</a></div></section>`;
  } catch (error) {
    alert(`No se pudo registrar el pedido en la BD: ${error.message}`);
  }
}

 function actualizarInterfazPago() {
    const metodo = metodoSeleccionado();
    const efectivoBox = document.getElementById("box-efectivo");
    const digitalBox = document.getElementById("box-pago-digital");
    if (efectivoBox) efectivoBox.classList.toggle("hidden", metodo !== "Efectivo al recoger");
    if (!digitalBox) return;
    if (metodo === "Yape") {
        digitalBox.className = "mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4";
        digitalBox.innerHTML = `<h3 class="font-black text-purple-800">Simulacion de pago con Yape</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Celular Yape</span><input id="celular-yape" type="text" inputmode="numeric" maxlength="9" placeholder="999 999 999" class="w-full rounded-xl border border-purple-200 px-4 py-3 font-bold"></label><div class="mt-3"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-purple-700">Codigo de aprobacion</span><div class="grid grid-cols-6 gap-2">${Array.from({ length: 6 }, (_, i) => `<input type="text" inputmode="numeric" maxlength="1" class="codigo-yape h-12 w-full rounded-xl border border-purple-200 text-center text-xl font-black">`).join('')}</div></div>`;
        activarCajasCodigoYape();
    } else if (metodo === "Tarjeta") {
        digitalBox.className = "mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4";
        digitalBox.innerHTML = `<h3 class="font-black text-slate-800">Simulacion de pago con tarjeta</h3><label class="mt-3 block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Numero de tarjeta</span><input id="tarjeta-numero" type="text" maxlength="19" placeholder="0000 0000 0000 0000" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label><div class="mt-3 grid grid-cols-2 gap-3"><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Vencimiento</span><input id="tarjeta-vencimiento" type="text" maxlength="5" placeholder="MM/AA" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label><label class="block"><span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">CVV</span><input id="tarjeta-cvv" type="password" maxlength="3" placeholder="***" class="w-full rounded-xl border border-slate-200 px-4 py-3 font-bold"></label></div></div>`;
    } else {
        digitalBox.className = "mt-4 hidden";
        digitalBox.innerHTML = "";
    }
    calcularVuelto();
}

function activarCajasCodigoYape() {
    const inputs = Array.from(document.querySelectorAll('.codigo-yape'));
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

function calcularVuelto() {
    const pagoConInput = document.getElementById('pago-con');
    const vueltoEl = document.getElementById('vuelto-estimado');
    if (!pagoConInput || !vueltoEl) return;
    const vuelto = Math.max(Number(pagoConInput.value || 0) - calcularTotal(), 0);
    vueltoEl.textContent = soles(vuelto);
}

function validarPagoSimulado(metodoPago) {
    if (metodoPago === "Efectivo al recoger") {
        const pagoCon = Number(document.getElementById('pago-con')?.value || 0);
        if (pagoCon > 0 && pagoCon < calcularTotal()) {
            alert("El monto con el que pagara no puede ser menor al total.");
            return false;
        }
        return true;
    }
    if (metodoPago === "Yape") {
        const celular = (document.getElementById('celular-yape')?.value || '').replace(/\D/g, '');
        const codigos = Array.from(document.querySelectorAll('.codigo-yape')).map(i => i.value).join('');
        if (celular.length !== 9) {
            alert("Ingresa un celular Yape valido de 9 digitos.");
            return false;
        }
        if (codigos.length !== 6) {
            alert("Ingresa el codigo de aprobacion Yape de 6 digitos.");
            return false;
        }
        return true;
    }
    if (metodoPago === "Tarjeta") {
        const numero = (document.getElementById('tarjeta-numero')?.value || '').replace(/\D/g, '');
        const cvv = (document.getElementById('tarjeta-cvv')?.value || '').replace(/\D/g, '');
        if (numero.length < 13 || cvv.length !== 3) {
            alert("Ingresa datos de tarjeta validos para la simulacion.");
            return false;
        }
        return true;
    }
    return true;
}

function codigoYape() {
    return Array.from(document.querySelectorAll('.codigo-yape')).map(input => input.value).join('');
}

document.addEventListener("DOMContentLoaded", () => {
  renderResumenLlevar();
  document.querySelectorAll('input[name="metodoPago"]').forEach((input) => input.addEventListener("change", actualizarInterfazPago));
  document.getElementById("pago-con")?.addEventListener("input", calcularVuelto);
  actualizarInterfazPago();
});
