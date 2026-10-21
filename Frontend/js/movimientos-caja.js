'use strict';

// MenuGo - Commit 15: ingresos y retiros MANUALES del turno autenticado.
// No utiliza la API de pagos y NO duplica ventas.
const API_MOVIMIENTOS_CAJA = window.MENUGO_API || 'http://localhost:4000/api';
const RUTA_MOVIMIENTOS_CAJA = '/cajero/turnos/actual/movimientos';
const CLAVE_PENDIENTE_MOV_CAJA = 'menugo_movimiento_pendiente_v1';
let turnoMovimientosCaja = null;
let enviandoMovimientoCaja = false;
let consultandoMovimientosCaja = false;
let solicitudPendienteMovimientoCaja = null;

const CATEGORIAS_MOV_CAJA = {
  ingreso: [
    { id: 'reposicion', nombre: 'Reposición de efectivo' },
    { id: 'ajuste', nombre: 'Ajuste positivo' },
    { id: 'otro', nombre: 'Otro ingreso' },
  ],
  retiro: [
    { id: 'gasto', nombre: 'Gasto de caja chica' },
    { id: 'retiro_banco', nombre: 'Retiro para depósito' },
    { id: 'ajuste', nombre: 'Ajuste negativo' },
    { id: 'otro', nombre: 'Otro retiro' },
  ],
};

function monedaMovCaja(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }
function escapeMovCaja(valor) {
  return String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function fechaMovCaja(valor) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}
function elementoMovCaja(id) { return document.getElementById(id); }

function mensajeMovCaja(mensaje, tipo = 'info') {
  const el = elementoMovCaja('mensaje-movimientos-caja');
  if (!el) return;
  const estilos = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    exito: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  el.textContent = mensaje || '';
  el.className = `mb-4 rounded-2xl border p-4 text-sm font-semibold ${estilos[tipo] || estilos.info}`;
  el.classList.toggle('hidden', !mensaje);
}

async function solicitarMovCaja(ruta, options = {}) {
  const respuesta = await fetch(`${API_MOVIMIENTOS_CAJA}${ruta}`, {
    ...options,
    headers: headersAutenticadosPersonal('cajero', options.headers || {}),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    localStorage.removeItem('menugo_cajero_sesion');
    window.location.replace('login.html?access=required');
    throw new Error('Sesion vencida.');
  }
  if (!respuesta.ok || datos.ok === false) {
    const error = new Error(datos.message || 'No se pudo completar la operacion.');
    error.status = respuesta.status;
    error.code = datos.code;
    throw error;
  }
  return datos;
}

function actualizarCategoriasMovCaja() {
  const tipo = elementoMovCaja('tipo-movimiento-caja')?.value || 'ingreso';
  const select = elementoMovCaja('categoria-movimiento-caja');
  if (!select) return;
  const actuales = CATEGORIAS_MOV_CAJA[tipo] || [];
  select.innerHTML = actuales.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function restaurarPendienteMovCaja() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTE_MOV_CAJA) || 'null');
    if (guardado && typeof guardado.idempotency_key === 'string' &&
        guardado.idempotency_key.length >= 16 && Number.isSafeInteger(Number(guardado.id_turno))) {
      solicitudPendienteMovimientoCaja = guardado;
    }
  } catch (_) { /* No se puede restaurar una operacion dañada. */ }
}
function persistirPendienteMovCaja(payload) {
  solicitudPendienteMovimientoCaja = payload;
  try { sessionStorage.setItem(CLAVE_PENDIENTE_MOV_CAJA, JSON.stringify(payload)); }
  catch (_) { /* La memoria de la pestaña conserva la misma solicitud. */ }
}
function limpiarPendienteMovCaja() {
  solicitudPendienteMovimientoCaja = null;
  try { sessionStorage.removeItem(CLAVE_PENDIENTE_MOV_CAJA); } catch (_) { /* sin almacenamiento */ }
}
function actualizarBloqueoMovCaja() {
  const activo = Boolean(turnoMovimientosCaja?.estado === 'abierto');
  const bloqueado = !activo || enviandoMovimientoCaja || Boolean(solicitudPendienteMovimientoCaja);
  const campos = elementoMovCaja('campos-movimiento-caja');
  if (campos) campos.disabled = bloqueado;
  const aviso = elementoMovCaja('aviso-reintento-movimiento');
  if (aviso) aviso.classList.toggle('hidden', !solicitudPendienteMovimientoCaja);
  const botonReintentar = elementoMovCaja('boton-reintentar-movimiento');
  if (botonReintentar) botonReintentar.disabled = enviandoMovimientoCaja;
  const botonGuardar = elementoMovCaja('boton-guardar-movimiento');
  if (botonGuardar) botonGuardar.textContent = enviandoMovimientoCaja ? 'Registrando...' : 'Registrar movimiento';
}

function mostrarMovimientosCaja(lista) {
  const contenedor = elementoMovCaja('lista-movimientos-caja');
  if (!contenedor) return;
  if (!lista.length) {
    contenedor.innerHTML = '<div class="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">Todavia no hay movimientos manuales en este turno.</div>';
    return;
  }
  contenedor.innerHTML = lista.map((m) => {
    const entrada = m.tipo === 'ingreso';
    const color = entrada ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50';
    const etiqueta = entrada ? 'Ingreso' : 'Retiro';
    return `<article class="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full px-3 py-1 text-xs font-black ${color}">${etiqueta}</span>
          <span class="text-xs font-bold text-slate-500">#${escapeMovCaja(m.id_movimiento)} · ${escapeMovCaja(m.categoria)}</span>
        </div>
        <p class="mt-2 break-words text-sm font-bold">${escapeMovCaja(m.motivo)}</p>
        <p class="mt-1 break-words text-xs text-slate-500">${fechaMovCaja(m.registrado_at)}${m.referencia ? ` · Ref. ${escapeMovCaja(m.referencia)}` : ''}</p>
      </div>
      <strong class="text-lg ${entrada ? 'text-emerald-700' : 'text-rose-700'}">${entrada ? '+' : '−'} ${monedaMovCaja(m.monto)}</strong>
    </article>`;
  }).join('');
}

async function cargarMovimientosCaja() {
  if (consultandoMovimientosCaja) return;
  consultandoMovimientosCaja = true;
  try {
    const respuesta = await solicitarMovCaja(RUTA_MOVIMIENTOS_CAJA);
    turnoMovimientosCaja = respuesta.data || null;
    const abierto = Boolean(turnoMovimientosCaja?.estado === 'abierto');
    elementoMovCaja('aviso-sin-turno')?.classList.toggle('hidden', abierto);
    elementoMovCaja('resumen-movimientos-caja')?.classList.toggle('hidden', !abierto);
    elementoMovCaja('contenido-movimientos-caja')?.classList.toggle('hidden', !abierto && !solicitudPendienteMovimientoCaja);
    if (abierto) {
      const datos = turnoMovimientosCaja;
      elementoMovCaja('id-turno-movimientos').textContent = `#${datos.id_turno}`;
      for (const [id, valor] of Object.entries({
        'mov-fondo': datos.fondo_inicial,
        'mov-ventas': datos.ventas_efectivo,
        'mov-ingresos': datos.total_ingresos,
        'mov-retiros': datos.total_retiros,
        'mov-teorico': datos.efectivo_teorico,
      })) elementoMovCaja(id).textContent = monedaMovCaja(valor);
      elementoMovCaja('contador-movimientos-caja').textContent = `${datos.cantidad_movimientos} movimiento(s)`;
      mostrarMovimientosCaja(respuesta.movimientos || []);
    }
  } catch (error) {
    mensajeMovCaja(error.message, 'error');
    turnoMovimientosCaja = null;
  } finally {
    consultandoMovimientosCaja = false;
    actualizarBloqueoMovCaja();
  }
}

function claveSeguraMovCaja() {
  if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  if (typeof window.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `menugo-${Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('Abre MenuGo por HTTPS o localhost para crear identificadores seguros.');
}

function datosFormularioMovCaja() {
  const tipo = elementoMovCaja('tipo-movimiento-caja').value;
  const categoria = elementoMovCaja('categoria-movimiento-caja').value;
  const monto = elementoMovCaja('monto-movimiento-caja').value.trim();
  const motivo = elementoMovCaja('motivo-movimiento-caja').value.trim();
  const referencia = elementoMovCaja('referencia-movimiento-caja').value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(monto) || Number(monto) <= 0 || !Number.isFinite(Number(monto))) {
    throw new Error('El monto debe ser positivo y tener como maximo dos decimales.');
  }
  if (!CATEGORIAS_MOV_CAJA[tipo]?.some((op) => op.id === categoria)) {
    throw new Error('Selecciona una categoria valida.');
  }
  if (motivo.length < 5 || motivo.length > 300 || referencia.length > 100) {
    throw new Error('Revisa el motivo (5-300 caracteres) y la referencia (maximo 100).');
  }
  if (!turnoMovimientosCaja?.id_turno) throw new Error('Abre un turno para registrar movimientos.');
  return { id_turno: turnoMovimientosCaja.id_turno, tipo, categoria, monto,
    motivo, referencia: referencia || null, idempotency_key: claveSeguraMovCaja() };
}

async function enviarMovimientoCaja(payload) {
  if (enviandoMovimientoCaja) return;
  enviandoMovimientoCaja = true;
  actualizarBloqueoMovCaja();
  try {
    const resultado = await solicitarMovCaja(RUTA_MOVIMIENTOS_CAJA, {
      method: 'POST', body: JSON.stringify(payload),
    });
    limpiarPendienteMovCaja();
    elementoMovCaja('form-movimiento-caja')?.reset();
    actualizarCategoriasMovCaja();
    mensajeMovCaja(resultado.repetido
      ? 'El movimiento ya estaba registrado; no se genero otro.'
      : 'Movimiento de efectivo registrado correctamente.', 'exito');
    await cargarMovimientosCaja();
  } catch (error) {
    if (error.status && error.status < 500) {
      // La API confirmo que NO acepto una nueva operacion.
      limpiarPendienteMovCaja();
      mensajeMovCaja(error.message, 'error');
      await cargarMovimientosCaja();
    } else {
      // Error de red, 5xx o respuesta perdida: NO crear otra clave.
      mensajeMovCaja('No se confirmó el registro. Reintenta la MISMA operación; no la dupliques. ' + error.message, 'error');
    }
  } finally {
    enviandoMovimientoCaja = false;
    actualizarBloqueoMovCaja();
  }
}

async function registrarMovimientoCajaUI(event) {
  event.preventDefault();
  if (enviandoMovimientoCaja || solicitudPendienteMovimientoCaja) return;
  try {
    const datos = datosFormularioMovCaja();
    if (!window.confirm(`¿Registrar ${datos.tipo} de S/ ${datos.monto}?`)) return;
    persistirPendienteMovCaja(datos); // antes del POST, por si la respuesta se pierde
    await enviarMovimientoCaja(datos);
  } catch (error) { mensajeMovCaja(error.message, 'error'); }
}

function configurarMovimientosCajaUI() {
  actualizarCategoriasMovCaja();
  restaurarPendienteMovCaja();
  elementoMovCaja('tipo-movimiento-caja')?.addEventListener('change', actualizarCategoriasMovCaja);
  elementoMovCaja('form-movimiento-caja')?.addEventListener('submit', registrarMovimientoCajaUI);
  elementoMovCaja('boton-refrescar-movimientos')?.addEventListener('click', cargarMovimientosCaja);
  elementoMovCaja('boton-reintentar-movimiento')?.addEventListener('click', () => {
    if (solicitudPendienteMovimientoCaja) enviarMovimientoCaja(solicitudPendienteMovimientoCaja);
  });
  if (solicitudPendienteMovimientoCaja) {
    mensajeMovCaja('Hay una operacion sin confirmar. Recuperala con el boton de reintento usando la misma clave.', 'info');
  }
  actualizarBloqueoMovCaja();
  cargarMovimientosCaja();
}

document.addEventListener('DOMContentLoaded', configurarMovimientosCajaUI);
