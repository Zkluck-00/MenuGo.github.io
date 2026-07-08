// MenuGo - gestion administrativa de trabajadores

const ADMIN_TRABAJADORES_KEY = "menugo_admin_trabajadores";
let sesionTrabajadoresAdmin = null;
let todosTrabajadoresAdmin = []; 
function apiJson(url, options = {}) {
  return fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  }).then(res => res.json());
}
function leerTrabajadoresAdmin() {
  try {
    const datos = JSON.parse(localStorage.getItem(ADMIN_TRABAJADORES_KEY) || "[]");
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.error("No se pudieron leer los trabajadores", error);
    return [];
  }
}

function guardarTrabajadoresAdmin(trabajadores) {
  localStorage.setItem(ADMIN_TRABAJADORES_KEY, JSON.stringify(trabajadores));
}

function escapeHtmlTrabajadorAdmin(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarTrabajadorAdmin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function limpiarSoloNumerosAdmin(valor, max = 20) {
  return String(valor || "").replace(/\D/g, "").slice(0, max);
}

function formatearFechaTrabajadorAdmin(fecha) {
  if (!fecha) return "Sin fecha final";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return fecha;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function contratoVenceProntoAdmin(trabajador) {
  if (!trabajador.fechaFin || trabajador.estado !== "Activo") return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fin = new Date(`${trabajador.fechaFin}T00:00:00`);
  if (Number.isNaN(fin.getTime())) return false;
  const diferenciaDias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
  return diferenciaDias >= 0 && diferenciaDias <= 30;
}

function actualizarEstadisticasTrabajadoresAdmin() {
  const trabajadores = todosTrabajadoresAdmin.length > 0 ? todosTrabajadoresAdmin : leerTrabajadoresAdmin();
  const activos = trabajadores.filter((trabajador) => trabajador.estado === "Activo").length;
  const vencen = trabajadores.filter(contratoVenceProntoAdmin).length;
  const indefinidos = trabajadores.filter((trabajador) => !trabajador.fechaFin).length;

  const totalEl = document.getElementById("stat-total-trabajadores");
  const activosEl = document.getElementById("stat-trabajadores-activos");
  const vencenEl = document.getElementById("stat-contratos-vencen");
  const indefinidosEl = document.getElementById("stat-contratos-indefinidos");

  if (totalEl) totalEl.textContent = String(trabajadores.length);
  if (activosEl) activosEl.textContent = String(activos);
  if (vencenEl) vencenEl.textContent = String(vencen);
  if (indefinidosEl) indefinidosEl.textContent = String(indefinidos);
}

function obtenerTrabajadoresFiltradosAdmin() {
  const busqueda = normalizarTrabajadorAdmin(document.getElementById("buscar-trabajador-admin")?.value);
  const rol = document.getElementById("filtro-rol-trabajador")?.value || "todos";

  const trabajadores = todosTrabajadoresAdmin.length > 0 ? todosTrabajadoresAdmin : leerTrabajadoresAdmin();

  return trabajadores.filter((trabajador) => {
    const texto = `${trabajador.nombres} ${trabajador.apellidos} ${trabajador.documento} ${trabajador.telefono} ${trabajador.correo} ${trabajador.rol}`.toLowerCase();
    const coincideBusqueda = !busqueda || texto.includes(busqueda);
    const coincideRol = rol === "todos" || trabajador.rol === rol;
    return coincideBusqueda && coincideRol;
  });
}

function pintarTrabajadoresAdmin() {
  const contenedor = document.getElementById("lista-trabajadores-admin");
  if (!contenedor) return;

  const trabajadores = obtenerTrabajadoresFiltradosAdmin();
  
  if (trabajadores.length === 0) {
    contenedor.innerHTML = `
      <div class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p class="text-lg font-black text-slate-800">No hay trabajadores para mostrar</p>
        <p class="mt-1 text-sm font-semibold text-slate-500">Registra un trabajador o cambia los filtros de búsqueda.</p>
      </div>`;
    actualizarEstadisticasTrabajadoresAdmin();
    return;
  }

  contenedor.innerHTML = trabajadores.map((trabajador) => {
    const alerta = contratoVenceProntoAdmin(trabajador)
      ? `<span class="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-700">Contrato por vencer</span>`
      : "";
    const estadoClase = trabajador.estado === "Activo"
      ? "bg-emerald-100 text-emerald-700"
      : trabajador.estado === "Suspendido"
        ? "bg-orange-100 text-orange-700"
        : "bg-slate-200 text-slate-700";

    return `
      <article class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-black text-slate-950">${escapeHtmlTrabajadorAdmin(trabajador.nombres)} ${escapeHtmlTrabajadorAdmin(trabajador.apellidos)}</h3>
              <span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">${escapeHtmlTrabajadorAdmin(trabajador.rol)}</span>
              <span class="rounded-full px-2.5 py-1 text-xs font-black ${estadoClase}">${trabajador.estado}</span>
              ${alerta}
            </div>
            <p class="mt-1 text-sm font-semibold text-slate-500">Documento: ${escapeHtmlTrabajadorAdmin(trabajador.documento)} | Teléfono: ${escapeHtmlTrabajadorAdmin(trabajador.telefono || "No registrado")}</p>
            <p class="mt-1 text-sm font-semibold text-slate-500">Correo de acceso: ${escapeHtmlTrabajadorAdmin(trabajador.correo || "No registrado")}</p>
            <p class="mt-1 text-xs font-black ${trabajador.tiene_credencial ? 'text-emerald-700' : 'text-red-600'}">${trabajador.tiene_credencial ? 'Credencial creada' : 'Sin credencial de acceso'}</p>
            <p class="mt-1 text-sm font-semibold text-slate-500">Contrato: ${formatearFechaTrabajadorAdmin(trabajador.fechaInicio)} - ${formatearFechaTrabajadorAdmin(trabajador.fechaFin)}</p>
            ${trabajador.observaciones ? `<p class="mt-2 text-sm text-slate-600">${escapeHtmlTrabajadorAdmin(trabajador.observaciones)}</p>` : ""}
          </div>

          <div class="flex flex-col gap-2 sm:flex-row">
            <button type="button" onclick="editarTrabajadorAdmin('${escapeHtmlTrabajadorAdmin(trabajador.idtrabajador)}')" class="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
              Editar
            </button>
            <button type="button" onclick="eliminarTrabajadorAdmin('${escapeHtmlTrabajadorAdmin(trabajador.idtrabajador)}')" class="rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white hover:bg-red-600">
              Eliminar
            </button>
          </div>
        </div>
      </article>`;
  }).join("");

  actualizarEstadisticasTrabajadoresAdmin();
}

function leerFormularioTrabajadorAdmin() {
  const estadoSeleccionado = document.getElementById("trabajador-estado")?.value || "Activo";
  console.log('Estado seleccionado en el formulario:', estadoSeleccionado);
  return {
    id: document.getElementById("trabajador-id")?.value || `TRAB-${Date.now()}`,
    nombres: document.getElementById("trabajador-nombres")?.value.trim() || "",
    apellidos: document.getElementById("trabajador-apellidos")?.value.trim() || "",
    documento: limpiarSoloNumerosAdmin(document.getElementById("trabajador-documento")?.value, 12),
    telefono: limpiarSoloNumerosAdmin(document.getElementById("trabajador-telefono")?.value, 9),
    correo: document.getElementById("trabajador-correo")?.value.trim() || "",
    password: document.getElementById("trabajador-password")?.value || "",
    rol: document.getElementById("trabajador-rol")?.value || "Mesero",
    estado: estadoSeleccionado,
    fechaInicio: document.getElementById("trabajador-fecha-inicio")?.value || "",
    fechaFin: document.getElementById("trabajador-fecha-fin")?.value || "",
    observaciones: document.getElementById("trabajador-observaciones")?.value.trim() || "",
    actualizadoEn: new Date().toISOString(),
  };
}

function validarTrabajadorAdmin(trabajador) {
  if (!trabajador.nombres || !trabajador.apellidos || !trabajador.documento || !trabajador.fechaInicio) {
    throw new Error("Completa nombres, apellidos, documento e inicio de contrato.");
  }

  if (!trabajador.correo) {
    throw new Error("El correo de acceso es obligatorio.");
  }

  const esEdicion = Boolean(document.getElementById("trabajador-id")?.value);
  if (!esEdicion && !trabajador.password) {
    throw new Error("La contraseña de acceso es obligatoria para un trabajador nuevo.");
  }

  if (trabajador.password && trabajador.password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }

  if (trabajador.documento.length !== 8) {
    throw new Error("El documento debe tener exactamente 8 números.");
  }

  if (trabajador.telefono && trabajador.telefono.length !== 9) {
    throw new Error("El teléfono debe tener exactamente  9 números.");
  }

  if (trabajador.fechaFin && trabajador.fechaFin < trabajador.fechaInicio) {
    throw new Error("La fecha de fin no puede ser menor que la fecha de inicio.");
  }
}

async function guardarTrabajadorDesdeFormularioAdmin(event) {
  event.preventDefault();

  try {
    const trabajador = leerFormularioTrabajadorAdmin();
    validarTrabajadorAdmin(trabajador);
let estadoEnviar = 'Inactivo';
if (trabajador.estado === 'Activo') {
  estadoEnviar = 'Activo';
} else if (trabajador.estado === 'Suspendido') {
  estadoEnviar = 'Suspendido';
} else {
  estadoEnviar = 'Inactivo';
}
console.log('Estado a enviar a BD:', estadoEnviar);
console.log('Estado a enviar a BD:', estadoEnviar);
    const id = document.getElementById("trabajador-id")?.value;
    
    let url = `${API_BASE}/admin/trabajadores`;
    let method = 'POST';
    
    if (id && id !== '' && !id.startsWith('TRAB-')) {
      url = `${API_BASE}/admin/trabajadores/${id}`;
      method = 'PUT';
    }
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombres: trabajador.nombres,
        apellidos: trabajador.apellidos,
        documento: trabajador.documento,
        telefono: trabajador.telefono,
        correo: trabajador.correo || null,
        usuario_acceso: trabajador.correo || null,
        clave_acceso: trabajador.password || "",
        rol: trabajador.rol,
        estado: estadoEnviar,
        fecha_inicio_contrato: trabajador.fechaInicio,
        fecha_fin_contrato: trabajador.fechaFin || null,
        observaciones: trabajador.observaciones || null
      })
    });
    
    const data = await response.json();
    
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || 'Error al guardar');
    }
    
    alert('Trabajador guardado correctamente en la base de datos.');
    limpiarFormularioTrabajadorAdmin();
    await cargarTrabajadoresDesdeBackend();
    generarReporteTrabajadoresAdmin();
    
  } catch (error) {
    console.error('Error guardando trabajador:', error);
    alert('Error al guardar en la base de datos: ' + error.message);
  }
}

function limpiarFormularioTrabajadorAdmin() {
  const form = document.getElementById("form-trabajador-admin");
  if (form) form.reset();

  const id = document.getElementById("trabajador-id");
  const titulo = document.getElementById("titulo-form-trabajador");
  const estado = document.getElementById("trabajador-estado");
  const rol = document.getElementById("trabajador-rol");

  if (id) id.value = "";
  if (titulo) titulo.textContent = "Registrar trabajador";
  if (estado) estado.value = "Activo";
  if (rol) rol.value = "Mesero";
  const password = document.getElementById("trabajador-password");
  if (password) {
    password.value = "";
    password.required = true;
  }
}

async function editarTrabajadorAdmin(id) {
  try {
    const response = await fetch(`${API_BASE}/admin/trabajadores/${id}`);
    const data = await response.json();
    
    if (!data.ok || !data.data) {
      throw new Error('No se pudo cargar el trabajador');
    }
    
    const trabajador = data.data;
    
    document.getElementById("trabajador-id").value = trabajador.idtrabajador;
    document.getElementById("trabajador-nombres").value = trabajador.nombres || "";
    document.getElementById("trabajador-apellidos").value = trabajador.apellidos || "";
    document.getElementById("trabajador-documento").value = trabajador.documento || "";
    document.getElementById("trabajador-telefono").value = trabajador.telefono || "";
    document.getElementById("trabajador-correo").value = trabajador.correo || "";
    const passwordInput = document.getElementById("trabajador-password");
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.required = false;
    }
    document.getElementById("trabajador-rol").value = trabajador.rol || "Mesero";
    
    const estadoValue = trabajador.estado === 'Activo' ? 'Activo' : (trabajador.estado === 'Suspendido' ? 'Suspendido' : 'Inactivo');
    document.getElementById("trabajador-estado").value = estadoValue;
    
    document.getElementById("trabajador-fecha-inicio").value = trabajador.fecha_inicio_contrato || "";
    document.getElementById("trabajador-fecha-fin").value = trabajador.fecha_fin_contrato || "";
    document.getElementById("trabajador-observaciones").value = trabajador.observaciones || "";

    const titulo = document.getElementById("titulo-form-trabajador");
    if (titulo) titulo.textContent = "Editar trabajador";

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error('Error editando trabajador:', error);
    alert('Error al cargar los datos del trabajador: ' + error.message);
  }
}

async function eliminarTrabajadorAdmin(id) {
  const trabajadores = leerTrabajadoresAdmin();
  const trabajador = trabajadores.find((item) => String(item.idtrabajador || item.id) === String(id));
  
  if (!trabajador) return;

  const nombre = `${trabajador.nombres} ${trabajador.apellidos}`.trim();
  if (!confirm(`¿Eliminar a ${nombre}?`)) return;

  try {
    const response = await fetch(`${API_BASE}/admin/trabajadores/${id}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || 'Error al eliminar');
    }
    
    await cargarTrabajadoresDesdeBackend();
    generarReporteTrabajadoresAdmin();
    alert('Trabajador eliminado correctamente.');
  } catch (error) {
    console.error('Error eliminando trabajador:', error);
    alert('Error al eliminar: ' + error.message);
  }
}

function trabajadoresParaReporteAdmin() {
  const estado = document.getElementById("reporte-estado-trabajador")?.value || "todos";
  const desde = document.getElementById("reporte-fecha-desde")?.value || "";
  const hasta = document.getElementById("reporte-fecha-hasta")?.value || "";

  const trabajadores = todosTrabajadoresAdmin.length > 0 ? todosTrabajadoresAdmin : leerTrabajadoresAdmin();

  return trabajadores.filter((trabajador) => {
    const coincideEstado = estado === "todos" || trabajador.estado === estado;
    
    let coincideDesde = true;
    if (desde && trabajador.fechaInicio) {
      const fechaInicioObj = new Date(trabajador.fechaInicio);
      const desdeObj = new Date(desde);
      coincideDesde = fechaInicioObj >= desdeObj;
    }
    
    let coincideHasta = true;
    if (hasta && trabajador.fechaInicio) {
      const fechaInicioObj = new Date(trabajador.fechaInicio);
      const hastaObj = new Date(hasta);
      coincideHasta = fechaInicioObj <= hastaObj;
    }
    
    return coincideEstado && coincideDesde && coincideHasta;
  });
}

function generarReporteTrabajadoresAdmin(event) {
  if (event) event.preventDefault();

  const contenedor = document.getElementById("resultado-reporte-trabajadores");
  if (!contenedor) return;

  const trabajadores = trabajadoresParaReporteAdmin();

  if (trabajadores.length === 0) {
    contenedor.innerHTML = `<p class="text-sm font-bold text-slate-500">No hay trabajadores que coincidan con el reporte solicitado.</p>`;
    return;
  }

  const activos = trabajadores.filter((trabajador) => trabajador.estado === "Activo").length;
  const roles = trabajadores.reduce((mapa, trabajador) => {
    mapa[trabajador.rol] = (mapa[trabajador.rol] || 0) + 1;
    return mapa;
  }, {});

  const formatFecha = (fecha) => {
    if (!fecha) return "Sin fecha";
    const d = new Date(fecha);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  contenedor.innerHTML = `
    <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Total reportado</p>
        <p class="mt-1 text-3xl font-black text-slate-950">${trabajadores.length}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Activos</p>
        <p class="mt-1 text-3xl font-black text-emerald-600">${activos}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Roles</p>
        <p class="mt-1 text-sm font-black text-blue-700">${Object.entries(roles).map(([rol, total]) => `${escapeHtmlTrabajadorAdmin(rol)}: ${total}`).join(" | ")}</p>
      </div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3">Trabajador</th>
            <th class="px-4 py-3">Documento</th>
            <th class="px-4 py-3">Rol</th>
            <th class="px-4 py-3">Estado</th>
            <th class="px-4 py-3">Inicio</th>
            <th class="px-4 py-3">Fin de contrato</th>
          </tr>
        </thead>
        <tbody>
          ${trabajadores.map((trabajador) => `
            <tr class="border-t border-slate-100">
              <td class="px-4 py-3 font-black text-slate-900">${escapeHtmlTrabajadorAdmin(trabajador.nombres)} ${escapeHtmlTrabajadorAdmin(trabajador.apellidos)}</td>
              <td class="px-4 py-3 font-semibold text-slate-600">${escapeHtmlTrabajadorAdmin(trabajador.documento)}</td>
              <td class="px-4 py-3 font-semibold text-slate-600">${escapeHtmlTrabajadorAdmin(trabajador.rol)}</td>
              <td class="px-4 py-3 font-semibold text-slate-600">${escapeHtmlTrabajadorAdmin(trabajador.estado)}</td>
              <td class="px-4 py-3 font-semibold text-slate-600">${formatFecha(trabajador.fechaInicio)}</td>
              <td class="px-4 py-3 font-semibold text-slate-600">${formatFecha(trabajador.fechaFin)}</td>
             </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function configurarEventosTrabajadoresAdmin() {
  document.getElementById("form-trabajador-admin")?.addEventListener("submit", guardarTrabajadorDesdeFormularioAdmin);
  document.getElementById("buscar-trabajador-admin")?.addEventListener("input", pintarTrabajadoresAdmin);
  document.getElementById("filtro-rol-trabajador")?.addEventListener("change", pintarTrabajadoresAdmin);
  document.getElementById("form-reporte-trabajadores")?.addEventListener("submit", generarReporteTrabajadoresAdmin);

  document.getElementById("trabajador-documento")?.addEventListener("input", (event) => {
    event.target.value = limpiarSoloNumerosAdmin(event.target.value, 12);
  });

  document.getElementById("trabajador-telefono")?.addEventListener("input", (event) => {
    event.target.value = limpiarSoloNumerosAdmin(event.target.value, 9);
  });
}

function iniciarTrabajadoresAdmin() {
  sesionTrabajadoresAdmin = protegerRutaAdmin();
  if (!sesionTrabajadoresAdmin) return;
  configurarEventosTrabajadoresAdmin();
cargarTrabajadoresDesdeBackend().then(trabajadores => {
    if (trabajadores && trabajadores.length > 0) {
      pintarTrabajadoresAdmin();
      console.log("Trabajadores cargados desde backend:", trabajadores.length);
    } else {
      pintarTrabajadoresAdmin();
    }
  });

  configurarEventosTrabajadoresAdmin();
  pintarTrabajadoresAdmin();
}
async function cargarTrabajadoresDesdeBackend() {
  try {
    const response = await fetch(`${API_BASE}/admin/trabajadores`);
    const data = await response.json();
    
    if (data.ok && data.data) {
      const trabajadoresConFormato = data.data.map(t => ({
        ...t,
        id: t.idtrabajador,
        idtrabajador: t.idtrabajador,
        fechaInicio: t.fecha_inicio_contrato,
        fechaFin: t.fecha_fin_contrato
      }));
      guardarTrabajadoresAdmin(trabajadoresConFormato);
      todosTrabajadoresAdmin = trabajadoresConFormato;
      console.log("Trabajadores cargados desde backend:", trabajadoresConFormato.length);
      return trabajadoresConFormato;
    } else {
      throw new Error(data.message || 'No se pudieron cargar trabajadores');
    }
  } catch (error) {
    console.error('Error cargando trabajadores desde backend:', error);
    todosTrabajadoresAdmin = leerTrabajadoresAdmin();
    return null;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  iniciarTrabajadoresAdmin();
  setInterval(() => {
    if (!document.hidden) cargarTrabajadoresDesdeBackend().then(() => pintarTrabajadoresAdmin());
  }, 15000);
});
