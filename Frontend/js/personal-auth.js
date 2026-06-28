// MenuGo - autenticacion para Mesero y Cocina
// Protege las pantallas internas del personal con credenciales por rol.

const PERSONAL_AUTH_KEYS = {
  mesero: 'menugo_mesero_sesion',
  cocina: 'menugo_cocina_sesion'
};

const PERSONAL_CREDENTIALS = {
  mesero: {
    nombre: 'Mesero MenuGo',
    email: 'Mesero@MenuGo.com',
    password: 'MeseroGo321#',
    rol: 'Mesero',
    inicio: 'mesas.html'
  },
  cocina: {
    nombre: 'Cocina MenuGo',
    email: 'Cocina@MenuGo.com',
    password: 'CocinaGo321#',
    rol: 'Cocina',
    inicio: 'pedidos.html'
  }
};

function normalizarPersonal(valor) {
  return String(valor || '').trim().toLowerCase();
}

function obtenerRolPorRutaPersonal() {
  const ruta = window.location.pathname.toLowerCase();
  if (ruta.includes('/mesero/')) return 'mesero';
  if (ruta.includes('/cocina/')) return 'cocina';
  return null;
}

function obtenerConfigPersonal(rol) {
  return PERSONAL_CREDENTIALS[normalizarPersonal(rol)] || null;
}

function obtenerKeySesionPersonal(rol) {
  return PERSONAL_AUTH_KEYS[normalizarPersonal(rol)] || null;
}

function obtenerSesionPersonal(rol) {
  const key = obtenerKeySesionPersonal(rol);
  const config = obtenerConfigPersonal(rol);
  if (!key || !config) return null;

  try {
    const sesion = JSON.parse(localStorage.getItem(key) || 'null');
    const emailValido = normalizarPersonal(sesion?.email) === normalizarPersonal(config.email);
    const rolValido = normalizarPersonal(sesion?.rol) === normalizarPersonal(config.rol);

    if (!sesion || !emailValido || !rolValido) {
      localStorage.removeItem(key);
      return null;
    }

    return sesion;
  } catch (error) {
    console.error('No se pudo leer la sesion del personal', error);
    localStorage.removeItem(key);
    return null;
  }
}

function iniciarSesionPersonal(rol, email, password) {
  const config = obtenerConfigPersonal(rol);
  const key = obtenerKeySesionPersonal(rol);

  if (!config || !key) {
    throw new Error('Rol no valido.');
  }

  const emailCorrecto = normalizarPersonal(email) === normalizarPersonal(config.email);
  const passwordCorrecto = String(password || '') === config.password;

  if (!emailCorrecto || !passwordCorrecto) {
    throw new Error('Correo o contrasena incorrectos.');
  }

  const sesion = {
    email: config.email,
    nombre: config.nombre,
    rol: config.rol,
    inicioSesion: new Date().toISOString()
  };

  localStorage.setItem(key, JSON.stringify(sesion));
  return sesion;
}

function cerrarSesionPersonal(rol = null) {
  const rolActual = rol || obtenerRolPorRutaPersonal();
  const key = obtenerKeySesionPersonal(rolActual);
  if (key) localStorage.removeItem(key);
  window.location.href = 'login.html?logout=1';
}

function protegerRutaPersonal(rol = null) {
  const rolActual = rol || obtenerRolPorRutaPersonal();
  if (!rolActual) return null;

  const archivoActual = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (archivoActual === 'login.html') return obtenerSesionPersonal(rolActual);

  const sesion = obtenerSesionPersonal(rolActual);
  if (!sesion) {
    window.location.replace('login.html?access=required');
    return null;
  }

  insertarBarraSesionPersonal(rolActual, sesion);
  return sesion;
}

function insertarBarraSesionPersonal(rol, sesion) {
  if (document.getElementById('menu-go-personal-session')) return;

  const barra = document.createElement('div');
  barra.id = 'menu-go-personal-session';
  barra.className = 'fixed bottom-4 right-4 z-50 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold text-white shadow-2xl shadow-slate-900/30';
  barra.innerHTML = `
    <span class="hidden sm:inline">${sesion.rol}: ${sesion.email}</span>
    <span class="sm:hidden">${sesion.rol}</span>
    <button type="button" class="rounded-xl bg-white/10 px-3 py-2 font-black hover:bg-white/20" onclick="cerrarSesionPersonal('${rol}')">Cerrar sesion</button>
  `;
  document.body.appendChild(barra);
}


(function bloquearRutaPersonalSinSesion() {
  const rol = obtenerRolPorRutaPersonal();
  const archivoActual = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (!rol || archivoActual === 'login.html') {
    window.MENUGO_PERSONAL_BLOQUEADO = false;
    return;
  }

  const sesion = obtenerSesionPersonal(rol);
  window.MENUGO_PERSONAL_SESION = sesion;
  window.MENUGO_PERSONAL_BLOQUEADO = !sesion;

  if (!sesion) {
    window.location.replace('login.html?access=required');
  }
})();

function configurarLoginPersonal() {
  const form = document.getElementById('form-login-personal');
  if (!form) return;

  const rol = form.dataset.rol || obtenerRolPorRutaPersonal();
  const config = obtenerConfigPersonal(rol);
  const mensaje = document.getElementById('mensaje-login-personal');

  function mostrarMensaje(texto, tipo = 'info') {
    if (!mensaje) return;
    const clases = {
      info: 'border-blue-200 bg-blue-50 text-blue-800',
      ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      error: 'border-red-200 bg-red-50 text-red-800',
      warning: 'border-orange-200 bg-orange-50 text-orange-800'
    };
    mensaje.className = `mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${clases[tipo] || clases.info}`;
    mensaje.textContent = texto;
    mensaje.classList.remove('hidden');
  }

  if (!config) {
    mostrarMensaje('No se pudo identificar el rol de acceso.', 'error');
    return;
  }

  const sesion = obtenerSesionPersonal(rol);
  if (sesion) {
    window.location.href = config.inicio;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('access') === 'required') {
    mostrarMensaje(`Debes iniciar sesion como ${config.rol} antes de abrir este panel.`, 'warning');
  }
  if (params.get('logout') === '1') {
    mostrarMensaje('Sesion cerrada correctamente.', 'ok');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const email = document.getElementById('login-email')?.value || '';
      const password = document.getElementById('login-password')?.value || '';
      iniciarSesionPersonal(rol, email, password);
      window.location.href = config.inicio;
    } catch (error) {
      mostrarMensaje(error.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  configurarLoginPersonal();
  protegerRutaPersonal();
});
