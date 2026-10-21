'use strict';

// MenuGo: comprobaciones HTTP de solo lectura para un backend en desarrollo.
// No crea pedidos, pagos, movimientos, turnos ni usuarios.
const BASE = process.env.MENUGO_BASE_URL || 'http://127.0.0.1:4000';
const TOKEN = process.env.MENUGO_CAJERO_TOKEN || '';

function validarDestino(valor, token) {
  let url;
  try { url = new URL(valor); } catch { throw new Error('MENUGO_BASE_URL no es una URL valida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Utiliza una URL http/https sin credenciales, query ni fragmento.');
  }
  const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (token && url.protocol !== 'https:' && !esLocal) {
    throw new Error('No se envia el token por HTTP fuera de localhost. Usa HTTPS.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('MENUGO_BASE_URL debe apuntar al origen, sin ruta.');
  }
  return url.origin;
}

async function obtener(origin, ruta, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(`${origin}${ruta}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  let data = null;
  try { data = await respuesta.json(); } catch { /* Validaremos el codigo HTTP. */ }
  return { status: respuesta.status, data };
}

async function main() {
  const origin = validarDestino(BASE, TOKEN);
  const pruebas = [
    ['/api/health', 200, 'API disponible'],
    ['/api/cajero/cuentas', 401, 'Cuentas requieren autenticacion'],
    ['/api/cajero/turnos/actual', 401, 'Turnos requieren autenticacion'],
    ['/api/cajero/turnos/actual/arqueo', 401, 'Arqueo requiere autenticacion'],
    ['/api/cajero/turnos/actual/movimientos', 401, 'Movimientos requieren autenticacion'],
    ['/api/cajero/cuentas/1/subcuentas', 401, 'Division requiere autenticacion'],
    ['/api/admin/dashboard', 401, 'Dashboard admin requiere autenticacion'],
  ];
  if (TOKEN) {
    pruebas.push(['/api/cajero/cuentas', 200, 'Cajero autenticado consulta cuentas', TOKEN]);
    pruebas.push(['/api/cajero/turnos/actual', 200, 'Cajero autenticado consulta turno', TOKEN]);
  }
  let errores = 0;
  for (const [ruta, esperado, titulo, token] of pruebas) {
    try {
      const { status, data } = await obtener(origin, ruta, token);
      const valido = status === esperado && (status !== 200 || data?.ok === true);
      console.log(`${valido ? 'OK' : 'ERROR'} ${titulo}: HTTP ${status}, esperado ${esperado}`);
      if (!valido) errores++;
    } catch (error) {
      console.error(`ERROR ${titulo}: ${error.message}`);
      errores++;
    }
  }
  if (errores) {
    console.error(`${errores} comprobacion(es) fallaron. Revisa el backend y las migraciones.`);
    process.exitCode = 1;
  } else {
    console.log('Smoke HTTP correcto (solo lecturas). No valida pagos reales ni Neon por completo.');
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
module.exports = { validarDestino, obtener };
