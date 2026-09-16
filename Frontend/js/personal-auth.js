// MenuGo - autenticacion de personal (Mesero, Cocina y Cajero)
// Cajero usa exclusivamente trabajadores registrados en la base de datos.

const PERSONAL_AUTH_KEYS = {
  mesero: 'menugo_mesero_sesion',
  cocina: 'menugo_cocina_sesion',
  cajero: 'menugo_cajero_sesion'
};

const API_BASE_PERSONAL = window.MENUGO_API || 'http://localhost:4000/api';

const PERSONAL_CREDENTIALS = {
  mesero: {
    nombre: 'Mesero MenuGo',
    email: 'Mesero@MenuGo.com',
    password: 'MeseroGo321#',
    rol: 'Mesero',
    inicio: 'mesas.html',
    permitirFallbackLocal: true
  },
  cocina: {
    nombre: 'Cocina MenuGo',
    email: 'Cocina@MenuGo.com',
    password: 'CocinaGo321#',
    rol: 'Cocina',
    inicio: 'pedidos.html',
    permitirFallbackLocal: true
  },
  cajero: {
    nombre: 'Cajero MenuGo',
    rol: 'Cajero',
    inicio: 'cajero.html',
    permitirFallbackLocal: false
  }
};

function normalizarPersonal(valor) {
  return String(valor || '').trim().toLowerCase();
}

function obtenerRolPorRutaPersonal() {
  const ruta = window.location.pathname.toLowerCase();
  if (ruta.includes('/mesero/')) return 'mesero';
  if (ruta.includes('/cocina/')) return 'cocina';
  if (ruta.includes('/cajero/')) return 'cajero';
  return null;
}

function obtenerConfigPersonal(rol) {
  return PERSONAL_CREDENTIALS[normalizarPersonal(rol)] || null;
}

function obtenerKeySesionPersonal(rol) {
  return PERSONAL_AUTH_KEYS[normalizarPersonal(rol)] || null;
}

function obtenerSesionPersonal(rol) {
  const rolNormalizado = normalizarPersonal(rol);
  const key = obtenerKeySesionPersonal(rolNormalizado);
  if (!key) return null;

  try {
    const sesion = JSON.parse(localStorage.getItem(key) || 'null');
    if (!sesion || normalizarPersonal(sesion.rol) !== rolNormalizado) {
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

function obtenerTokenPersonal(rol = null) {
  const rolActual = rol || obtenerRolPorRutaPersonal();
  return obtenerSesionPersonal(rolActual)?.token || '';
}

function headersAutenticadosPersonal(rol = null, extras = {}) {
  const token = obtenerTokenPersonal(rol);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extras
  };
}

async function iniciarSesionPersonal(rol, email, password) {
  const rolNormalizado = normalizarPersonal(rol);
  const config = obtenerConfigPersonal(rolNormalizado);
  const key = obtenerKeySesionPersonal(rolNormalizado);
  if (!config || !key) throw new Error('Rol no valido.');

  try {
    const response = await fetch(`${API_BASE_PERSONAL}/admin/personal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: email, clave: password, rol: rolNormalizado })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || 'Credenciales invalidas');

    const sesion = {
      id_trabajador: data.data?.id_trabajador || null,
      email: data.data?.email || email,
      nombre: data.data?.nombre || config.nombre,
      rol: rolNormalizado,
      rolTexto: data.data?.rol || config.rol,
      token: data.token || '',
      inicioSesion: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(sesion));
    return sesion;
  } catch (error) {
    if (!config.permitirFallbackLocal) {
      throw new Error(error.message || 'No se pudo iniciar sesion contra la base de datos.');
    }

    const emailCorrecto = normalizarPersonal(email) === normalizarPersonal(config.email);
    const passwordCorrecto = String(password || '') === config.password;
    if (!emailCorrecto || !passwordCorrecto) {
      throw new Error(error.message || 'Correo o contrasena incorrectos.');
    }

    const sesion = {
      id_trabajador: null,
      email: config.email,
      nombre: config.nombre,
      rol: rolNormalizado,
      rolTexto: config.rol,
      token: '',
      inicioSesion: new Date().toISOString(),
      sesionLocal: true
    };
    localStorage.setItem(key, JSON.stringify(sesion));
    return sesion;
  }
}

function cerrarSesionPersonal(rol = null) {
  if (!confirm('¿Seguro que deseas cerrar sesion?')) return;
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
    <span class="hidden sm:inline">${sesion.rolTexto || sesion.rol}: ${sesion.email}</span>
    <span class="sm:hidden">${sesion.rolTexto || sesion.rol}</span>
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
  if (!sesion) window.location.replace('login.html?access=required');
})();

function configurarLoginPersonal() {
  const form = document.getElementById('form-login-personal');
  if (!form) return;

  const rol = normalizarPersonal(form.dataset.rol || obtenerRolPorRutaPersonal());
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
  if (params.get('access') === 'required') mostrarMensaje(`Debes iniciar sesion como ${config.rol} antes de abrir este panel.`, 'warning');
  if (params.get('logout') === '1') mostrarMensaje('Sesion cerrada correctamente.', 'ok');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const email = document.getElementById('login-email')?.value || '';
      const password = document.getElementById('login-password')?.value || '';
      await iniciarSesionPersonal(rol, email, password);
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
