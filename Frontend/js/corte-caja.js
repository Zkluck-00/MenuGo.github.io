if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error("Acceso bloqueado.");
const API_CORTE = window.MENUGO_API || "http://localhost:4000/api";
function sC(v) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}
function eC(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
async function apiCorte(path, options = {}) {
  const r = await fetch(`${API_CORTE}${path}`, {
    ...options,
    headers: headersAutenticadosPersonal("cajero", options.headers || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) {
    localStorage.removeItem("menugo_cajero_sesion");
    location.replace("login.html?access=required");
    throw new Error("Sesion vencida");
  }
  if (!r.ok || d.ok === false)
    throw new Error(d.message || "Error de servidor");
  return d;
}
async function cargarCorte() {
  try {
    const [actual, cierres] = await Promise.all([
      apiCorte("/cajero/corte/actual"),
      apiCorte("/cajero/cortes"),
    ]);
    renderCorte(actual.data || {});
    renderCierres(cierres.data || []);
  } catch (err) {
    document.getElementById("resumen-corte").innerHTML =
      `<div class="col-span-full rounded-2xl bg-red-50 p-4 font-bold text-red-700">${eC(err.message)}</div>`;
  }
}
function renderCorte(d) {
  const vals = [
    ["Pagos", d.cantidad_pagos || 0],
    ["Efectivo", sC(d.efectivo)],
    ["Yape", sC(d.yape)],
    ["Plin", sC(d.plin)],
    [
      "Tarjetas",
      sC(Number(d.tarjeta_credito || 0) + Number(d.tarjeta_debito || 0)),
    ],
    ["Total", sC(d.total_general)],
  ];
  document.getElementById("resumen-corte").innerHTML = vals
    .map(
      ([a, b]) =>
        `<article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><p class="text-xs font-black uppercase text-slate-500">${a}</p><p class="mt-2 text-2xl font-black">${b}</p></article>`,
    )
    .join("");
}
function renderCierres(lista) {
  const c = document.getElementById("historial-cortes");
  if (!lista.length) {
    c.innerHTML =
      '<p class="font-semibold text-slate-500">Aun no tienes cierres registrados.</p>';
    return;
  }
  c.innerHTML = lista
    .map(
      (x) =>
        `<article class="rounded-2xl border border-slate-200 p-4"><div class="flex flex-wrap justify-between gap-3"><div><strong>Cierre #${x.id_cierre_caja}</strong><p class="text-sm text-slate-500">${new Date(x.fecha_hasta).toLocaleString("es-PE")} · ${x.cantidad_pagos} pagos</p></div><strong class="text-emerald-600">${sC(x.total_general)}</strong></div>${x.observaciones ? `<p class="mt-2 text-sm text-slate-600">${eC(x.observaciones)}</p>` : ""}</article>`,
    )
    .join("");
}
async function cerrarCajaActual() {
  if (
    !confirm("¿Registrar el cierre con todos tus pagos pendientes de cierre?")
  )
    return;
  try {
    await apiCorte("/cajero/corte", {
      method: "POST",
      body: JSON.stringify({
        observaciones:
          document.getElementById("observaciones-corte")?.value || "",
      }),
    });
    alert("Cierre de caja registrado.");
    document.getElementById("observaciones-corte").value = "";
    await cargarCorte();
  } catch (err) {
    alert(err.message);
  }
}
document.addEventListener("DOMContentLoaded", cargarCorte);
