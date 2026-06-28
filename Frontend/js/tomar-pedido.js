if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
// MenuGo - pedido manual tomado por el mesero conectado a PostgreSQL.
// El pedido va a cocina; el panel del mesero no lo vera hasta que cocina lo marque listo.

const API_BASE = window.MENUGO_API || "http://localhost:4000/api";

const TOTAL_MESAS_MESERO = 20;
const STORAGE_PEDIDO_TEMPORAL_MESERO = "pedidoMeseroTemporal";
const STORAGE_PEDIDOS_MESERO = "pedidos";
const STORAGE_MESAS_MESERO = "mesas";

let categoriaActualMesero = "todas";
let pedidoTemporalMesero = JSON.parse(localStorage.getItem(STORAGE_PEDIDO_TEMPORAL_MESERO) || "[]");
let mesaSeleccionadaMesero = "1";
let productosMeseroBD = null;

function solesMesero(valor) {
  return Number(valor || 0).toFixed(2);
}

function escapeHtmlMesero(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nombreCategoriaMesero(id) {
  return categorias.find((categoria) => categoria.id === id)?.nombre || "Todos los platos";
}

function obtenerMesaInicialMesero() {
  const params = new URLSearchParams(window.location.search);
  const mesaUrl = params.get("mesa");
  const mesaGuardada = localStorage.getItem("mesaActual") || localStorage.getItem("mesa");
  const valor = mesaUrl || mesaGuardada || "1";
  return String(valor).replace(/[^0-9]/g, "") || "1";
}

function inicializarSelectorMesas() {
  mesaSeleccionadaMesero = obtenerMesaInicialMesero();
  const select = document.getElementById("mesa-select");
  if (!select) return;

  select.innerHTML = Array.from({ length: TOTAL_MESAS_MESERO }, (_, index) => {
    const numero = String(index + 1);
    return `<option value="${numero}" ${numero === mesaSeleccionadaMesero ? "selected" : ""}>Mesa ${numero}</option>`;
  }).join("");

  guardarMesaSeleccionada();
  actualizarMesaPanel();
}

function guardarMesaSeleccionada() {
  localStorage.setItem("mesa", mesaSeleccionadaMesero);
  localStorage.setItem("mesaActual", mesaSeleccionadaMesero);
}

function cambiarMesaPedido() {
  const select = document.getElementById("mesa-select");
  mesaSeleccionadaMesero = select?.value || "1";
  guardarMesaSeleccionada();
  actualizarMesaPanel();
}

function actualizarMesaPanel() {
  const mesaPanel = document.getElementById("mesa-panel");
  if (mesaPanel) mesaPanel.textContent = mesaSeleccionadaMesero;
}

function productoMeseroDesdeBD(producto) {
  const id = producto.codigo_producto || String(producto.id_producto || producto.id);
  const productoLocal = buscarProductoLocalMenuGo({ ...producto, id });
  const categoriaOriginal = producto.categoria || producto.tipo_producto || producto.tipo || "plato";
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

  return {
    ...normalizado,
    variantes: [{ nombre: "Unidad", precio: Number(producto.precio || 0) }],
    opciones: opcionesProductoMenuGo(normalizado),
  };
}

async function cargarProductosMeseroDesdeBD() {
  try {
    const data = await apiJsonMesero("/productos/disponibles");
    productosMeseroBD = (data.data || []).map(productoMeseroDesdeBD);
  } catch (error) {
    console.warn("Usando menu local porque no se pudo leer la BD:", error.message);
    productosMeseroBD = null;
  }
}

function obtenerPlatosMesero() {
  return productosMeseroBD && productosMeseroBD.length ? productosMeseroBD : (productosMenu || []);
}

function renderCategoriasMesero() {
  const contenedor = document.getElementById("categorias-container");
  if (!contenedor) return;

  contenedor.innerHTML = categorias.map((categoria) => {
    const activo = categoria.id === categoriaActualMesero;
    const clases = activo
      ? "whitespace-nowrap rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm"
      : "whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white";

    return `
      <button type="button" class="${clases}" onclick="filtrarCategoriaMesero('${categoria.id}')">
        ${escapeHtmlMesero(categoria.nombre)}
      </button>`;
  }).join("");
}

function renderPlatosMesero() {
  const contenedor = document.getElementById("platos-container");
  const titulo = document.getElementById("titulo-categoria");
  if (!contenedor) return;

  const platosBase = obtenerPlatosMesero();
  const filtrados = categoriaActualMesero === "todas"
    ? platosBase
    : platosBase.filter((plato) => plato.categoria === categoriaActualMesero);

  if (titulo) {
    titulo.textContent = categoriaActualMesero === "todas"
      ? "Todos los platos"
      : nombreCategoriaMesero(categoriaActualMesero);
  }

  if (filtrados.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h3 class="text-xl font-black text-slate-800">No hay platos en esta sección</h3>
        <p class="mt-2 text-slate-500">Selecciona otra categoría para continuar.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = filtrados.map(crearCardPlatoMesero).join("");
}

function crearCardPlatoMesero(plato) {
  const varianteDefault = plato.variantes[0];
  const precioTexto = plato.variantes.length === 1
    ? `S/ ${solesMesero(varianteDefault.precio)}`
    : plato.variantes.map((variante) => `${escapeHtmlMesero(variante.nombre)}: S/ ${solesMesero(variante.precio)}`).join(" · ");

  const variantesHtml = plato.variantes.map((variante, index) => {
    const inputId = `${plato.id}-mesero-var-${index}`;
    return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="radio" name="mesero-variante-${plato.id}" id="${inputId}" value="${index}" ${index === 0 ? "checked" : ""}>
        <span class="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-slate-950 peer-checked:bg-slate-950 peer-checked:text-white hover:border-slate-950">
          ${escapeHtmlMesero(variante.nombre)}
        </span>
      </label>`;
  }).join("");

  const limiteOpciones = typeof LIMITE_OPCIONES_PRODUCTO !== "undefined" ? LIMITE_OPCIONES_PRODUCTO : 2;
  const opcionesHtml = plato.opciones.map((opcion, index) => {
    const inputId = `${plato.id}-mesero-op-${index}`;
    return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="checkbox" name="mesero-opcion-${plato.id}" id="${inputId}" value="${escapeHtmlMesero(opcion)}" ${index === 0 ? "checked" : ""} onchange="validarLimiteOpcionesMesero('mesero-opcion-${plato.id}', this, ${limiteOpciones})">
        <span class="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-orange-500 peer-checked:bg-orange-500 peer-checked:text-white hover:border-orange-500">
          ${escapeHtmlMesero(opcion)}
        </span>
      </label>`;
  }).join("");

  const avisoOpcionesHtml = plato.opciones.length > limiteOpciones
    ? `<p class="mb-2 text-xs font-semibold text-orange-600">Puedes escoger máximo ${limiteOpciones} opciones.</p>`
    : "";

  return `
    <article class="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10">
      <div class="h-48 w-full overflow-hidden bg-slate-100">
        <img class="h-full w-full object-cover" src="${plato.imagen}" alt="${escapeHtmlMesero(plato.nombre)}" loading="lazy" onerror="this.onerror=null; this.src='${IMAGEN_PLATO_PLACEHOLDER}';">
      </div>

      <div class="flex flex-1 flex-col p-4">
        <div class="mb-2 flex items-start justify-between gap-3">
          <h3 class="text-lg font-black leading-snug text-slate-950">${escapeHtmlMesero(plato.nombre)}</h3>
          <span class="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">${escapeHtmlMesero(nombreCategoriaMesero(plato.categoria))}</span>
        </div>

        <p class="mb-3 min-h-10 text-sm leading-relaxed text-slate-600">${escapeHtmlMesero(plato.descripcion)}</p>

        <div class="mb-4 inline-flex w-fit rounded-full bg-orange-50 px-3 py-1.5 text-sm font-black text-orange-700">
          ${precioTexto}
        </div>

        ${plato.variantes.length > 1 ? `
          <div class="mb-3">
            <p class="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Tamaño / presentación</p>
            <div class="flex flex-wrap gap-2">${variantesHtml}</div>
          </div>` : `<input type="hidden" name="mesero-variante-${plato.id}" value="0">`}

        <div class="mb-4">
          <p class="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">¿Cómo quiere el plato?</p>
          ${avisoOpcionesHtml}
          <div class="flex flex-wrap gap-2">${opcionesHtml}</div>
        </div>

        <button type="button" class="mt-auto rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600" onclick="agregarPlatoTemporal('${plato.id}')">
          Agregar al pedido
        </button>
      </div>
    </article>`;
}

function filtrarCategoriaMesero(categoria) {
  categoriaActualMesero = categoria;
  renderCategoriasMesero();
  renderPlatosMesero();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function obtenerSeleccionMesero(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function obtenerSeleccionesMesero(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map((input) => input.value)
    .filter(Boolean);
}

function validarLimiteOpcionesMesero(name, checkbox, limite = 2) {
  const seleccionadas = document.querySelectorAll(`input[name="${name}"]:checked`);
  if (seleccionadas.length <= limite) return true;

  checkbox.checked = false;
  alert(`Solo puedes escoger hasta ${limite} opciones por producto.`);
  return false;
}

function guardarPedidoTemporal() {
  localStorage.setItem(STORAGE_PEDIDO_TEMPORAL_MESERO, JSON.stringify(pedidoTemporalMesero));
}

function agregarPlatoTemporal(idPlato) {
  const plato = obtenerPlatosMesero().find((item) => item.id === idPlato);
  if (!plato) {
    alert("Plato no encontrado.");
    return;
  }

  const varianteIndex = Number(obtenerSeleccionMesero(`mesero-variante-${idPlato}`) || 0);
  const variante = plato.variantes[varianteIndex] || plato.variantes[0];
  const opcionesSeleccionadas = obtenerSeleccionesMesero(`mesero-opcion-${idPlato}`);
  const opcion = opcionesSeleccionadas.length
    ? opcionesSeleccionadas.join(" + ")
    : "Preparación normal";
  const clave = `${plato.id}-${variante.nombre}-${opcion}`;

  const existente = pedidoTemporalMesero.find((item) => item.clave === clave);
  if (existente) {
    existente.cantidad += 1;
  } else {
    pedidoTemporalMesero.push({
      clave,
      id: plato.id,
      nombre: plato.nombre,
      precio: Number(variante.precio),
      variante: variante.nombre,
      opcion,
      comentario: opcion,
      cantidad: 1,
      categoria: plato.categoria,
    });
  }

  guardarPedidoTemporal();
  renderPedidoTemporal();
  mostrarToastMesero(`${plato.nombre} agregado`);
}

function actualizarCantidadTemporal(clave, cambio) {
  const item = pedidoTemporalMesero.find((producto) => producto.clave === clave);
  if (!item) return;

  item.cantidad += cambio;
  if (item.cantidad <= 0) {
    pedidoTemporalMesero = pedidoTemporalMesero.filter((producto) => producto.clave !== clave);
  }

  guardarPedidoTemporal();
  renderPedidoTemporal();
}

function eliminarTemporal(clave) {
  pedidoTemporalMesero = pedidoTemporalMesero.filter((producto) => producto.clave !== clave);
  guardarPedidoTemporal();
  renderPedidoTemporal();
}

function totalPedidoTemporal() {
  return pedidoTemporalMesero.reduce((suma, item) => suma + Number(item.precio || 0) * Number(item.cantidad || 1), 0);
}

function renderPedidoTemporal() {
  actualizarMesaPanel();
  const lista = document.getElementById("lista-pedido-temporal");
  const totalEl = document.getElementById("total-pedido-temporal");
  const totalMobileEl = document.getElementById("total-pedido-mobile");

  if (!lista || !totalEl) return;

  if (pedidoTemporalMesero.length === 0) {
    lista.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">Todavía no hay platos agregados.</div>`;
  } else {
    lista.innerHTML = pedidoTemporalMesero.map((item) => `
      <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div class="flex items-start justify-between gap-3">
          <strong class="text-sm font-black leading-snug text-slate-950">${escapeHtmlMesero(item.nombre)}</strong>
          <button type="button" class="text-xs font-black text-red-500 hover:text-red-700" onclick="eliminarTemporal('${escapeHtmlMesero(item.clave)}')">Quitar</button>
        </div>
        <p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtmlMesero(item.variante)} · ${escapeHtmlMesero(item.opcion)}</p>
        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button class="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-lg font-black text-slate-700 hover:bg-slate-100" type="button" onclick="actualizarCantidadTemporal('${escapeHtmlMesero(item.clave)}', -1)">-</button>
            <span class="min-w-5 text-center text-sm font-black text-slate-950">${item.cantidad}</span>
            <button class="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-lg font-black text-slate-700 hover:bg-slate-100" type="button" onclick="actualizarCantidadTemporal('${escapeHtmlMesero(item.clave)}', 1)">+</button>
          </div>
          <strong class="text-sm font-black text-slate-950">S/ ${solesMesero(item.precio * item.cantidad)}</strong>
        </div>
      </div>`).join("");
  }

  const total = totalPedidoTemporal();
  totalEl.textContent = solesMesero(total);
  if (totalMobileEl) totalMobileEl.textContent = solesMesero(total);
}

function vaciarPedidoTemporal() {
  if (pedidoTemporalMesero.length === 0) return;
  if (!confirm("¿Vaciar el pedido temporal?")) return;
  pedidoTemporalMesero = [];
  guardarPedidoTemporal();
  renderPedidoTemporal();
}

function obtenerMesasGuardadas() {
  const guardadas = JSON.parse(localStorage.getItem(STORAGE_MESAS_MESERO) || "null");
  if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
  return Array.from({ length: TOTAL_MESAS_MESERO }, (_, index) => ({
    numero: index + 1,
    estadoManual: "libre",
    nota: "",
    actualizadaEn: null,
  }));
}

function marcarMesaOcupada(numeroMesa) {
  const mesas = obtenerMesasGuardadas();
  const numero = Number(numeroMesa);
  const grupoActivo = obtenerGrupoActivoParaMesa(numero);
  const mesasGrupo = grupoActivo ? new Set(grupoActivo.mesas.map(Number)) : new Set([numero]);
  const actualizadas = mesas.map((mesa) => {
    if (!mesasGrupo.has(Number(mesa.numero))) return mesa;
    return {
      ...mesa,
      estadoManual: grupoActivo ? "unida" : "ocupada",
      grupoId: grupoActivo?.id || mesa.grupoId,
      nota: grupoActivo?.nombre || mesa.nota,
      actualizadaEn: new Date().toISOString(),
    };
  });
  localStorage.setItem(STORAGE_MESAS_MESERO, JSON.stringify(actualizadas));
}


function obtenerGrupoActivoParaMesa(numeroMesa) {
  const grupos = JSON.parse(localStorage.getItem("gruposMesas") || "[]");
  const numero = Number(numeroMesa);
  return grupos.find((grupo) =>
    grupo.estado === "activo" && Array.isArray(grupo.mesas) && grupo.mesas.map(Number).includes(numero),
  ) || null;
}

function crearPedidoMesero() {
  const ahora = new Date();
  const id = Date.now();
  const mesa = mesaSeleccionadaMesero;
  const total = totalPedidoTemporal();
  const grupoActivo = obtenerGrupoActivoParaMesa(mesa);

  return {
    id,
    codigo: `PED-${id}`,
    tipoConsumo: "Local",
    origen: "Mesero",
    mesa,
    cliente: grupoActivo ? grupoActivo.nombre : `Mesa ${mesa}`,
    grupoMesa: grupoActivo?.nombre,
    grupoMesaId: grupoActivo?.id,
    mesaPrincipal: grupoActivo ? `Mesa ${grupoActivo.mesaPrincipal}` : undefined,
    mesasUnidas: grupoActivo ? grupoActivo.mesas.map((numero) => `Mesa ${numero}`) : undefined,
    productos: pedidoTemporalMesero.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      precio: Number(item.precio),
      cantidad: Number(item.cantidad || 1),
      variante: item.variante,
      opcion: item.opcion || item.comentario || "Preparación normal",
      comentario: item.opcion || item.comentario || "Preparación normal",
      categoria: item.categoria,
      pagado: false,
      montoPagado: 0,
    })),
    total,
    estado: "Pendiente",
    estadoPedido: "Pendiente",
    estadoPago: "Pendiente",
    metodoPago: "Cobro por mesero",
    fecha: ahora.toLocaleDateString("es-PE"),
    hora: ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    fechaISO: ahora.toISOString(),
  };
}

async function apiJsonMesero(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function itemMeseroApi(item) {
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

async function confirmarPedidoMesero() {
  if (!mesaSeleccionadaMesero) {
    alert("Selecciona una mesa antes de confirmar.");
    return;
  }

  if (pedidoTemporalMesero.length === 0) {
    alert("Agrega al menos un plato antes de enviar a cocina.");
    return;
  }

  const boton = document.querySelector('button[onclick="confirmarPedidoMesero()"]');
  if (boton) boton.disabled = true;

  try {
    const data = await apiJsonMesero("/pedidos", {
      method: "POST",
      body: JSON.stringify({
        tipo_pedido: "mesa",
        id_mesa: Number(mesaSeleccionadaMesero),
        nombre_cliente: `Mesa ${mesaSeleccionadaMesero}`,
        telefono: "988888888",
        registrado_por: 2,
        items: pedidoTemporalMesero.map(itemMeseroApi),
      }),
    });

    const pedido = data.data;
    localStorage.setItem("ultimoPedidoMesero", JSON.stringify(pedido));
    marcarMesaOcupada(mesaSeleccionadaMesero);

    pedidoTemporalMesero = [];
    guardarPedidoTemporal();
    renderPedidoTemporal();

    const botonMobile = document.getElementById("boton-pedido-mobile");
    if (botonMobile) botonMobile.classList.add("hidden");

    const main = document.querySelector("main");
    main.innerHTML = `
      <section class="mx-auto mt-8 max-w-2xl rounded-[28px] bg-white p-8 text-center shadow-xl shadow-slate-900/10">
        <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <p class="text-sm font-black uppercase tracking-wide text-emerald-600">Pedido enviado</p>
        <h1 class="mt-2 text-3xl font-black text-slate-950">Pedido registrado en BD y enviado a cocina</h1>
        <p class="mx-auto mt-3 max-w-xl text-slate-600">
          La orden fue registrada para la <strong>Mesa ${escapeHtmlMesero(mesaSeleccionadaMesero)}</strong>. El mesero la vera como entrega pendiente solo cuando cocina marque <strong>listo</strong>.
        </p>
        <div class="mx-auto mt-6 max-w-sm rounded-2xl bg-slate-50 p-4 text-left text-sm">
          <p><strong>Codigo:</strong> ${escapeHtmlMesero(pedido.codigo || `PED-${pedido.id_pedido}`)}</p>
          <p><strong>Total:</strong> S/ ${solesMesero(pedido.total)}</p>
          <p><strong>Estado cocina:</strong> ${escapeHtmlMesero(pedido.estadoPedido || "Pendiente")}</p>
        </div>
        <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a href="tomar_pedido.html?mesa=${encodeURIComponent(mesaSeleccionadaMesero)}" class="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600">Agregar otro</a>
          <a href="../Cocina/pedidos.html" class="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">Ver cocina</a>
          <a href="mesas.html" class="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Ver mesas</a>
        </div>
      </section>`;
  } catch (error) {
    alert(`No se pudo registrar el pedido en la BD: ${error.message}`);
    if (boton) boton.disabled = false;
  }
}

function togglePedidoTemporal() {
  const panel = document.getElementById("panel-pedido");
  if (!panel) return;
  panel.classList.toggle("hidden");
  panel.classList.toggle("flex");
}

function mostrarToastMesero(mensaje) {
  const toast = document.createElement("div");
  toast.className = "fixed right-5 top-5 z-[60] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-emerald-900/20";
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <span>${escapeHtmlMesero(mensaje)}</span>
      <button type="button" class="text-white/80 hover:text-white" onclick="this.closest('div.fixed').remove()">✕</button>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

async function refrescarProductosMesero() {
  await cargarProductosMeseroDesdeBD();
  renderCategoriasMesero();
  renderPlatosMesero();
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarSelectorMesas();
  await refrescarProductosMesero();
  renderPedidoTemporal();
  setInterval(() => {
    if (!document.hidden) refrescarProductosMesero();
  }, 15000);
});
