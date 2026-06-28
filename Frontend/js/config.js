// MenuGo - configuración de API
// Para producción en Vercel, cambia PRODUCCION_API por la URL real de Render.
(function () {
  const LOCAL_API = "http://localhost:4000/api";
  const PRODUCCION_API = "https://COLOCA-AQUI-TU-BACKEND-DE-RENDER.onrender.com/api";

  const host = window.location.hostname;
  const esLocal = !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");

  window.MENUGO_API = window.MENUGO_API || (esLocal ? LOCAL_API : PRODUCCION_API);
})();
