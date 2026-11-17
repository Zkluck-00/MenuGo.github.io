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

function mostrarMensajeRecuperacionAdmin(texto, tipo = 'info') {
  const box = document.getElementById('mensaje-recuperacion-admin');
  if (!box) return;
  const clases = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
  };
  box.className = `mt-3 rounded-xl border px-3 py-2 text-sm font-bold ${clases[tipo] || clases.info}`;
  box.textContent = texto;
  box.classList.remove('hidden');
}

function configurarRecuperacionAdmin() {
  const panel = document.getElementById('panel-recuperacion-admin');
  const correo = document.getElementById('correo-recuperacion-admin');
  const pedirForm = document.getElementById('form-solicitar-codigo-admin');
  const restablecerForm = document.getElementById('form-restablecer-clave-admin');

  document.getElementById('abrir-recuperacion-admin')?.addEventListener('click', () => {
    panel?.classList.remove('hidden');
    correo.value = document.getElementById('login-email')?.value.trim() || '';
    correo?.focus();
  });
  document.getElementById('cerrar-recuperacion-admin')?.addEventListener('click', () => {
    panel?.classList.add('hidden');
  });

  pedirForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = pedirForm.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const resultado = await solicitarCodigoRecuperacionAdmin(correo.value.trim());
      mostrarMensajeRecuperacionAdmin(resultado.message, 'ok');
      pedirForm.classList.add('hidden');
      restablecerForm?.classList.remove('hidden');
      document.getElementById('codigo-recuperacion-admin')?.focus();
    } catch (error) {
      mostrarMensajeRecuperacionAdmin(error.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('codigo-recuperacion-admin')?.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('reenviar-codigo-admin')?.addEventListener('click', async (event) => {
    const boton = event.currentTarget;
    boton.disabled = true;
    try {
      const resultado = await solicitarCodigoRecuperacionAdmin(correo.value.trim());
      mostrarMensajeRecuperacionAdmin(`${resultado.message} Si solicitaste uno hace menos de un minuto, usa el código más reciente que recibiste.`, 'ok');
    } catch (error) {
      mostrarMensajeRecuperacionAdmin(error.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  restablecerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const clave = document.getElementById('nueva-clave-admin')?.value || '';
    const confirmar = document.getElementById('confirmar-clave-admin')?.value || '';
    if (clave !== confirmar) {
      mostrarMensajeRecuperacionAdmin('Las contraseñas no coinciden.', 'error');
      return;
    }
    const boton = restablecerForm.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const resultado = await restablecerClaveAdmin(
        correo.value.trim(),
        document.getElementById('codigo-recuperacion-admin')?.value || '',
        clave,
      );
      mostrarMensajeRecuperacionAdmin(resultado.message, 'ok');
      restablecerForm.reset();
      restablecerForm.classList.add('hidden');
      pedirForm.classList.remove('hidden');
      panel?.classList.add('hidden');
      document.getElementById('login-email').value = correo.value.trim();
      document.getElementById('login-password')?.focus();
    } catch (error) {
      mostrarMensajeRecuperacionAdmin(error.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });
}

async function configurarGoogleAdmin() {
  const seccion = document.getElementById('acceso-google-admin');
  const destino = document.getElementById('boton-google-admin');
  try {
    const config = await obtenerConfiguracionGoogleAdmin();
    if (!config.client_id || !seccion || !destino) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.accounts?.id) {
        mostrarMensajeLogin('No se pudo cargar el inicio de sesión de Google.', 'error');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: config.client_id,
        callback: async (respuesta) => {
          try {
            await iniciarSesionAdminGoogle(respuesta.credential);
            window.location.href = 'dashboard.html';
          } catch (error) {
            mostrarMensajeLogin(error.message, 'error');
          }
        },
      });
      window.google.accounts.id.renderButton(destino, {
        theme: 'outline', size: 'large', shape: 'rectangular',
        text: 'continue_with', width: Math.min(340, Math.max(240, destino.clientWidth || 320)),
      });
      seccion.classList.remove('hidden');
    };
    script.onerror = () => mostrarMensajeLogin('No se pudo conectar con el inicio de sesión de Google.', 'error');
    document.head.appendChild(script);
  } catch (error) {
    mostrarMensajeLogin(error.message, 'error');
  }
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
  configurarRecuperacionAdmin();
  configurarGoogleAdmin();
  leerParametrosLoginAdmin();
});
