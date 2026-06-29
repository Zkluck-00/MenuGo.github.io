const { adminPool: pool } = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require('path');
const eventEmitter = require('./utils/eventEmitter');
const productosRoutes = require("./routes/productos.routes");
const pedidosRoutes = require("./routes/pedidos.routes");
const mesasRoutes = require("./routes/mesas.routes");
const cuentasRoutes = require("./routes/cuentas.routes");
const cocinaRoutes = require("./routes/cocina.routes");
const meseroRoutes = require("./routes/mesero.routes");
const adminRoutes = require('./routes/admin.routes');
const { prepararQrMesas } = require('./config/qrMesas');

const app = express();
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, '../../Frontend')));
app.get("/", (req, res) => {
  res.json({ ok: true, message: "API MenuGo funcionando correctamente" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Servidor y rutas cargadas" });
});
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onPedidoCreado = (pedido) => sendEvent({ type: 'pedido:creado', data: pedido });
  const onPedidoActualizado = (pedido) => sendEvent({ type: 'pedido:actualizado', data: pedido });
  const onMesaActualizada = (mesa) => sendEvent({ type: 'mesa:actualizada', data: mesa });
  const onCuentaActualizada = (cuenta) => sendEvent({ type: 'cuenta:actualizada', data: cuenta });
  const onPagoRegistrado = (pago) => sendEvent({ type: 'pago:registrado', data: pago });
  const onPagoCruzadoRegistrado = (pago) => sendEvent({ type: 'pago:cruzado:registrado', data: pago });
  const onCuentasActualizadas = (cuentas) => sendEvent({ type: 'cuentas:actualizadas', data: cuentas });
  const onComentarioMesa = (comentario) => sendEvent({ type: 'comentario:mesa', data: comentario });
  eventEmitter.on('pedido:creado', onPedidoCreado);
  eventEmitter.on('pedido:actualizado', onPedidoActualizado);
  eventEmitter.on('mesa:actualizada', onMesaActualizada);
  eventEmitter.on('cuenta:actualizada', onCuentaActualizada);
  eventEmitter.on('pago:registrado', onPagoRegistrado);
 eventEmitter.on('pago:cruzado:registrado', onPagoCruzadoRegistrado);
  eventEmitter.on('cuentas:actualizadas', onCuentasActualizadas);
  eventEmitter.on('comentario:mesa', onComentarioMesa);
  req.on('close', () => {
    eventEmitter.off('pedido:creado', onPedidoCreado);
    eventEmitter.off('pedido:actualizado', onPedidoActualizado);
    eventEmitter.off('mesa:actualizada', onMesaActualizada);
    eventEmitter.off('cuenta:actualizada', onCuentaActualizada);
    eventEmitter.off('pago:registrado', onPagoRegistrado);
    eventEmitter.off('pago:cruzado:registrado', onPagoCruzadoRegistrado);
    eventEmitter.off('cuentas:actualizadas', onCuentasActualizadas);
    eventEmitter.off('comentario:mesa', onComentarioMesa);
    res.end();
  });
});
app.use("/api/productos", productosRoutes);
app.use("/api/pedidos", pedidosRoutes);
app.use("/api/mesas", mesasRoutes);
app.use("/api/cuentas", cuentasRoutes);
app.use("/api/cocina", cocinaRoutes);
app.use("/api/mesero", meseroRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Ruta no encontrada" });
});

app.use((err, req, res, next) => {
  console.error("Error del servidor:", err);
  res.status(500).json({ ok: false, message: "Error interno del servidor", error: err.message });
});

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4000;

app.listen(PORT, HOST, async () => {
  console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
  try {
    await prepararQrMesas();
    console.log('QR de mesas verificados correctamente.');
  } catch (error) {
    console.warn('No se pudo preparar QR de mesas:', error.message);
  }
});
