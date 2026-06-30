const { clientePool } = require("../config/db");

function mapProducto(row) {
  return {
    id_producto: row.id_producto,
    codigo_producto: row.codigo_producto,
    id: row.codigo_producto,
    tipo_producto: row.tipo_producto,
    tipo: row.tipo_producto,
    nombre: row.nombre,
    descripcion: row.descripcion || "",
    categoria: row.categoria || row.tipo_producto,
    precio: Number(row.precio),
    disponible: row.disponible_local !== undefined ? Boolean(row.disponible_local) : Boolean(row.activo),
    disponible_local: row.disponible_local !== undefined ? Boolean(row.disponible_local) : Boolean(row.activo),
    disponible_llevar: row.disponible_llevar === undefined ? true : Boolean(row.disponible_llevar),
    activo: Boolean(row.activo),
    imagen: row.imagen || null,
  };
}

const productosSql = `
  SELECT id_plato AS id_producto,
         codigo_plato AS codigo_producto,
         'plato' AS tipo_producto,
         nombre,
         descripcion,
         categoria,
         precio,
         disponible_llevar,
         (activo = true AND cantidad_de_platos > 0) AS disponible_local,
         activo,
         imagen
  FROM platos
  UNION ALL
  SELECT id_bebida AS id_producto,
         codigo_bebida AS codigo_producto,
         'bebida' AS tipo_producto,
         nombre,
         descripcion,
         categoria,
         precio,
         true AS disponible_llevar,
         (activo = true AND cantidad_de_bebidas > 0) AS disponible_local,
         activo,
         imagen
  FROM bebidas
`;

async function listarProductos(req, res) {
  try {
    const { rows } = await clientePool.query(`${productosSql} ORDER BY nombre ASC`);
    res.json({ ok: true, data: rows.map(mapProducto) });
  } catch (error) {
    console.error("Error al listar productos:", error);
    res.status(500).json({ ok: false, message: "Error al listar productos", error: error.message });
  }
}

async function listarDisponibles(req, res) {
  try {
    const { rows } = await clientePool.query(`
      SELECT * FROM (
        SELECT id_plato AS id_producto,
               codigo_plato AS codigo_producto,
               'plato' AS tipo_producto,
               nombre,
               descripcion,
               categoria,
               precio,
               disponible_llevar,
               (activo = true AND cantidad_de_platos > 0) AS disponible_local,
               activo,
               cantidad_de_platos AS stock,
               imagen
        FROM platos
        WHERE activo = true AND (cantidad_de_platos > 0 OR disponible_llevar = true)
        UNION ALL
        SELECT id_bebida AS id_producto,
               codigo_bebida AS codigo_producto,
               'bebida' AS tipo_producto,
               nombre,
               descripcion,
               categoria,
               precio,
               true AS disponible_llevar,
               (activo = true AND cantidad_de_bebidas > 0) AS disponible_local,
               activo,
               cantidad_de_bebidas AS stock,
               imagen
        FROM bebidas
        WHERE activo = true AND cantidad_de_bebidas > 0
      ) p
      ORDER BY nombre ASC
    `);
    res.json({ ok: true, data: rows.map(mapProducto) });
  } catch (error) {
    console.error("Error al listar productos disponibles:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function obtenerProductoPorId(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await clientePool.query(
      `SELECT * FROM (${productosSql}) p WHERE codigo_producto = $1 OR id_producto::text = $1 LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    }

    res.json({ ok: true, data: mapProducto(rows[0]) });
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ ok: false, message: "Error al obtener producto", error: error.message });
  }
}

module.exports = {
  listarProductos,
  listarDisponibles,
  obtenerProductoPorId,
};