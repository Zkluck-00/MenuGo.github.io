const express = require("express");
const router = express.Router();
const productosController = require("../controllers/productos.controller");

router.get("/", productosController.listarProductos);
router.get("/disponibles", productosController.listarDisponibles);
router.get("/:id", productosController.obtenerProductoPorId);

module.exports = router;
