let carrito =
  JSON.parse(localStorage.getItem("pedido"))?.map((p) => ({
    ...p,
    cantidad: p.cantidad || 1,
  })) || [];
let total = 0;


function calcularTotal() {
  return carrito.reduce(
    (sum, item) => sum + item.precio * (item.cantidad || 1),
    0,
  );
}

function mostrarCarrito() {
  const lista = document.getElementById("lista-carrito");
  lista.innerHTML = "";

  carrito.forEach((item) => {
    const li = document.createElement("li");
    li.classList.add(
      "list-group-item",
      "d-flex",
      "justify-content-between",
      "flex-column",
      "align-items-start",
    );
    li.innerHTML = `
      <div>${item.nombre} x${item.cantidad}</div>
      <div class="small text-muted">${[item.variante, item.opcion || item.comentario].filter(Boolean).join(" · ")}</div>
      <span>S/ ${(item.precio * item.cantidad).toFixed(2)}</span>
    `;
    lista.appendChild(li);
  });

  total = calcularTotal();
  document.getElementById("total-carrito").textContent = total.toFixed(2);
}

function pagarLocal() {
  if (carrito.length === 0) {
    alert("No hay productos en el carrito");
    return;
  }
  alert(`Pedido confirmado para pago en local. Total: S/ ${total.toFixed(2)}`);
  carrito = [];
  total = 0;
  localStorage.removeItem("pedido");
  mostrarCarrito();
  window.location.href = "index.html";
}

function pagarDigital() {
  if (carrito.length === 0) {
    alert("No hay productos en el carrito");
    return;
  }
  alert(`Redirigiendo a pago digital. Total: S/ ${total.toFixed(2)}`);
  carrito = [];
  total = 0;
  localStorage.removeItem("pedido");
  mostrarCarrito();
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", mostrarCarrito);
