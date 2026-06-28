// MenuGo - autenticacion temporal del administrador
// Base frontend para pruebas. Cuando exista backend, reemplazar por autenticacion real.

const ADMIN_KEYS = {
  sesion: "menugo_admin_sesion",
};

const ADMIN_DEFAULT = {
  nombre: "Administrador MenuGo",
  email: "Admin@MenuGo.com",
  password: "AdminGo123#",
  rol: "Administrador",
};

const API_BASE = window.MENUGO_API || "http://localhost:4000/api";

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function normalizarAdmin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function obtenerSesionAdmin() {
  try {
    const sesion = JSON.parse(localStorage.getItem(ADMIN_KEYS.sesion) || "null");
    if (!sesion || normalizarAdmin(sesion.email) !== normalizarAdmin(ADMIN_DEFAULT.email)) {
      localStorage.removeItem(ADMIN_KEYS.sesion);
      return null;
    }
    return sesion;
  } catch (error) {
    console.error("No se pudo leer la sesion admin", error);
    localStorage.removeItem(ADMIN_KEYS.sesion);
    return null;
  }
}

function crearSesionAdmin() {
  const sesion = {
    email: ADMIN_DEFAULT.email,
    nombre: ADMIN_DEFAULT.nombre,
    rol: ADMIN_DEFAULT.rol,
    inicioSesion: new Date().toISOString(),
  };

  localStorage.setItem(ADMIN_KEYS.sesion, JSON.stringify(sesion));
  return sesion;
}

function cerrarSesionAdmin() {
  localStorage.removeItem(ADMIN_KEYS.sesion);
  window.location.href = "login.html?logout=1";
}

async function iniciarSesionAdmin(email, password) {
  try {
    const data = await apiJson("/admin/login", {
      method: "POST",
      body: JSON.stringify({ usuario: email, clave: password })
    });
    return crearSesionAdmin();
  } catch (error) {
    const emailCorrecto = normalizarAdmin(email) === normalizarAdmin(ADMIN_DEFAULT.email);
    const passwordCorrecto = String(password || "") === ADMIN_DEFAULT.password;
    if (!emailCorrecto || !passwordCorrecto) {
      throw new Error("Usuario o contrasena incorrectos.");
    }
    return crearSesionAdmin();
  }
}

function protegerRutaAdmin() {
  const sesion = obtenerSesionAdmin();
  if (!sesion) {
    window.location.href = "login.html?access=required";
    return null;
  }
  return sesion;
}
