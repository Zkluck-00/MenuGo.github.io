let carrito = JSON.parse(localStorage.getItem("pedido")) || [];
let categoriaActual = "todas";
let busquedaActual = "";
const API_BASE_MENU = window.MENUGO_API || "http://localhost:4000/api";
let productosMenuBD = null;

function productoDesdeBD(producto) {
  const id = producto.codigo_producto || String(producto.id_producto || producto.id);
  const productoLocal = buscarProductoLocalMenuGo({ ...producto, id });
  const categoriaOriginal = producto.categoria || producto.tipo_producto || producto.tipo || "otros";
  const categoria = productoLocal?.categoria && ["plato", "bebida", "otros"].includes(normalizarTextoMenuGo(categoriaOriginal))
    ? productoLocal.categoria
    : categoriaOriginal;
  const normalizado = {
    ...producto,
    id,
    codigo_producto: id,
    nombre: producto.nombre || productoLocal?.nombre || "Producto sin nombre",
    descripcion: producto.descripcion || productoLocal?.descripcion || "",
    categoria,
    imagen: producto.imagen || productoLocal?.imagen || IMAGEN_PLATO_PLACEHOLDER,
  };

  const variantesLocal = productoLocal?.variantes && productoLocal.variantes.length > 0
  ? productoLocal.variantes
  : [{ nombre: "Unidad", precio: Number(producto.precio || 0) }];

return {
  ...normalizado,
  disponible_llevar: producto.disponible_llevar !== false,
  variantes: variantesLocal,
  opciones: opcionesProductoMenuGo(normalizado),
};
}

async function cargarProductosDesdeBD() {
  try {
    const response = await fetch(`${API_BASE_MENU}/productos/disponibles`);
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.message || "No se pudo cargar productos");
    productosMenuBD = (data.data || []).map(productoDesdeBD);
  } catch (error) {
    console.warn("Usando productos locales porque no se pudo leer la BD:", error.message);
    productosMenuBD = null;
  }
}

function obtenerPlatosDisponibles() {
  return productosMenuBD && productosMenuBD.length ? productosMenuBD : productosMenu;
}

function obtenerDestinoResumen() {
  const mesa = localStorage.getItem("mesa") || localStorage.getItem("mesaActual");
  const token = localStorage.getItem("mesaToken");
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) {
    return `../Cliente/resumen_pedido.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
  }
  if (numero) {
    return `../Cliente/resumen_pedido.html?mesa=${encodeURIComponent(numero)}`;
  }
  return "../Cliente/resumen_pedido.html";
}


function inicializarContextoPedido() {
  const params = new URLSearchParams(window.location.search);
  const mesa = params.get("mesa");
  const token = params.get("token");
  const tipo = params.get("tipo");

  if (mesa) {
    localStorage.setItem("mesa", mesa);
    localStorage.setItem("mesaActual", mesa);
  }

  if (token) {
    localStorage.setItem("mesaToken", token);
  }

  if (tipo) {
    localStorage.setItem("tipoConsumo", tipo);
  }
}

function soles(valor) {
  return Number(valor).toFixed(2);
}

function nombreCategoria(id) {
  return (
    categorias.find((categoria) => categoria.id === id)?.nombre ||
    "Todos los platos"
  );
}

function normalizarBusqueda(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function productoCoincideConBusqueda(producto) {
  const termino = normalizarBusqueda(busquedaActual);
  if (!termino) return true;

  const textoProducto = normalizarBusqueda([
    producto.nombre,
    producto.descripcion,
    nombreCategoria(producto.categoria),
    producto.categoria,
    ...(producto.variantes || []).map((variante) => variante.nombre),
    ...(producto.opciones || []),
  ].join(" "));

  return textoProducto.includes(termino);
}

function actualizarTextoResultado(cantidad) {
  const resultado = document.getElementById("resultado-busqueda");
  if (!resultado) return;

  const termino = busquedaActual.trim();
  const categoriaTexto = categoriaActual === "todas" ? "todas las categorias" : nombreCategoria(categoriaActual);

  if (!termino) {
    resultado.textContent = `Mostrando ${cantidad} producto(s) en ${categoriaTexto}.`;
    return;
  }

  resultado.textContent = cantidad === 0
    ? `No se encontraron productos para "${termino}" en todo el menu.`
    : `Se encontraron ${cantidad} producto(s) para "${termino}" en todo el menu.`;
}

function renderCategorias() {
  const contenedor = document.getElementById("categorias-container");
  contenedor.innerHTML = categorias
    .map((categoria) => {
      const activo = categoria.id === categoriaActual;
      const clases = activo
        ? "whitespace-nowrap rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm"
        : "whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white";

      return `
      <button type="button" class="${clases}" onclick="filtrarCategoria('${categoria.id}')">
        ${categoria.nombre}
      </button>
    `;
    })
    .join("");
}

function renderProductos() {
  const contenedor = document.getElementById("productos-container");
  const platosBase = obtenerPlatosDisponibles();
  const hayBusqueda = normalizarBusqueda(busquedaActual).length > 0;

  const productosFiltrados = platosBase.filter((producto) => {
    const coincideCategoria = hayBusqueda || categoriaActual === "todas" || producto.categoria === categoriaActual;
    return coincideCategoria && productoCoincideConBusqueda(producto);
  });

  document.getElementById("titulo-categoria").textContent = hayBusqueda
    ? "Resultados de busqueda"
    : categoriaActual === "todas"
      ? "Todos los platos"
      : nombreCategoria(categoriaActual);

  actualizarTextoResultado(productosFiltrados.length);

  if (productosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-sm">
        <p class="text-lg font-black text-slate-900">No encontramos platos con esa busqueda.</p>
        <p class="mt-2 text-sm font-semibold text-slate-500">Prueba con otro nombre o limpia el buscador.</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = productosFiltrados
    .map((producto) => crearCardProducto(producto))
    .join("");
}

function crearCardProducto(producto) {
  const varianteDefault = producto.variantes[0];
  const precioTexto =
    producto.variantes.length === 1
      ? `S/ ${soles(varianteDefault.precio)}`
      : producto.variantes
          .map((v) => `${v.nombre}: S/ ${soles(v.precio)}`)
          .join(" · ");

  const variantesHtml = producto.variantes
    .map((variante, index) => {
      const inputId = `${producto.id}-var-${index}`;
      return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="radio" name="variante-${producto.id}" id="${inputId}" value="${index}" ${index === 0 ? "checked" : ""}>
        <span class="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-slate-950 peer-checked:bg-slate-950 peer-checked:text-white hover:border-slate-950">
          ${variante.nombre}
        </span>
      </label>
    `;
    })
    .join("");

  const limiteOpciones = typeof LIMITE_OPCIONES_PRODUCTO !== "undefined" ? LIMITE_OPCIONES_PRODUCTO : 2;
  const opcionesHtml = producto.opciones
    .map((opcion, index) => {
      const inputId = `${producto.id}-op-${index}`;
      return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="checkbox" name="opcion-${producto.id}" id="${inputId}" value="${opcion}" ${index === 0 ? "checked" : ""} onchange="validarOpcionesProductoMenuGo('opcion-${producto.id}', this, ${limiteOpciones})">
        <span class="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-orange-500 peer-checked:bg-orange-500 peer-checked:text-white hover:border-orange-500">
          ${opcion}
        </span>
      </label>
    `;
    })
    .join("");

  const avisoOpcionesHtml = producto.opciones.length > limiteOpciones
    ? `<p class="mb-2 text-xs font-semibold text-orange-600">Puedes escoger máximo ${limiteOpciones} opciones.</p>`
    : "";

  return `
    <article class="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10" data-categoria="${producto.categoria}">
      <div class="h-52 w-full overflow-hidden bg-slate-100">
        <img class="h-full w-full object-cover" src="${producto.imagen}" alt="${producto.nombre}" loading="lazy" onerror="this.onerror=null; this.src='${IMAGEN_PLATO_PLACEHOLDER}';">
      </div>

      <div class="flex flex-1 flex-col p-4">
        <div class="mb-2 flex items-start justify-between gap-3">
          <h3 class="text-lg font-black leading-snug text-slate-950">${producto.nombre}</h3>
          <span class="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">${nombreCategoria(producto.categoria)}</span>
        </div>

        <p class="mb-3 min-h-10 text-sm leading-relaxed text-slate-600">${producto.descripcion}</p>

        <div class="mb-4 inline-flex w-fit rounded-full bg-orange-50 px-3 py-1.5 text-sm font-black text-orange-700">
          ${precioTexto}
        </div>

        ${
          producto.variantes.length > 1
            ? `
          <div class="mb-3">
            <p class="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Tamaño / presentación</p>
            <div class="flex flex-wrap gap-2">${variantesHtml}</div>
          </div>
        `
            : `<input type="hidden" name="variante-${producto.id}" value="0">`
        }

        <div class="mb-4">
          <p class="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">¿Cómo quieres tu plato?</p>
          ${avisoOpcionesHtml}
          <div class="flex flex-wrap gap-2">${opcionesHtml}</div>
        </div>

        <button type="button" class="mt-auto rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600" onclick="agregarAlCarrito('${producto.id}')">
          Agregar al carrito
        </button>
      </div>
    </article>
  `;
}

function filtrarCategoria(categoria) {
  categoriaActual = categoria;
  renderCategorias();
  renderProductos();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function obtenerSeleccion(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function obtenerSelecciones(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map((input) => input.value)
    .filter(Boolean);
}

function validarLimiteOpcionesProducto(name, checkbox, limite = 2) {
  return validarOpcionesProductoMenuGo(name, checkbox, limite);
}

function agregarAlCarrito(idProducto) {
  const producto = obtenerPlatosDisponibles().find((item) => item.id === idProducto);
  if (!producto) {
    alert("Producto no encontrado.");
    return;
  }

  const varianteIndex = Number(obtenerSeleccion(`variante-${idProducto}`) || 0);
  const variante = producto.variantes[varianteIndex] || producto.variantes[0];
  const opcionesSeleccionadas = obtenerSelecciones(`opcion-${idProducto}`);
  const opcion = opcionesSeleccionadas.length
    ? opcionesSeleccionadas.join(" + ")
    : "Preparación normal";
  const clave = `${producto.id}-${variante.nombre}-${opcion}`;

  const existente = carrito.find((item) => item.clave === clave);
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      clave,
      id: producto.id,
      nombre: producto.nombre,
      precio: variante.precio,
      variante: variante.nombre,
      opcion,
      comentario: opcion,
      cantidad: 1,
      categoria: producto.categoria,
    });
  }

  localStorage.setItem("pedido", JSON.stringify(carrito));
  actualizarCarrito();
  mostrarMensajeAgregado(producto.nombre);
}

function actualizarCantidad(clave, cambio) {
  const item = carrito.find((producto) => producto.clave === clave);
  if (!item) return;

  item.cantidad += cambio;
  if (item.cantidad <= 0) {
    carrito = carrito.filter((producto) => producto.clave !== clave);
  }

  localStorage.setItem("pedido", JSON.stringify(carrito));
  actualizarCarrito();
}

function eliminarItem(clave) {
  carrito = carrito.filter((producto) => producto.clave !== clave);
  localStorage.setItem("pedido", JSON.stringify(carrito));
  actualizarCarrito();
}

function actualizarCarrito() {
  const lista = document.getElementById("lista-carrito");
  const totalEl = document.getElementById("total-carrito");
  const totalMobileEl = document.getElementById("total-carrito-mobile");

  if (!lista || !totalEl) return;

  if (carrito.length === 0) {
    lista.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">Tu carrito está vacío.</div>`;
  } else {
    lista.innerHTML = carrito
      .map(
        (item) => `
      <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div class="flex items-start justify-between gap-3">
          <strong class="text-sm font-black leading-snug text-slate-950">${item.nombre}</strong>
          <button type="button" class="text-xs font-black text-red-500 hover:text-red-700" onclick="eliminarItem('${item.clave}')">Quitar</button>
        </div>

        <p class="mt-1 text-xs font-semibold text-slate-500">${item.variante} · ${item.opcion}</p>

        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button class="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-lg font-black text-slate-700 hover:bg-slate-100" type="button" onclick="actualizarCantidad('${item.clave}', -1)">-</button>
            <span class="min-w-5 text-center text-sm font-black text-slate-950">${item.cantidad}</span>
            <button class="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-lg font-black text-slate-700 hover:bg-slate-100" type="button" onclick="actualizarCantidad('${item.clave}', 1)">+</button>
          </div>
          <strong class="text-sm font-black text-slate-950">S/ ${soles(item.precio * item.cantidad)}</strong>
        </div>
      </div>
    `,
      )
      .join("");
  }

  const total = carrito.reduce(
    (suma, item) => suma + item.precio * item.cantidad,
    0,
  );
  totalEl.textContent = soles(total);
  if (totalMobileEl) totalMobileEl.textContent = soles(total);
}

function mostrarMensajeAgregado(nombreProducto) {
  const toast = document.createElement("div");
  toast.className =
    "fixed right-5 top-5 z-[60] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-emerald-900/20";
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <span>${nombreProducto} agregado al carrito</span>
      <button type="button" class="text-white/80 hover:text-white" onclick="this.closest('div.fixed').remove()">✕</button>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function guardarCarrito() {
  if (carrito.length === 0) {
    alert("Agrega al menos un producto antes de continuar.");
    return;
  }
  localStorage.setItem("pedido", JSON.stringify(carrito));
  window.location.href = obtenerDestinoResumen();
}

function irPedidoActual() {
  const mesa = localStorage.getItem("mesa") || localStorage.getItem("mesaActual");
  const token = localStorage.getItem("mesaToken");
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) {
    window.location.href = `../Cliente/pedido_actual.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
    return;
  }
  window.location.href = numero
    ? `../Cliente/pedido_actual.html?mesa=${encodeURIComponent(numero)}`
    : "../Cliente/pedido_actual.html";
}

function toggleCarrito() {
  const panel = document.getElementById("cart-panel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  panel.classList.toggle("flex");
}

function toggleCarrito() {
    const panel = document.getElementById("cart-panel");
    if (!panel) return;
    panel.classList.toggle("hidden");
    panel.classList.toggle("flex");
}

function mostrarMensajeAgregado(nombreProducto) {
    const toast = document.createElement("div");
    toast.className = "fixed right-5 top-5 z-[60] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg";
    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <span>✓ ${nombreProducto} agregado al carrito</span>
            <button type="button" class="text-white/80 hover:text-white" onclick="this.closest('div.fixed').remove()">✕</button>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

async function refrescarProductosCliente() {
  await cargarProductosDesdeBD();
  renderCategorias();
  renderProductos();
}

function inicializarBuscadorPlatos() {
  const buscador = document.getElementById("buscador-platos");
  const limpiar = document.getElementById("limpiar-busqueda");

  if (!buscador) return;

  buscador.value = busquedaActual;
  buscador.addEventListener("input", (event) => {
    busquedaActual = event.target.value;
    renderProductos();
  });

  if (limpiar) {
    limpiar.addEventListener("click", () => {
      busquedaActual = "";
      buscador.value = "";
      renderProductos();
      buscador.focus();
    });
  }
}

function iniciarEscuchaEventosCliente() {
  document.addEventListener('producto:actualizado', () => {
    refrescarProductosCliente();
    actualizarCarrito();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarContextoPedido();
  inicializarBuscadorPlatos();
  await refrescarProductosCliente();
  actualizarCarrito();
  iniciarEscuchaEventosCliente();
  setInterval(() => {
    if (!document.hidden) refrescarProductosCliente();
  }, 15000);
});
 
