let chartVentas = null;
let chartPlatos = null;
let refrescoDashboardAdmin = null;
let filtroFechaInicio = null;
let filtroFechaFin = null;

function solesAdmin(valor) {
  return Number(valor || 0).toFixed(2);
}

function escapeHtmlAdmin(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaLocalISOAdmin(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function obtenerInicioSemana(fecha = new Date()) {
  const d = new Date(fecha);
  const dia = d.getDay();
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function obtenerFinSemana(fecha = new Date()) {
  const d = obtenerInicioSemana(fecha);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatearFechaInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function obtenerRangoSemanaActual() {
  const hoy = new Date();
  const inicio = obtenerInicioSemana(hoy);
  const fin = obtenerFinSemana(hoy);
  return {
    inicio: formatearFechaInput(inicio),
    fin: formatearFechaInput(fin)
  };
}

function obtenerRangoMesActual() {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return {
    inicio: formatearFechaInput(inicio),
    fin: formatearFechaInput(fin)
  };
}

async function cargarRankingConFiltros(fechaDesde = null, fechaHasta = null) {
  try {
    let url = '/admin/platos/mas-vendidos';
    const params = new URLSearchParams();
    
    if (fechaDesde && fechaHasta) {
      params.append('fecha_desde', fechaDesde);
      params.append('fecha_hasta', fechaHasta);
    }
    
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const data = await apiAdminDashboard(url);
    const ranking = data.data || [];

    const contenedor = document.getElementById("ranking-platos");
    if (contenedor) {
      if (ranking.length === 0) {
        contenedor.innerHTML = `<p class="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay productos pagados en el periodo seleccionado.</p>`;
      } else {
        contenedor.innerHTML = ranking.slice(0, 5).map((item, index) => `
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <p class="text-sm font-black text-slate-900">${index + 1}. ${escapeHtmlAdmin(item.nombre)}</p>
              <p class="text-xs font-semibold text-slate-500">Total: S/ ${solesAdmin(item.total)}</p>
            </div>
            <span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">${item.cantidad} und.</span>
          </div>
        `).join("");
      }
    }

    const canvas = document.getElementById("grafica-platos");
    if (!canvas || typeof Chart === "undefined") return;
    const ctx = canvas.getContext("2d");

    if (chartPlatos) chartPlatos.destroy();

    const topPlatos = ranking.slice(0, 5);
    if (topPlatos.length > 0) {
      chartPlatos = new Chart(ctx, {
        type: "bar",
        data: {
          labels: topPlatos.map((p) => p.nombre.length > 15 ? p.nombre.substring(0, 12) + "..." : p.nombre),
          datasets: [{
            label: "Cantidad vendida",
            data: topPlatos.map((p) => p.cantidad),
            backgroundColor: "#f97316"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { 
            y: { 
              beginAtZero: true, 
              ticks: { stepSize: 1 } 
            }
          },
          plugins: {
            legend: {
              labels: {
                font: { weight: 'bold' }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error("Error cargando ranking con filtros:", error);
  }
}

async function cargarRankingPorSemana() {
  const semana = obtenerRangoSemanaActual();
  await cargarRankingConFiltros(semana.inicio, semana.fin);
}

async function cargarRankingPorMes() {
  const mes = obtenerRangoMesActual();
  await cargarRankingConFiltros(mes.inicio, mes.fin);
}

async function cargarRankingPorFecha() {
  const fechaDesde = document.getElementById('fecha-desde-ranking')?.value;
  const fechaHasta = document.getElementById('fecha-hasta-ranking')?.value;
  
  if (!fechaDesde || !fechaHasta) {
    alert('Por favor selecciona ambas fechas');
    return;
  }
  
  if (fechaDesde > fechaHasta) {
    alert('La fecha de inicio no puede ser mayor que la fecha de fin');
    return;
  }
  
  await cargarRankingConFiltros(fechaDesde, fechaHasta);
}

async function cargarRanking() {
  if (filtroFechaInicio && filtroFechaFin) {
    await cargarRankingConFiltros(filtroFechaInicio, filtroFechaFin);
  } else {
    const semana = obtenerRangoSemanaActual();
    await cargarRankingConFiltros(semana.inicio, semana.fin);
  }
}

function aplicarFiltroRanking(tipo, valor1 = null, valor2 = null) {
  switch(tipo) {
    case 'semana':
      const semana = obtenerRangoSemanaActual();
      filtroFechaInicio = semana.inicio;
      filtroFechaFin = semana.fin;
      break;
    case 'mes':
      const mes = obtenerRangoMesActual();
      filtroFechaInicio = mes.inicio;
      filtroFechaFin = mes.fin;
      break;
    case 'personalizado':
      filtroFechaInicio = valor1;
      filtroFechaFin = valor2;
      break;
    default:
      const semanaDefault = obtenerRangoSemanaActual();
      filtroFechaInicio = semanaDefault.inicio;
      filtroFechaFin = semanaDefault.fin;
  }
  
  actualizarUIFiltrosRanking(tipo);
  
  cargarRanking();
}

function actualizarUIFiltrosRanking(tipoActivo) {
  const botones = document.querySelectorAll('.filtro-ranking-btn');
  botones.forEach(btn => {
    const tipo = btn.dataset.tipo;
    if (tipo === tipoActivo) {
      btn.classList.add('bg-slate-950', 'text-white');
      btn.classList.remove('border', 'border-slate-200', 'bg-white', 'text-slate-700');
    } else {
      btn.classList.remove('bg-slate-950', 'text-white');
      btn.classList.add('border', 'border-slate-200', 'bg-white', 'text-slate-700');
    }
  });
  
  const fechaContainer = document.getElementById('filtro-fecha-personalizado');
  
  if (fechaContainer) {
    fechaContainer.style.display = tipoActivo === 'personalizado' ? 'block' : 'none';
  }
}

function iniciarDashboard() {
  const sesion = typeof protegerRutaAdmin === "function" ? protegerRutaAdmin() : null;
  if (typeof protegerRutaAdmin === "function" && !sesion) return;

  const nombre = document.getElementById("admin-nombre");
  if (nombre && sesion?.nombre) nombre.textContent = sesion.nombre;

  const fechaInput = document.getElementById("fecha-reporte");
  if (fechaInput && !fechaInput.value) fechaInput.value = fechaLocalISOAdmin();

  cargarDashboard();
  cargarGrafica();
  
  const semana = obtenerRangoSemanaActual();
  cargarRankingConFiltros(semana.inicio, semana.fin);

  const select = document.getElementById("rango-grafica-ventas");
  if (select) select.addEventListener("change", () => cargarGrafica());

  document.getElementById("form-reporte-ventas")?.addEventListener("submit", cargarReporteVentas);
  iniciarRefrescoDashboardAdmin();
}

function iniciarRefrescoDashboardAdmin() {
  if (refrescoDashboardAdmin) clearInterval(refrescoDashboardAdmin);
  refrescoDashboardAdmin = setInterval(() => {
    if (document.hidden) return;
    cargarDashboard();
    cargarGrafica();
    if (filtroFechaInicio && filtroFechaFin) {
      cargarRankingConFiltros(filtroFechaInicio, filtroFechaFin);
    } else {
      const semana = obtenerRangoSemanaActual();
      cargarRankingConFiltros(semana.inicio, semana.fin);
    }
    if (document.getElementById("fecha-reporte")?.value) cargarReporteVentas();
  }, 15000);
}
async function apiAdminDashboard(url, options = {}) {
  if (typeof apiJson === "function") return apiJson(url, options);
  const base = window.MENUGO_API || "http://localhost:4000/api";
  const response = await fetch(`${base}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDashboard() {
  try {
    const data = await apiAdminDashboard("/admin/dashboard");

    if (data.ok && data.data) {
      document.getElementById("stat-ventas-hoy").textContent = solesAdmin(data.data.ventas_hoy || 0);
      document.getElementById("stat-pedidos-hoy").textContent = data.data.pedidos_hoy || 0;
      document.getElementById("stat-ticket-promedio").textContent = solesAdmin(data.data.ticket_promedio || 0);
      document.getElementById("stat-plato-lider").textContent = data.data.plato_lider || "Sin datos";
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error cargando dashboard:", error);
    return false;
  }
}

async function cargarGrafica() {
  const dias = document.getElementById("rango-grafica-ventas")?.value || 7;
  try {
    const data = await apiAdminDashboard(`/admin/ventas/grafica?dias=${encodeURIComponent(dias)}`);

    if (data.ok && data.labels && data.valores) {
      const canvas = document.getElementById("grafica-ventas");
      if (!canvas || typeof Chart === "undefined") return;
      const ctx = canvas.getContext("2d");

      if (chartVentas) chartVentas.destroy();

      chartVentas = new Chart(ctx, {
        type: "line",
        data: {
          labels: data.labels,
          datasets: [{
            label: "Ventas (S/)",
            data: data.valores,
            borderColor: "#f97316",
            backgroundColor: "rgba(249, 115, 22, 0.1)",
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  } catch (error) {
    console.error("Error cargando grafica:", error);
  }
}

async function cargarRanking() {
  try {
    const data = await apiAdminDashboard("/admin/platos/mas-vendidos");
    const ranking = data.data || [];

    const contenedor = document.getElementById("ranking-platos");
    if (contenedor) {
      if (ranking.length === 0) {
        contenedor.innerHTML = `<p class="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay productos pagados.</p>`;
      } else {
        contenedor.innerHTML = ranking.slice(0, 5).map((item, index) => `
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <p class="text-sm font-black text-slate-900">${index + 1}. ${escapeHtmlAdmin(item.nombre)}</p>
              <p class="text-xs font-semibold text-slate-500">Total: S/ ${solesAdmin(item.total)}</p>
            </div>
            <span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">${item.cantidad} und.</span>
          </div>
        `).join("");
      }
    }

    const canvas = document.getElementById("grafica-platos");
    if (!canvas || typeof Chart === "undefined") return;
    const ctx = canvas.getContext("2d");

    if (chartPlatos) chartPlatos.destroy();

    const topPlatos = ranking.slice(0, 5);
    if (topPlatos.length > 0) {
      chartPlatos = new Chart(ctx, {
        type: "bar",
        data: {
          labels: topPlatos.map((p) => p.nombre.length > 15 ? p.nombre.substring(0, 12) + "..." : p.nombre),
          datasets: [{
            label: "Cantidad vendida",
            data: topPlatos.map((p) => p.cantidad),
            backgroundColor: "#f97316"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  } catch (error) {
    console.error("Error cargando ranking:", error);
  }
}

function pintarReporteVentas(data) {
  const origen = document.getElementById("origen-reporte");
  const resultado = document.getElementById("resultado-reporte");
  if (!resultado) return;

  if (origen) origen.textContent = `Reporte consultado para ${data.fecha || document.getElementById("fecha-reporte")?.value || "la fecha seleccionada"}.`;

  const detalles = Array.isArray(data.detalles) ? data.detalles : [];
  const filas = detalles.length > 0
    ? detalles.map((item) => `
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2">
        <span class="text-sm font-semibold">${escapeHtmlAdmin(item.nombre)}</span>
        <span class="whitespace-nowrap font-black text-slate-900">${Number(item.cantidad || 0)} und. · S/ ${solesAdmin(item.total)}</span>
      </div>
    `).join("")
    : `<p class="mt-3 rounded-2xl bg-white p-3 text-slate-500">No hay productos pagados en esta fecha.</p>`;

  resultado.innerHTML = `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="rounded-2xl bg-white p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Total vendido</p>
        <p class="mt-1 text-2xl font-black text-emerald-600">S/ ${solesAdmin(data.total)}</p>
      </div>
      <div class="rounded-2xl bg-white p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Pedidos/Pagos</p>
        <p class="mt-1 text-2xl font-black text-orange-600">${Number(data.pedidos || 0)} / ${Number(data.pagos || 0)}</p>
      </div>
      <div class="rounded-2xl bg-white p-4">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">Ticket promedio</p>
        <p class="mt-1 text-2xl font-black text-blue-600">S/ ${solesAdmin(data.ticket_promedio)}</p>
      </div>
    </div>
    <div class="mt-4 rounded-2xl bg-white p-4">
      <p class="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Detalle vendido</p>
      ${filas}
    </div>`;
}

async function cargarReporteVentas(event) {
  if (event) event.preventDefault();
  const fechaInput = document.getElementById("fecha-reporte");
  const resultado = document.getElementById("resultado-reporte");
  const fecha = fechaInput?.value || fechaLocalISOAdmin();

  if (fechaInput && !fechaInput.value) fechaInput.value = fecha;
  if (resultado) resultado.innerHTML = "Consultando ventas en la base de datos...";

  try {
    const data = await apiAdminDashboard(`/admin/ventas/reporte?fecha=${encodeURIComponent(fecha)}`);
    pintarReporteVentas(data);
  } catch (error) {
    if (resultado) {
      resultado.innerHTML = `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">No se pudo consultar el reporte: ${escapeHtmlAdmin(error.message)}</div>`;
    }
  }
}

async function cargarDatosDemoAdmin() {
  const fechaInput = document.getElementById("fecha-reporte");
  if (fechaInput && !fechaInput.value) fechaInput.value = fechaLocalISOAdmin();
  await cargarReporteVentas();
}

function iniciarRefrescoDashboardAdmin() {
  if (refrescoDashboardAdmin) clearInterval(refrescoDashboardAdmin);
  refrescoDashboardAdmin = setInterval(() => {
    if (document.hidden) return;
    cargarDashboard();
    cargarGrafica();
    if (filtroFechaInicio && filtroFechaFin) {
      cargarRankingConFiltros(filtroFechaInicio, filtroFechaFin);
    } else if (filtroDias) {
      cargarRankingConFiltros(null, null, filtroDias);
    } else {
      cargarRankingConFiltros(null, null, 7);
    }
    if (document.getElementById("fecha-reporte")?.value) cargarReporteVentas();
  }, 15000);
}

function iniciarDashboard() {
  const sesion = typeof protegerRutaAdmin === "function" ? protegerRutaAdmin() : null;
  if (typeof protegerRutaAdmin === "function" && !sesion) return;

  const nombre = document.getElementById("admin-nombre");
  if (nombre && sesion?.nombre) nombre.textContent = sesion.nombre;

  const fechaInput = document.getElementById("fecha-reporte");
  if (fechaInput && !fechaInput.value) fechaInput.value = fechaLocalISOAdmin();

  cargarDashboard();
  cargarGrafica();
  
  cargarRankingConFiltros(null, null, 7);

  const select = document.getElementById("rango-grafica-ventas");
  if (select) select.addEventListener("change", () => cargarGrafica());

  document.getElementById("form-reporte-ventas")?.addEventListener("submit", cargarReporteVentas);
  iniciarRefrescoDashboardAdmin();
}
function iniciarEscuchaEventosAdmin() {
  realTime.connect();

  const handleActualizacion = () => {
    cargarDashboard();
    cargarGrafica();
    cargarRanking();
  };

  realTime.on('pedido:creado', handleActualizacion);
  realTime.on('pedido:actualizado', handleActualizacion);
  realTime.on('pago:registrado', handleActualizacion);
}

function iniciarDashboard() {
  const sesion = typeof protegerRutaAdmin === "function" ? protegerRutaAdmin() : null;
  if (typeof protegerRutaAdmin === "function" && !sesion) return;

  const nombre = document.getElementById("admin-nombre");
  if (nombre && sesion?.nombre) nombre.textContent = sesion.nombre;

  const fechaInput = document.getElementById("fecha-reporte");
  if (fechaInput && !fechaInput.value) fechaInput.value = fechaLocalISOAdmin();

  cargarDashboard();
  cargarGrafica();
  
  const semana = obtenerRangoSemanaActual();
  cargarRankingConFiltros(semana.inicio, semana.fin);

  const select = document.getElementById("rango-grafica-ventas");
  if (select) select.addEventListener("change", () => cargarGrafica());

  document.getElementById("form-reporte-ventas")?.addEventListener("submit", cargarReporteVentas);
  iniciarRefrescoDashboardAdmin();
  iniciarEscuchaEventosAdmin();
}
document.addEventListener("DOMContentLoaded", iniciarDashboard);
