const { Pool } = require("pg");
require("dotenv").config();

function crearPoolLocal(usuario, password) {
  return new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "Menu_Go",
    user: usuario,
    password,
  });
}

function crearPoolNeon() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

const usaNeon = Boolean(process.env.DATABASE_URL);

// En Neon/Render se usa un solo usuario real de la cadena DATABASE_URL.
// No se fuerzan los usuarios admin_app, mesero_app, cocina_app o cliente_app,
// porque esos roles locales no existen en Neon por defecto.
const poolNeon = usaNeon ? crearPoolNeon() : null;

const adminPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_ADMIN || process.env.DB_USER || "postgres", process.env.DB_PASS_ADMIN || process.env.DB_PASSWORD || "12345");

const meseroPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_MESERO || process.env.DB_USER || "postgres", process.env.DB_PASS_MESERO || process.env.DB_PASSWORD || "12345");

const cocinaPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_COCINA || process.env.DB_USER || "postgres", process.env.DB_PASS_COCINA || process.env.DB_PASSWORD || "12345");

const clientePool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_CLIENTE || process.env.DB_USER || "postgres", process.env.DB_PASS_CLIENTE || process.env.DB_PASSWORD || "12345");

const pool = adminPool;

for (const [nombre, instancia] of Object.entries({ pool, adminPool, meseroPool, cocinaPool, clientePool })) {
  if (instancia && !instancia.__menugoErrorHandler) {
    instancia.on("error", (error) => {
      console.error(`Error inesperado en PostgreSQL (${nombre}):`, error.message);
    });
    instancia.__menugoErrorHandler = true;
  }
}

module.exports = { pool, adminPool, meseroPool, cocinaPool, clientePool };
