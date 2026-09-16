if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error("Acceso bloqueado.");
const API_FACT = window.MENUGO_API || "http://localhost:4000/api";
function eF(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function sF(v) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}
async function cargarComprobantes(tipo = "") {
  try {
    const r = await fetch(
      `${API_FACT}/cajero/comprobantes${tipo ? `?tipo=${encodeURIComponent(tipo)}` : ""}`,
      { headers: headersAutenticadosPersonal("cajero") },
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.message || "Error");
    const c = document.getElementById("lista-comprobantes");
    const rows = d.data || [];
    c.innerHTML = rows.length
      ? rows
          .map(
            (x) =>
              `<article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div class="flex justify-between gap-3"><div><p class="text-xs font-black uppercase text-orange-600">${eF(x.tipo_comprobante)}</p><h2 class="mt-1 text-xl font-black">Comprobante #${x.id_comprobante}</h2></div><strong class="text-emerald-600">${sF(x.monto)}</strong></div><div class="mt-4 space-y-1 text-sm"><p><strong>Pago:</strong> #${x.id_pago}</p><p><strong>Documento:</strong> ${eF(x.dni || x.ruc || "-")}</p>${x.razon_social ? `<p><strong>Razon social:</strong> ${eF(x.razon_social)}</p>` : ""}<p><strong>Metodo:</strong> ${eF(x.metodo_pago)}</p><p><strong>Fecha:</strong> ${new Date(x.fecha_emision).toLocaleString("es-PE")}</p><p><strong>Cajero:</strong> ${eF(x.cajero_nombre || "Pago digital/previo")}</p></div></article>`,
          )
          .join("")
      : '<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">No hay comprobantes.</div>';
  } catch (err) {
    alert(err.message);
  }
}
document.addEventListener("DOMContentLoaded", () => cargarComprobantes(""));
