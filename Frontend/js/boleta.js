document.addEventListener("DOMContentLoaded", cargarBoleta);

function soles(valor) {
  return Number(valor || 0).toFixed(2);
}

function cargarBoleta() {
  const pedido = JSON.parse(localStorage.getItem("ultimoPedido") || localStorage.getItem("ultimaBoleta") || "null");
  if (!pedido) {
    alert("No hay una boleta disponible.");
    window.location.href = "index.html";
    return;
  }

  const estadoPago = String(pedido.estadoPago || "").toLowerCase();
  if (estadoPago !== "pagado" && estadoPago !== "cancelado") {
    alert("La boleta solo se genera cuando el pedido ya fue pagado.");
    window.location.href = "index.html";
    return;
  }

  mostrarDatos(pedido);
  mostrarProductos(pedido.productos || []);
  mostrarTotales(pedido.productos || [], pedido.total);
}

function mostrarDatos(pedido) {
  const fecha = pedido.fecha ? new Date(pedido.fecha) : new Date();
  const numero = pedido.numeroBoleta || `B001-${String(Date.now()).slice(-6)}`;

  document.getElementById("numero-boleta").textContent = numero;
  document.getElementById("cliente-boleta").textContent = pedido.cliente || "Consumidor final";
  document.getElementById("documento-boleta").textContent = pedido.documento || "XXXXXXXX";
  document.getElementById("tipo-consumo").textContent = pedido.tipoConsumo || "Para llevar";
  document.getElementById("mesa-pedido").textContent = pedido.mesa || "No aplica";
  document.getElementById("metodo-pago").textContent = pedido.metodoPago || "Pago digital";
  document.getElementById("estado-pago").textContent = "Pagado";
  document.getElementById("fecha-boleta").textContent = fecha.toLocaleDateString("es-PE");
  document.getElementById("hora-boleta").textContent = fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  
  const telefonoEl = document.getElementById("telefono-cliente");
  if (telefonoEl && pedido.telefono) {
    telefonoEl.textContent = pedido.telefono;
  }
}
function mostrarProductos(productos) {
  const contenedor = document.getElementById("detalle-productos");
  contenedor.innerHTML = "";
  const observaciones = [];

  productos.forEach((item) => {
    const cantidad = Number(item.cantidad || 1);
    const precio = Number(item.precio || 0);
    const total = cantidad * precio;
    const obs = item.opcion || item.comentario || item.variante || "";
    if (obs) observaciones.push(`${item.nombre}: ${obs}`);

    const div = document.createElement("div");
    div.className = "grid grid-cols-[1fr_45px_75px] gap-2 border-b pb-2 text-sm";
    div.innerHTML = `
      <div>
        <p class="font-bold text-slate-800">${item.nombre}</p>
        ${obs ? `<p class="text-xs italic text-slate-500">${obs}</p>` : ""}
      </div>
      <div class="text-center text-slate-700">${cantidad}</div>
      <div class="text-right font-bold text-slate-800">S/ ${soles(total)}</div>`;
    contenedor.appendChild(div);
  });

  document.getElementById("observaciones-boleta").textContent = observaciones.length ? observaciones.join(" | ") : "Ninguna";
}

function mostrarTotales(productos, totalPedido) {
  const total = Number(totalPedido || productos.reduce((suma, item) => suma + Number(item.precio || 0) * Number(item.cantidad || 1), 0));
  const subtotal = total / 1.18;
  const igv = total - subtotal;

  document.getElementById("subtotal-boleta").textContent = soles(subtotal);
  document.getElementById("igv-boleta").textContent = soles(igv);
  document.getElementById("total-boleta").textContent = soles(total);
}
