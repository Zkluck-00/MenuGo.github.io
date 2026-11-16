// MenuGo - autenticacion real de Administrador mediante JWT de PostgreSQL.
const ADMIN_KEYS = { sesion: 'menugo_admin_sesion' };
const API_BASE = window.MENUGO_API || 'http://localhost:4000/api';

function normalizarAdmin(valor) { return String(valor || '').trim().toLowerCase(); }

function obtenerSesionAdmin() {
  try {
    const sesion = JSON.parse(localStorage.getItem(ADMIN_KEYS.sesion) || 'null');
    if (!sesion || normalizarAdmin(sesion.rol) !== 'administrador' ||
        typeof sesion.token !== 'string' || !sesion.token) {
      localStorage.removeItem(ADMIN_KEYS.sesion);
      return null;
    }
    return sesion;
  } catch (_) {
    localStorage.removeItem(ADMIN_KEYS.sesion);
    return null;
  }
}

function obtenerTokenAdmin() { return obtenerSesionAdmin()?.token || ''; }

function crearSesionAdmin(usuario, token) {
  if (!token || typeof token !== 'string') throw new Error('El servidor no entrego una sesion valida.');
  const sesion = {
    email: usuario?.correo || usuario?.email || '',
    nombre: usuario?.nombre || 'Administrador',
    rol: 'Administrador', token, inicioSesion: new Date().toISOString(),
  };
  localStorage.setItem(ADMIN_KEYS.sesion, JSON.stringify(sesion));
  return sesion;
}

function cerrarSesionAdmin() {
  if (!confirm('¿Seguro que deseas cerrar sesion?')) return;
  localStorage.removeItem(ADMIN_KEYS.sesion);
  window.location.href = 'login.html?logout=1';
}

async function fetchAdminProtegido(url, options = {}) {
  const destino = url.startsWith('http://') || url.startsWith('https://') ? url : `${API_BASE}${url}`;
  const token = obtenerTokenAdmin();
  const response = await fetch(destino, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    localStorage.removeItem(ADMIN_KEYS.sesion);
    window.location.replace('login.html?access=required');
  }
  return response;
}

async function apiJson(url, options = {}) {
  const response = await fetchAdminProtegido(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Error de servidor');
  return data;
}

async function iniciarSesionAdmin(email, password) {
  const response = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: email, clave: password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Credenciales invalidas.');
  return crearSesionAdmin(data.data, data.token);
}

function protegerRutaAdmin() {
  const sesion = obtenerSesionAdmin();
  if (!sesion) window.location.replace('login.html?access=required');
  return sesion;
}
