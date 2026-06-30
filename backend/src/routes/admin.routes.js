const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

router.post('/login', adminController.login);
router.post('/personal/login', adminController.loginPersonal);


router.get('/dashboard', adminController.getDashboard);
router.get('/ventas/grafica', adminController.getGraficaVentas);
router.get('/ventas/reporte', adminController.getReporteVentas);
router.get('/platos/mas-vendidos', adminController.getPlatosMasVendidos);


router.get('/productos', adminController.getProductos);
router.post('/productos', adminController.createProducto);
router.patch('/productos/:id/disponibilidad', adminController.actualizarDisponibilidadProducto);
router.patch('/productos/:id/disponible-llevar', adminController.actualizarDisponibleLlevarProducto);
router.delete('/productos/:id', adminController.deleteProducto);


router.get('/trabajadores', adminController.getTrabajadores);
router.post('/trabajadores', adminController.createTrabajador);
router.get('/menu-dia', adminController.getMenuDia);
router.post('/menu-dia', adminController.addToMenuDia);
router.delete('/menu-dia/:id', adminController.removeFromMenuDia);

router.get('/trabajadores/reporte', adminController.getReporteTrabajadores);
router.get('/trabajadores/:id', adminController.getTrabajadorById);
router.put('/trabajadores/:id', adminController.updateTrabajador);
router.delete('/trabajadores/:id', adminController.deleteTrabajador);

router.get('/health', adminController.health);

module.exports = router;