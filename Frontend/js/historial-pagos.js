if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error("Acceso bloqueado.");
const API_HIST = window.MENUGO_API || "http://localhost:4000/api";
function eH(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function sH(v) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}
async function apiHist(path) {
  const r = await fetch(`${API_HIST}${path}`, {
    headers: headersAutenticadosPersonal("cajero"),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.message || "Error");
  return d;
}
async function cargarHistorialPagos() {
  const q = new URLSearchParams();
  const d = document.getElementById("filtro-desde")?.value;
  const h = document.getElementById("filtro-hasta")?.value;
  const m = document.getElementById("filtro-metodo")?.value;
  if (d) q.set("desde", d);
  if (h) q.set("hasta", h);
  if (m) q.set("metodo", m);
  try {
    const data = await apiHist(`/cajero/pagos?${q}`);
    const t = document.getElementById("tabla-pagos");
    const rows = data.data || [];
    t.innerHTML = rows.length
      ? rows
          .map(
            (p) =>
              `<tr class="border-t"><td class="p-3 font-black">#${p.id_pago}</td><td class="p-3">${new Date(p.fecha_pago).toLocaleString("es-PE")}</td><td class="p-3">${eH(p.nombre_grupo || `Cuenta ${p.id_cuenta}`)}</td><td class="p-3">${eH(p.metodo_pago)}</td><td class="p-3">${eH(p.tipo_comprobante || "-")}</td><td class="p-3">${eH(p.cajero_nombre || "Pago digital/previo")}</td><td class="p-3 text-right font-black text-emerald-700">${sH(p.monto)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="7" class="p-8 text-center font-bold text-slate-500">No hay pagos para los filtros seleccionados.</td></tr>';
  } catch (err) {
    alert(err.message);
  }
}
document.addEventListener("DOMContentLoaded", cargarHistorialPagos);
