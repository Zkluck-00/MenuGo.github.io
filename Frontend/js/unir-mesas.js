if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
// MenuGo - union de mesas conectada a PostgreSQL.
// Ya no usa localStorage como fuente principal; muestra las mismas mesas que devuelve el backend.

const API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let mesasUnir = [];
let gruposUnir = [];

function solesUnir(valor) { return Number(valor || 0).toFixed(2); }
function escapeHtmlUnir(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDatosUnir() {
  const [mesas, uniones] = await Promise.all([apiJson("/mesas"), apiJson("/mesas/uniones")]);
  mesasUnir = mesas.data || [];
  gruposUnir = uniones.data || [];
}

function claseEstadoUnir(estado) {
  if (estado === "libre") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (estado === "ocupada") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (estado === "pagada") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (estado === "limpieza") return "bg-purple-100 text-purple-700 ring-purple-200";
  if (estado === "unida") return "bg-slate-200 text-slate-800 ring-slate-300";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function textoEstadoUnir(estado) {
  return ({ libre: "Libre", ocupada: "Ocupada", pagada: "Pagada", limpieza: "En limpieza", unida: "Unida" })[estado] || "Sin estado";
}

function mesaDisponibleParaUnion(mesa) {
  return mesa.estado !== "limpieza" && mesa.estado !== "unida";
}

function numeroMesa(mesa) { return Number(mesa.numero_mesa || mesa.numero); }

function renderFormularioUnir() {
  const select = document.getElementById("mesa-principal");
  if (!select) return;
  const elegibles = mesasUnir.filter(mesaDisponibleParaUnion);
  select.innerHTML = elegibles.length
    ? elegibles.map((mesa) => `<option value="${numeroMesa(mesa)}">Mesa ${numeroMesa(mesa)} - ${textoEstadoUnir(mesa.estado)}</option>`).join("")
    : `<option value="">No hay mesas disponibles</option>`;
  renderOpcionesMesasSecundarias();
}

function renderOpcionesMesasSecundarias() {
  const principal = Number(document.getElementById("mesa-principal")?.value || 0);
  const contenedor = document.getElementById("mesas-secundarias");
  if (!contenedor) return;
  const mesas = mesasUnir.filter((mesa) => numeroMesa(mesa) !== principal && mesaDisponibleParaUnion(mesa));
  if (!mesas.length) {
    contenedor.innerHTML = `<p class="col-span-full p-3 text-center text-sm font-bold text-slate-500">No hay mesas secundarias disponibles.</p>`;
    return;
  }
  
  contenedor.innerHTML = mesas.map((mesa) => {
    const estadoClase = 
      mesa.estado === "libre" ? "bg-emerald-50 border-emerald-200" :
      mesa.estado === "ocupada" ? "bg-orange-50 border-orange-200" :
      "bg-slate-50 border-slate-200";
    const textoEstado = textoEstadoUnir(mesa.estado);
    return `
      <label class="cursor-pointer rounded-2xl border-2 p-3 transition-all hover:shadow-md ${estadoClase}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <input type="checkbox" class="mesa-secundaria h-5 w-5 accent-orange-500" value="${numeroMesa(mesa)}">
            <span class="text-lg font-black text-slate-950">Mesa ${numeroMesa(mesa)}</span>
          </div>
          <span class="rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${claseEstadoUnir(mesa.estado)}">${textoEstado}</span>
        </div>
        ${mesa.nota ? `<p class="mt-2 text-xs font-semibold text-slate-500">${escapeHtmlUnir(mesa.nota)}</p>` : ""}
      </label>`;
  }).join("");
}

function renderResumenMesasUnir() {
  const contenedor = document.getElementById("resumen-mesas-unir");
  if (!contenedor) return;
  contenedor.innerHTML = mesasUnir.map((mesa) => `<article class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="flex items-center justify-between gap-2"><p class="text-lg font-black text-slate-950">Mesa ${numeroMesa(mesa)}</p><span class="rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${claseEstadoUnir(mesa.estado)}">${textoEstadoUnir(mesa.estado)}</span></div><p class="mt-2 text-xs font-semibold text-slate-500">${escapeHtmlUnir(mesa.nota || mesa.grupo?.nombre || "Sin grupo")}</p><p class="mt-1 text-xs font-black text-slate-950">Pendiente: S/ ${solesUnir(mesa.pendiente)}</p></article>`).join("");
}

function renderGruposActivos() {
  const contenedor = document.getElementById("grupos-activos");
  if (!contenedor) return;
  if (!gruposUnir.length) {
    contenedor.innerHTML = `<div class="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center font-bold text-slate-500"> No hay grupos activos. Crea uno arriba.</div>`;
    return;
  }
  
  contenedor.innerHTML = gruposUnir.map((grupo) => `
    <div class="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-md transition hover:shadow-lg">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <span class="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">Grupo</span>
            <h3 class="text-xl font-black text-slate-950">${escapeHtmlUnir(grupo.nombre || grupo.nombre_grupo)}</h3>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            ${(grupo.mesas || []).map((m) => `<span class="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">Mesa ${m}</span>`).join("")}
          </div>
          <p class="mt-2 text-xs font-semibold text-slate-500">Principal: Mesa ${escapeHtmlUnir(grupo.mesa_principal)}</p>
        </div>
        <button type="button" onclick="desunirGrupo('${escapeHtmlUnir(String(grupo.id || grupo.id_grupo_mesa || grupo.mesa_principal))}')" 
          class="rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-100 hover:shadow-md">
           Desunir
        </button>
      </div>
    </div>`).join("");
}

async function crearUnionMesas(event) {
  event.preventDefault();
  const principal = Number(document.getElementById("mesa-principal")?.value || 0);
  const secundarias = Array.from(document.querySelectorAll(".mesa-secundaria:checked")).map((input) => Number(input.value)).filter((n) => n && n !== principal);
  if (!principal || secundarias.length === 0) return alert("Selecciona una mesa principal y al menos una mesa secundaria.");
  if (!confirm(`¿Unir mesa ${principal} con ${secundarias.join(", ")}?`)) return;
  try {
    const data = await apiJson("/mesas/unir", { method: "POST", body: JSON.stringify({ mesa_principal: principal, mesas_a_unir: secundarias }) });
    alert(data.message || "Mesas unidas correctamente.");
    await iniciarUnirMesas();
  } catch (error) {
    alert(`No se pudo unir mesas: ${error.message}`);
  }
}

async function desunirGrupo(id) {
  if (!confirm("¿Desunir este grupo de mesas?")) return;
  try {
    const data = await apiJson(`/mesas/unir/${encodeURIComponent(id)}`, { method: "DELETE" });
    alert(data.message || "Mesas desunidas.");
    await iniciarUnirMesas();
  } catch (error) {
    alert(`No se pudo desunir: ${error.message}`);
  }
}

async function recargarUniones() {
  await iniciarUnirMesas();
}

async function iniciarUnirMesas() {
  try {
    await cargarDatosUnir();
    renderFormularioUnir();
    renderResumenMesasUnir();
    renderGruposActivos();
  } catch (error) {
    const resumen = document.getElementById("resumen-mesas-unir");
    if (resumen) resumen.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar mesas</h2><p class="mt-2 text-sm font-semibold">${escapeHtmlUnir(error.message)}</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("form-unir-mesas")?.addEventListener("submit", crearUnionMesas);
  iniciarUnirMesas();
  setInterval(() => {
    if (!document.hidden) iniciarUnirMesas();
  }, 15000);
});
