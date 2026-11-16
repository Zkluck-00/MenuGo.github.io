'use strict';

// MenuGo - Commit 16/20. UI del arqueo y cierre físico del turno del JWT.
// El cálculo visual es orientativo: el valor definitivo procede de PostgreSQL.
if (window.MENUGO_PERSONAL_BLOQUEADO) throw new Error('Acceso bloqueado: inicia sesion como Cajero.');
const API_ARQUEO_CAJA = window.MENUGO_API || 'http://localhost:4000/api';
const RUTA_ARQUEO_CAJA = '/cajero/turnos/actual/arqueo';
const RUTA_HISTORIAL_ARQUEO = '/cajero/turnos/cierres';
const CLAVE_PENDIENTE_CIERRE = 'menugo_cierre_turno_pendiente_v1';
let turnoArqueoCaja = null;
let solicitudPendienteCierre = null;
let consultandoArqueoCaja = false;
let enviandoCierreCaja = false;

function elementoArqueo(id) { return document.getElementById(id); }
function solesArqueo(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }
function escaparArqueo(valor) {
  return String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function fechaArqueo(valor) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}
function mensajeArqueo(texto, tipo = 'info') {
  const el = elementoArqueo('mensaje-arqueo-caja');
  if (!el) return;
  const estilos = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    exito: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  el.className = `mb-4 rounded-2xl border p-4 text-sm font-semibold ${estilos[tipo] || estilos.info}`;
  el.textContent = texto || '';
  el.classList.toggle('hidden', !texto);
}
async function solicitarArqueo(ruta, options = {}) {
  const respuesta = await fetch(`${API_ARQUEO_CAJA}${ruta}`, {
    ...options,
    headers: headersAutenticadosPersonal('cajero', options.headers || {}),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    localStorage.removeItem('menugo_cajero_sesion');
    window.location.replace('login.html?access=required');
    throw new Error('La sesion vencio. Inicia sesion nuevamente.');
  }
  if (!respuesta.ok || datos.ok === false) {
    const error = new Error(datos.message || 'No se pudo completar la operacion de cierre.');
    error.status = respuesta.status;
    error.code = datos.code;
    throw error;
  }
  return datos;
}
function claveSeguraCierre() {
  if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  if (typeof window.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `menugo-${Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('Abre MenuGo desde HTTPS o localhost para cerrar caja de forma segura.');
}
function leerCentavosCierre(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) throw new Error('Ingresa un importe valido, con hasta dos decimales.');
  const [parte, decimales = ''] = texto.split('.');
  const centavos = Number(parte) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > 999999999999) {
    throw new Error('El importe supera el limite permitido.');
  }
  return centavos;
}
function valorDineroCierre(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const n = Math.abs(centavos);
  return `${signo}S/ ${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}
function mostrarDiferenciaEstimada() {
  const elemento = elementoArqueo('diferencia-estimada-cierre');
  if (!elemento) return;
  try {
    if (!turnoArqueoCaja || !elementoArqueo('efectivo-contado-cierre')?.value.trim()) {
      elemento.textContent = '—'; return;
    }
    const contado = leerCentavosCierre(elementoArqueo('efectivo-contado-cierre').value);
    const esperado = leerCentavosCierre(turnoArqueoCaja.efectivo_teorico);
    const diferencia = contado - esperado;
    elemento.textContent = `${valorDineroCierre(diferencia)} ${diferencia < 0 ? '(faltante)' : diferencia > 0 ? '(sobrante)' : '(cuadra)'}`;
    elemento.className = `mt-1 text-2xl font-black ${diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}`;
  } catch (_) { elemento.textContent = 'Monto inválido'; }
}
function restaurarPendienteCierre() {
  try {
    const valor = JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTE_CIERRE) || 'null');
    if (valor && Number.isSafeInteger(Number(valor.id_turno)) && Number(valor.id_turno) > 0 &&
        typeof valor.idempotency_key === 'string' && valor.idempotency_key.length >= 16) {
      solicitudPendienteCierre = valor;
    }
  } catch (_) { /* Se descarta una solicitud incompleta. */ }
}
function persistirPendienteCierre(datos) {
  solicitudPendienteCierre = datos;
  try { sessionStorage.setItem(CLAVE_PENDIENTE_CIERRE, JSON.stringify(datos)); }
  catch (_) { /* La memoria mantiene la solicitud mientras esta pagina siga abierta. */ }
}
function limpiarPendienteCierre() {
  solicitudPendienteCierre = null;
  try { sessionStorage.removeItem(CLAVE_PENDIENTE_CIERRE); } catch (_) { /* sin almacenamiento */ }
}
function actualizarBloqueoCierre() {
  const abierto = turnoArqueoCaja?.estado === 'abierto';
  const campos = elementoArqueo('campos-cierre-turno');
  if (campos) campos.disabled = !abierto || enviandoCierreCaja || Boolean(solicitudPendienteCierre);
  elementoArqueo('aviso-reintento-cierre')?.classList.toggle('hidden', !solicitudPendienteCierre);
  const botonReintentar = elementoArqueo('boton-reintentar-cierre');
  if (botonReintentar) botonReintentar.disabled = enviandoCierreCaja;
  const botonDescartar = elementoArqueo('boton-descartar-cierre');
  if (botonDescartar) botonDescartar.disabled = enviandoCierreCaja;
  const botonCerrar = elementoArqueo('boton-cerrar-turno');
  if (botonCerrar) botonCerrar.textContent = enviandoCierreCaja ? 'Cerrando turno...' : 'Confirmar arqueo y cerrar turno';
  const aviso = elementoArqueo('descripcion-reintento-cierre');
  if (aviso && solicitudPendienteCierre) {
    aviso.textContent = `Turno #${solicitudPendienteCierre.id_turno}, efectivo contado S/ ${solicitudPendienteCierre.efectivo_contado}. Reintenta esta MISMA operacion para recuperar el resultado.`;
  }
}
function mostrarResumenArqueo(datos) {
  turnoArqueoCaja = datos?.estado === 'abierto' ? datos : null;
  const abierto = Boolean(turnoArqueoCaja);
  elementoArqueo('aviso-sin-turno-arqueo')?.classList.toggle('hidden', abierto);
  elementoArqueo('seccion-resumen-arqueo')?.classList.toggle('hidden', !abierto);
  if (!abierto) { actualizarBloqueoCierre(); return; }
  const mapa = {
    'arqueo-id-turno': `#${datos.id_turno}`,
    'arqueo-fondo': solesArqueo(datos.fondo_inicial),
    'arqueo-ventas-efectivo': solesArqueo(datos.ventas_efectivo),
    'arqueo-ingresos': solesArqueo(datos.total_ingresos),
    'arqueo-retiros': solesArqueo(datos.total_retiros),
    'arqueo-esperado': solesArqueo(datos.efectivo_teorico),
    'arqueo-cantidad-pagos': String(datos.cantidad_pagos ?? 0),
    'arqueo-cantidad-movimientos': String(datos.cantidad_movimientos ?? 0),
    'arqueo-yape': solesArqueo(datos.ventas_yape),
    'arqueo-plin': solesArqueo(datos.ventas_plin),
    'arqueo-tarjetas': solesArqueo(Number(datos.ventas_tarjeta_credito || 0) + Number(datos.ventas_tarjeta_debito || 0)),
    'arqueo-total-ventas': solesArqueo(datos.total_cobrado),
  };
  for (const [id, valor] of Object.entries(mapa)) {
    const el = elementoArqueo(id);
    if (el) el.textContent = valor;
  }
  mostrarDiferenciaEstimada();
  actualizarBloqueoCierre();
}
function mostrarHistorialArqueo(lista) {
  const destino = elementoArqueo('historial-turnos-cerrados');
  if (!destino) return;
  if (!lista.length) {
    destino.innerHTML = '<p class="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Todavía no tienes turnos cerrados.</p>';
    return;
  }
  destino.innerHTML = lista.map((t) => {
    const faltante = Number(t.diferencia) < 0;
    const sobrante = Number(t.diferencia) > 0;
    const color = faltante ? 'text-rose-700' : sobrante ? 'text-amber-700' : 'text-emerald-700';
    return `<article class="rounded-2xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div><p class="font-black">Turno #${escaparArqueo(t.id_turno)}</p>
        <p class="text-xs text-slate-500">${escaparArqueo(fechaArqueo(t.abierto_at))} → ${escaparArqueo(fechaArqueo(t.cerrado_at))}</p></div>
        <span class="text-sm font-black ${color}">${faltante ? 'Faltante' : sobrante ? 'Sobrante' : 'Cuadra'}: ${escaparArqueo(solesArqueo(t.diferencia))}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <p><span class="text-slate-500">Fondo:</span> <strong>${escaparArqueo(solesArqueo(t.fondo_inicial))}</strong></p>
        <p><span class="text-slate-500">Esperado:</span> <strong>${escaparArqueo(solesArqueo(t.efectivo_esperado))}</strong></p>
        <p><span class="text-slate-500">Contado:</span> <strong>${escaparArqueo(solesArqueo(t.efectivo_contado))}</strong></p>
        <p><span class="text-slate-500">Ventas totales:</span> <strong>${escaparArqueo(solesArqueo(t.total_cobrado))}</strong></p>
      </div>
      ${t.observaciones_cierre ? `<p class="mt-2 break-words text-xs text-slate-600">${escaparArqueo(t.observaciones_cierre)}</p>` : ''}
    </article>`;
  }).join('');
}
async function cargarArqueoCaja() {
  if (consultandoArqueoCaja) return;
  consultandoArqueoCaja = true;
  try {
    const [actual, historico] = await Promise.all([
      solicitarArqueo(RUTA_ARQUEO_CAJA),
      solicitarArqueo(RUTA_HISTORIAL_ARQUEO),
    ]);
    mostrarResumenArqueo(actual.data || null);
    mostrarHistorialArqueo(historico.data || []);
  } catch (error) {
    turnoArqueoCaja = null;
    actualizarBloqueoCierre();
    mensajeArqueo(error.message, 'error');
  } finally { consultandoArqueoCaja = false; }
}
function obtenerSolicitudCierreFormulario() {
  if (!turnoArqueoCaja?.id_turno) throw new Error('No existe un turno abierto para cerrar.');
  const importe = elementoArqueo('efectivo-contado-cierre')?.value || '';
  const centavos = leerCentavosCierre(importe);
  const nota = elementoArqueo('observaciones-cierre-turno')?.value.trim() || '';
  if (nota.length > 500) throw new Error('Las observaciones no pueden superar 500 caracteres.');
  return {
    id_turno: Number(turnoArqueoCaja.id_turno),
    efectivo_contado: `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`,
    observaciones_cierre: nota || null,
    idempotency_key: claveSeguraCierre(),
  };
}
async function enviarCierreCaja(payload) {
  if (enviandoCierreCaja) return;
  enviandoCierreCaja = true;
  actualizarBloqueoCierre();
  try {
    const { id_turno, ...datos } = payload;
    const respuesta = await solicitarArqueo(`/cajero/turnos/${encodeURIComponent(id_turno)}/cerrar`, {
      method: 'POST', body: JSON.stringify(datos),
    });
    limpiarPendienteCierre();
    const diferencia = respuesta.data?.diferencia ?? '0.00';
    mensajeArqueo(`Turno #${id_turno} cerrado. Diferencia registrada: ${solesArqueo(diferencia)}. ` +
      (respuesta.repetido ? 'La solicitud anterior ya estaba confirmada.' : 'Arqueo guardado correctamente.'), 'exito');
    const conteo = elementoArqueo('efectivo-contado-cierre');
    if (conteo) conteo.value = '';
    await cargarArqueoCaja();
  } catch (error) {
    // No se descarta ante errores inciertos: reintentar siempre con MISMA clave.
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401) {
      mensajeArqueo(`El cierre fue rechazado: ${error.message} Revisa tus turnos cerrados antes de descartar la solicitud.`, 'error');
      await cargarArqueoCaja();
    } else {
      mensajeArqueo(`No se pudo confirmar el cierre. Usa “Reintentar el mismo cierre”; no generes otra clave. ${error.message}`, 'error');
    }
  } finally {
    enviandoCierreCaja = false;
    actualizarBloqueoCierre();
  }
}
async function cerrarTurnoCajaUI(event) {
  event.preventDefault();
  if (enviandoCierreCaja || solicitudPendienteCierre) return;
  try {
    const payload = obtenerSolicitudCierreFormulario();
    if (!window.confirm(`¿Confirmas el cierre del turno #${payload.id_turno} con S/ ${payload.efectivo_contado} contados? No podrás registrar nuevos cobros ni movimientos en ese turno.`)) return;
    persistirPendienteCierre(payload); // antes del POST: recuperable si la red falla
    await enviarCierreCaja(payload);
  } catch (error) { mensajeArqueo(error.message, 'error'); }
}
function descartarSolicitudCierreUI() {
  if (enviandoCierreCaja || !solicitudPendienteCierre) return;
  if (!window.confirm('Verifica primero el historial del turno. ¿Descartar la solicitud local pendiente y desbloquear el formulario?')) return;
  limpiarPendienteCierre();
  actualizarBloqueoCierre();
  mensajeArqueo('Solicitud local descartada. Comprueba el historial antes de intentar otro cierre.', 'info');
}
function configurarArqueoCajaUI() {
  restaurarPendienteCierre();
  elementoArqueo('boton-refrescar-arqueo')?.addEventListener('click', cargarArqueoCaja);
  elementoArqueo('efectivo-contado-cierre')?.addEventListener('input', mostrarDiferenciaEstimada);
  elementoArqueo('form-cierre-turno')?.addEventListener('submit', cerrarTurnoCajaUI);
  elementoArqueo('boton-reintentar-cierre')?.addEventListener('click', () => {
    if (solicitudPendienteCierre) enviarCierreCaja(solicitudPendienteCierre);
  });
  elementoArqueo('boton-descartar-cierre')?.addEventListener('click', descartarSolicitudCierreUI);
  if (solicitudPendienteCierre) mensajeArqueo('Existe un cierre sin confirmar. Recupera la misma operación antes de iniciar otro.', 'info');
  actualizarBloqueoCierre();
  cargarArqueoCaja();
}
document.addEventListener('DOMContentLoaded', configurarArqueoCajaUI);
