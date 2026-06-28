// MenuGo - login temporal de administrador

function mostrarMensajeLogin(texto, tipo = "info") {
  const box = document.getElementById("mensaje-login");
  if (!box) return;

  const clases = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-orange-200 bg-orange-50 text-orange-800",
  };

  box.className = `mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${clases[tipo] || clases.info}`;
  box.textContent = texto;
  box.classList.remove("hidden");
}

function configurarFormularioLoginAdmin() {
  const formLogin = document.getElementById("form-login-admin");

  formLogin?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const email = document.getElementById("login-email")?.value || "";
    const password = document.getElementById("login-password")?.value || "";
    await iniciarSesionAdmin(email, password);
    window.location.href = "dashboard.html";
  } catch (error) {
    mostrarMensajeLogin(error.message, "error");
  }
});
}

function leerParametrosLoginAdmin() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("access") === "required") {
    mostrarMensajeLogin(
      "Debes iniciar sesion como administrador antes de abrir el panel.",
      "warning",
    );
  }

  if (params.get("logout") === "1") {
    mostrarMensajeLogin("Sesion cerrada correctamente.", "ok");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sesion = obtenerSesionAdmin();
  if (sesion) {
    window.location.href = "dashboard.html";
    return;
  }

  configurarFormularioLoginAdmin();
  leerParametrosLoginAdmin();
});
