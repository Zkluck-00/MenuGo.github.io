// MenuGo - gestion administrativa del menu

const ADMIN_MENU_KEYS = {
  nuevos: "menugo_admin_productos_nuevos",
  eliminados: "menugo_admin_productos_eliminados",
  menuDia: "menugo_admin_menu_dia",
};

let sesionMenuAdminActual = null;
let todosProductosAdmin = [];
let usandoBackendMenuAdmin = false;
let refrescoMenuAdmin = null;

function leerJSONMenuAdmin(clave, valorDefault = []) {
  try {
    const datos = JSON.parse(localStorage.getItem(clave) || JSON.stringify(valorDefault));
    return Array.isArray(datos) ? datos : valorDefault;
  } catch (error) {
    console.error("No se pudo leer informacion del menu", error);
    return valorDefault;
  }
}

function guardarJSONMenuAdmin(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
}

function escapeHtmlMenuAdmin(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function solesMenuAdmin(valor) {
  return Number(valor || 0).toFixed(2);
}

function normalizarBusquedaMenuAdmin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function leerProductosNuevosAdmin() {
  return leerJSONMenuAdmin(ADMIN_MENU_KEYS.nuevos);
}

function guardarProductosNuevosAdmin(productos) {
  guardarJSONMenuAdmin(ADMIN_MENU_KEYS.nuevos, productos);
}

function leerProductosEliminadosAdmin() {
  return leerJSONMenuAdmin(ADMIN_MENU_KEYS.eliminados);
}

function guardarProductosEliminadosAdmin(ids) {
  guardarJSONMenuAdmin(ADMIN_MENU_KEYS.eliminados, Array.from(new Set(ids)));
}

function menuDiaAdminConfigurado() {
  return localStorage.getItem(ADMIN_MENU_KEYS.menuDia) !== null;
}

function leerMenuDiaAdmin() {
  return leerJSONMenuAdmin(ADMIN_MENU_KEYS.menuDia);
}

function guardarMenuDiaAdmin(ids) {
  guardarJSONMenuAdmin(ADMIN_MENU_KEYS.menuDia, Array.from(new Set(ids)));
}

function obtenerCategoriaMenuAdmin(id) {
  return categorias.find((categoria) => categoria.id === id)?.nombre || "Sin categoria";
}

function normalizarProductoMenuAdmin(producto) {
  const id = String(producto.id || producto.id_producto || producto.codigo_producto || producto.codigo || crearIdProductoAdmin(producto.nombre));
  const precio = Number(producto.precio || producto.variantes?.[0]?.precio || 0);
  const variantes = Array.isArray(producto.variantes) && producto.variantes.length > 0
    ? producto.variantes
    : [{ nombre: "Unico", precio }];

  const opciones = Array.isArray(producto.opciones) && producto.opciones.length > 0
    ? producto.opciones
    : ["Preparacion normal"];

  return {
    ...producto,
    id,
    id_producto: id,
    categoria: producto.categoria || producto.tipo_producto || "plato",
    nombre: producto.nombre || "Producto sin nombre",
    descripcion: producto.descripcion || "Producto registrado por administracion.",
    variantes,
    opciones,
    imagen: producto.imagen || IMAGEN_PLATO_PLACEHOLDER,
    disponible: producto.disponible_local !== undefined ? Boolean(producto.disponible_local) : (producto.disponible !== undefined ? Boolean(producto.disponible) : producto.stock === undefined || Number(producto.stock) > 0),
    disponibleLocal: producto.disponible_local !== undefined ? Boolean(producto.disponible_local) : (producto.disponible !== undefined ? Boolean(producto.disponible) : producto.stock === undefined || Number(producto.stock) > 0),
    paraLlevar: producto.paraLlevar !== undefined ? Boolean(producto.paraLlevar) : producto.disponible_llevar !== false,
    esBackendAdmin: Boolean(producto.esBackendAdmin),
  };
}

function obtenerTodosProductosAdmin() {
  if (usandoBackendMenuAdmin) {
    return todosProductosAdmin.map(normalizarProductoMenuAdmin);
  }

  const eliminados = new Set(leerProductosEliminadosAdmin());
  const nuevos = leerProductosNuevosAdmin().map((producto) => normalizarProductoMenuAdmin({ ...producto, esNuevoAdmin: true }));
  const base = productosMenu.map((producto) => normalizarProductoMenuAdmin({ ...producto, esNuevoAdmin: false }));
  return [...base, ...nuevos].filter((producto) => !eliminados.has(producto.id) && !producto.eliminado);
}

function obtenerProductoAdminPorId(id) {
  return obtenerTodosProductosAdmin().find((producto) => String(producto.id) === String(id));
}

function llenarSelectCategoriasMenuAdmin() {
  const selectProducto = document.getElementById("producto-categoria");
  const selectFiltro = document.getElementById("filtro-categoria-admin");
  const opciones = categorias.filter((categoria) => categoria.id !== "todas");

  if (selectProducto) {
    selectProducto.innerHTML = opciones.map((categoria) => `
      <option value="${escapeHtmlMenuAdmin(categoria.id)}">${escapeHtmlMenuAdmin(categoria.nombre)}</option>
    `).join("");
  }

  if (selectFiltro) {
    selectFiltro.innerHTML = `
      <option value="todas">Todas las categorias</option>
      ${opciones.map((categoria) => `
        <option value="${escapeHtmlMenuAdmin(categoria.id)}">${escapeHtmlMenuAdmin(categoria.nombre)}</option>
      `).join("")}
    `;
  }
}

function actualizarEstadisticasMenuAdmin() {
  const productos = obtenerTodosProductosAdmin();
  const menuDia = leerMenuDiaAdmin();
  const nuevos = usandoBackendMenuAdmin ? productos.filter((producto) => producto.esNuevoAdmin).length : leerProductosNuevosAdmin().length;
  const totalMenuDia = usandoBackendMenuAdmin
    ? productos.filter((producto) => producto.disponibleLocal !== false && producto.disponible !== false).length
    : (menuDiaAdminConfigurado() ? menuDia.length : productos.length);

  const statActivos = document.getElementById("stat-productos-activos");
  const statMenuDia = document.getElementById("stat-menu-dia");
  const statNuevos = document.getElementById("stat-productos-nuevos");

  if (statActivos) statActivos.textContent = String(productos.length);
  if (statMenuDia) statMenuDia.textContent = String(totalMenuDia);
  if (statNuevos) statNuevos.textContent = String(nuevos);
}

function crearIdProductoAdmin(nombre) {
  const base = normalizarBusquedaMenuAdmin(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "producto";
  return `adm-${base}-${Date.now()}`;
}

function pintarProductosAdmin() {
  const contenedor = document.getElementById("lista-productos-admin");
  if (!contenedor) return;

  const productos = obtenerTodosProductosAdmin();
  const busqueda = normalizarBusquedaMenuAdmin(document.getElementById("buscar-producto-admin")?.value);
  const categoria = document.getElementById("filtro-categoria-admin")?.value || "todas";
  const menuDiaConfigurado = menuDiaAdminConfigurado();
  const menuDia = new Set(leerMenuDiaAdmin());

  const filtrados = productos.filter((producto) => {
    const coincideCategoria = categoria === "todas" || producto.categoria === categoria;
    const texto = `${producto.nombre} ${producto.descripcion} ${obtenerCategoriaMenuAdmin(producto.categoria)}`.toLowerCase();
    const coincideBusqueda = !busqueda || texto.includes(busqueda);
    return coincideCategoria && coincideBusqueda;
  });

  if (filtrados.length === 0) {
    contenedor.innerHTML = `
      <div class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p class="text-lg font-black text-slate-800">No se encontraron productos</p>
        <p class="mt-1 text-sm font-semibold text-slate-500">Prueba con otra categoria o busqueda.</p>
      </div>`;
    actualizarEstadisticasMenuAdmin();
    return;
  }

  contenedor.innerHTML = filtrados.map((producto) => {
    const precioBase = producto.variantes?.[0]?.precio || producto.precio || 0;
    const idParaCheckbox = producto.codigo_producto || producto.id;
    const enMenuDia = usandoBackendMenuAdmin ? producto.disponible : (menuDiaConfigurado ? menuDia.has(producto.id) : true);
    
    return `
      <article class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="flex gap-4">
            <img src="${escapeHtmlMenuAdmin(producto.imagen || IMAGEN_PLATO_PLACEHOLDER)}" alt="${escapeHtmlMenuAdmin(producto.nombre)}" class="h-20 w-24 rounded-2xl object-cover bg-white" onerror="this.onerror=null; this.src='${IMAGEN_PLATO_PLACEHOLDER}';" />
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-black text-slate-950">${escapeHtmlMenuAdmin(producto.nombre)}</h3>
                ${producto.esNuevoAdmin ? `<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">Nuevo</span>` : ""}
              </div>
              <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtmlMenuAdmin(obtenerCategoriaMenuAdmin(producto.categoria))} | S/ ${solesMenuAdmin(precioBase)}</p>
              <p class="mt-1 max-w-2xl text-sm text-slate-600">${escapeHtmlMenuAdmin(producto.descripcion)}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row md:items-center">
            <label class="flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              <input type="checkbox" class="h-4 w-4 accent-orange-500" ${enMenuDia ? "checked" : ""} onchange="alternarProductoMenuDiaAdmin('${escapeHtmlMenuAdmin(idParaCheckbox)}', this.checked)" />
              Para local
            </label>
            <label class="flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              <input type="checkbox" class="h-4 w-4 accent-emerald-500" ${producto.paraLlevar ? "checked" : ""} onchange="alternarProductoLlevarAdmin('${escapeHtmlMenuAdmin(idParaCheckbox)}', this.checked)" />
              Para llevar
            </label>
            <button type="button" onclick="eliminarProductoAdmin('${escapeHtmlMenuAdmin(idParaCheckbox)}')" class="rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white hover:bg-red-600">
              Eliminar
            </button>
          </div>
        </div>
      </article>`;
  }).join("");

  actualizarEstadisticasMenuAdmin();
}

async function alternarProductoMenuDiaAdmin(id, activo) {
  console.log('ID recibido en alternarProductoMenuDiaAdmin:', id);
  console.log('Activo:', activo);
  
  const producto = obtenerProductoAdminPorId(id);
  console.log('Producto encontrado:', producto);

  if (usandoBackendMenuAdmin && producto?.esBackendAdmin) {
    try {
      const idParaEnviar = producto.codigo_producto || producto.id;
      console.log('ID a enviar al backend:', idParaEnviar);
      await actualizarDisponibilidadProductoBackend(idParaEnviar, activo);
      await cargarYPintarProductosAdmin();
      
      const evt = new CustomEvent('producto:actualizado', { detail: { id, activo } });
      document.dispatchEvent(evt);
    } catch (error) {
      console.error('Error en alternarProductoMenuDiaAdmin:', error);
      alert(`No se pudo actualizar el menu del dia en la BD: ${error.message}`);
      await cargarYPintarProductosAdmin();
    }
    return;
  }

  const productos = obtenerTodosProductosAdmin();
  let menuDia = leerMenuDiaAdmin();

  if (!menuDiaAdminConfigurado()) {
    menuDia = productos.map((item) => item.id);
  }

  if (activo) {
    if (!menuDia.includes(id)) {
      menuDia.push(id);
    }
  } else {
    menuDia = menuDia.filter((productoId) => productoId !== id);
  }

  guardarMenuDiaAdmin(menuDia);
  pintarProductosAdmin();
}

async function seleccionarTodoMenuDiaAdmin() {
  const productos = obtenerTodosProductosAdmin();

  if (usandoBackendMenuAdmin) {
    try {
      await Promise.all(productos.map((producto) => actualizarDisponibilidadProductoBackend(producto.codigo_producto || producto.id, true)));
      await cargarYPintarProductosAdmin();
      
      const evt = new CustomEvent('producto:actualizado', { detail: { todos: true } });
      document.dispatchEvent(evt);
    } catch (error) {
      alert(`No se pudo seleccionar todo en la BD: ${error.message}`);
    }
    return;
  }

  guardarMenuDiaAdmin(productos.map((producto) => producto.id));
  pintarProductosAdmin();
}

async function limpiarMenuDiaAdmin() {
  if (!confirm("¿Deseas dejar el menu del dia sin productos seleccionados?")) return;

  if (usandoBackendMenuAdmin) {
    try {
      const productos = obtenerTodosProductosAdmin();
      await Promise.all(productos.map((producto) => actualizarDisponibilidadProductoBackend(producto.codigo_producto || producto.id, false)));
      await cargarYPintarProductosAdmin();
      
      const evt = new CustomEvent('producto:actualizado', { detail: { todos: false } });
      document.dispatchEvent(evt);
    } catch (error) {
      alert(`No se pudo limpiar el menu del dia en la BD: ${error.message}`);
    }
    return;
  }

  guardarMenuDiaAdmin([]);
  pintarProductosAdmin();
}
async function eliminarProductoAdmin(id) {
  const producto = obtenerProductoAdminPorId(id);
  if (!producto) return;

  if (!confirm(`¿Eliminar "${producto.nombre}" del menu?`)) return;

  if (usandoBackendMenuAdmin && producto.esBackendAdmin) {
    try {
      await eliminarProductoBackend(id);
      await cargarYPintarProductosAdmin();
    } catch (error) {
      alert(`No se pudo eliminar de la BD: ${error.message}`);
    }
    return;
  }

  if (producto.esNuevoAdmin) {
    const nuevos = leerProductosNuevosAdmin().filter((item) => item.id !== id);
    guardarProductosNuevosAdmin(nuevos);
  } else {
    const eliminados = leerProductosEliminadosAdmin();
    eliminados.push(id);
    guardarProductosEliminadosAdmin(eliminados);
  }

  const menuDia = leerMenuDiaAdmin().filter((productoId) => productoId !== id);
  guardarMenuDiaAdmin(menuDia);
  pintarProductosAdmin();
}

async function registrarProductoAdmin(event) {
  event.preventDefault();

  const nombre = document.getElementById("producto-nombre")?.value.trim();
  const categoria = document.getElementById("producto-categoria")?.value;
  const precio = Number(document.getElementById("producto-precio")?.value || 0);
  const descripcion = document.getElementById("producto-descripcion")?.value.trim();
  const imagen = document.getElementById("producto-imagen")?.value.trim();
  const paraLlevar = Boolean(document.getElementById("producto-para-llevar")?.checked);
  const agregarMenuDia = Boolean(document.getElementById("producto-menu-dia")?.checked);

 if (!nombre || !categoria || !descripcion || isNaN(precio) || precio <= 0) {
    alert("Por favor, completa todos los campos obligatorios y asegúrate de que el precio sea mayor a cero.");
    return;
  }

  const producto = normalizarProductoMenuAdmin({
    id: crearIdProductoAdmin(nombre),
    categoria,
    nombre,
    descripcion,
    variantes: [{ nombre: "Unico", precio }],
    opciones: ["Preparacion normal", "Sin aji"],
    imagen,
    paraLlevar,
    disponible: agregarMenuDia,
    creadoEn: new Date().toISOString(),
  });

  const guardadoEnBackend = await guardarProductoEnBackend(producto, agregarMenuDia);
  if (!guardadoEnBackend) {
    const nuevos = leerProductosNuevosAdmin();
    nuevos.push(producto);
    guardarProductosNuevosAdmin(nuevos);

    if (agregarMenuDia) {
      const menuDia = leerMenuDiaAdmin();
      if (!menuDiaAdminConfigurado()) {
        guardarMenuDiaAdmin([...obtenerTodosProductosAdmin().map((item) => item.id), producto.id]);
      } else {
        menuDia.push(producto.id);
        guardarMenuDiaAdmin(menuDia);
      }
    }
  }

  event.target.reset();
  const checkLlevar = document.getElementById("producto-para-llevar");
  const checkMenuDia = document.getElementById("producto-menu-dia");
  if (checkLlevar) checkLlevar.checked = true;
  if (checkMenuDia) checkMenuDia.checked = true;

  await cargarYPintarProductosAdmin();
  alert("Producto registrado correctamente.");
}

function configurarEventosMenuAdmin() {
  document.getElementById("form-producto-admin")?.addEventListener("submit", registrarProductoAdmin);
  document.getElementById("buscar-producto-admin")?.addEventListener("input", pintarProductosAdmin);
  document.getElementById("filtro-categoria-admin")?.addEventListener("change", pintarProductosAdmin);
}

async function cargarProductosDesdeBackend() {
  try {
    const data = await apiJson("/admin/productos");
    return data.data || [];
  } catch (error) {
    console.log("Backend no disponible, usando productos locales", error);
    return null;
  }
}

async function cargarYPintarProductosAdmin() {
  const productos = await cargarProductosDesdeBackend();
  
  if (productos && productos.length > 0) {
    usandoBackendMenuAdmin = true;
    todosProductosAdmin = productos.map((producto) => {
      const idReal = producto.codigo_producto || producto.id_producto;
      
      return normalizarProductoMenuAdmin({
        ...producto,
        id: idReal,
        codigo_producto: idReal,
        esBackendAdmin: true,
        disponible: producto.disponible_local !== undefined ? Boolean(producto.disponible_local) : (producto.activo === true && producto.stock > 0),
        disponibleLocal: producto.disponible_local !== undefined ? Boolean(producto.disponible_local) : (producto.activo === true && producto.stock > 0),
        paraLlevar: producto.disponible_llevar !== false,
        esNuevoAdmin: false
      });
    });
  } else {
    usandoBackendMenuAdmin = false;
  }
  
  pintarProductosAdmin();
}

async function guardarProductoEnBackend(producto, agregarMenuDia) {
  try {
    const result = await apiJson("/admin/productos", {
      method: "POST",
      body: JSON.stringify({
        nombre: producto.nombre,
        categoria: producto.categoria,
        precio: Number(producto.variantes?.[0]?.precio || producto.precio || 0),
        descripcion: producto.descripcion,
        imagen: producto.imagen,
        para_llevar: producto.paraLlevar,
        disponible_llevar: producto.paraLlevar,
        disponible_local: agregarMenuDia,
        disponible: agregarMenuDia,
        en_menu_dia: agregarMenuDia,
        codigo_producto: producto.id 
      }),
    });
    
    if (result.ok) {
      usandoBackendMenuAdmin = true;
      await cargarYPintarProductosAdmin();
      return true;
    }
    return false;
  } catch (error) {
    console.log("Backend no disponible, guardando localmente", error);
    return false;
  }
}

async function actualizarDisponibilidadProductoBackend(id, disponible) {
  console.log('Enviando ID al backend (sin limpiar):', id);
  await apiJson(`/admin/productos/${encodeURIComponent(id)}/disponibilidad`, {
    method: "PATCH",
    body: JSON.stringify({ disponible }),
  });
}

async function actualizarLlevarProductoBackend(id, disponibleLlevar) {
  await apiJson(`/admin/productos/${encodeURIComponent(id)}/disponible-llevar`, {
    method: "PATCH",
    body: JSON.stringify({ disponible_llevar: disponibleLlevar }),
  });
}

async function alternarProductoLlevarAdmin(id, activo) {
  const producto = obtenerProductoAdminPorId(id);

  if (usandoBackendMenuAdmin && producto?.esBackendAdmin) {
    try {
      const idParaEnviar = producto.codigo_producto || producto.id;
      await actualizarLlevarProductoBackend(idParaEnviar, activo);
      await cargarYPintarProductosAdmin();
      document.dispatchEvent(new CustomEvent('producto:actualizado', { detail: { id, disponible_llevar: activo } }));
    } catch (error) {
      alert(`No se pudo actualizar la disponibilidad para llevar: ${error.message}`);
      await cargarYPintarProductosAdmin();
    }
    return;
  }

  const nuevos = leerProductosNuevosAdmin().map((item) => String(item.id) === String(id) ? { ...item, paraLlevar: activo } : item);
  guardarProductosNuevosAdmin(nuevos);
  pintarProductosAdmin();
}

async function eliminarProductoBackend(id) {
  console.log('Eliminando producto con ID:', id);
  await apiJson(`/admin/productos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function iniciarRefrescoMenuAdmin() {
  if (refrescoMenuAdmin) clearInterval(refrescoMenuAdmin);
  refrescoMenuAdmin = setInterval(() => {
    if (document.hidden) return;
    cargarYPintarProductosAdmin();
  }, 15000);
}

async function iniciarMenuAdmin() {
  sesionMenuAdminActual = protegerRutaAdmin();
  if (!sesionMenuAdminActual) return;
  llenarSelectCategoriasMenuAdmin();
  configurarEventosMenuAdmin();
  await cargarYPintarProductosAdmin();
  iniciarRefrescoMenuAdmin();
}
function iniciarEscuchaEventosMenuAdmin() {
  realTime.connect();

  realTime.on('producto:actualizado', () => {
    cargarYPintarProductosAdmin();
  });
}

async function iniciarMenuAdmin() {
  sesionMenuAdminActual = protegerRutaAdmin();
  if (!sesionMenuAdminActual) return;
  llenarSelectCategoriasMenuAdmin();
  configurarEventosMenuAdmin();
  await cargarYPintarProductosAdmin();
  iniciarRefrescoMenuAdmin();
  iniciarEscuchaEventosMenuAdmin();
}
document.addEventListener("DOMContentLoaded", iniciarMenuAdmin);
