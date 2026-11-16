'use strict';

// MenuGo - Commit 13. Apertura de turno del cajero autenticado.
// La autoridad para abrir y consultar turnos esta siempre en el backend.
window.MENUGO_TURNO_CAJA_ABIERTO = false;
let consultandoTurnoCaja = false;
let abriendoTurnoCaja = false;

function mensajeAperturaCaja(mensaje, error = false) {
  const elemento = document.getElementById('mensaje-turno-caja');
  if (!elemento) return;
  elemento.textContent = mensaje || '';
  elemento.className = `mt-3 rounded-xl p-3 text-sm font-semibold ${error
    ? 'border border-red-200 bg-red-50 text-red-800'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`;
  elemento.classList.toggle('hidden', !mensaje);
}

function dineroTurnoCaja(valor) {
  return `S/ ${Number(valor || 0).toFixed(2)}`;
}

function presentarTurnoCaja(turno) {
  const formulario = document.getElementById('form-apertura-turno-caja');
  const resumen = document.getElementById('resumen-turno-caja');
  const estado = document.getElementById('estado-turno-caja');
  if (!formulario || !resumen || !estado) return;

  const abierto = Boolean(turno && turno.estado === 'abierto');
  window.MENUGO_TURNO_CAJA_ABIERTO = abierto;
  formulario.classList.toggle('hidden', abierto);
  resumen.classList.toggle('hidden', !abierto);
  estado.textContent = abierto ? `Turno #${turno.id_turno} abierto` : 'Sin turno abierto';
  estado.className = `rounded-full px-3 py-1.5 text-xs font-black ${abierto
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-amber-100 text-amber-800'}`;

  if (abierto) {
    const fecha = new Date(turno.abierto_at);
    document.getElementById('turno-id-caja').textContent = String(turno.id_turno);
    document.getElementById('turno-fondo-caja').textContent = dineroTurnoCaja(turno.fondo_inicial);
    document.getElementById('turno-fecha-caja').textContent = Number.isNaN(fecha.getTime())
      ? '-' : fecha.toLocaleString('es-PE', { timeZone: 'America/Lima' });
    document.getElementById('turno-cobros-caja').textContent = String(turno.cantidad_pagos || 0);
    document.getElementById('turno-total-caja').textContent = dineroTurnoCaja(turno.total_cobrado);
    document.getElementById('turno-efectivo-caja').textContent = dineroTurnoCaja(turno.ventas_efectivo);
  }
}

async function cargarTurnoCaja() {
  if (consultandoTurnoCaja) return;
  consultandoTurnoCaja = true;
  const estado = document.getElementById('estado-turno-caja');
  if (estado) estado.textContent = 'Consultando turno...';
  try {
    const respuesta = await apiCaja('/cajero/turnos/actual');
    presentarTurnoCaja(respuesta.data || null);
    mensajeAperturaCaja('');
  } catch (error) {
    window.MENUGO_TURNO_CAJA_ABIERTO = false;
    if (estado) estado.textContent = 'No se pudo consultar el turno';
    // Si falla la consulta, no habilitamos cobros por suposicion.
    document.getElementById('form-apertura-turno-caja')?.classList.add('hidden');
    document.getElementById('resumen-turno-caja')?.classList.add('hidden');
    mensajeAperturaCaja(error.message || 'Error al consultar el turno.', true);
  } finally {
    consultandoTurnoCaja = false;
  }
}

async function abrirTurnoCaja(event) {
  event.preventDefault();
  if (abriendoTurnoCaja) return;
  const fondo = document.getElementById('fondo-inicial-caja')?.value.trim() || '';
  const observaciones = document.getElementById('observaciones-apertura-caja')?.value.trim() || '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(fondo)) {
    return mensajeAperturaCaja('Ingresa un fondo inicial valido (ejemplo: 100.00).', true);
  }
  if (observaciones.length > 500) {
    return mensajeAperturaCaja('Las observaciones deben tener 500 caracteres como maximo.', true);
  }
  abriendoTurnoCaja = true;
  const boton = document.getElementById('boton-abrir-turno-caja');
  if (boton) { boton.disabled = true; boton.textContent = 'Abriendo turno...'; }
  try {
    await apiCaja('/cajero/turnos', {
      method: 'POST',
      body: JSON.stringify({ fondo_inicial: fondo, observaciones }),
    });
    await cargarTurnoCaja();
    // El fondo se guarda una sola vez en PostgreSQL, no en localStorage.
    const campo = document.getElementById('observaciones-apertura-caja');
    if (campo) campo.value = '';
  } catch (error) {
    mensajeAperturaCaja(error.message || 'No se pudo abrir el turno.', true);
    if (error.status === 409) await cargarTurnoCaja();
  } finally {
    abriendoTurnoCaja = false;
    if (boton) { boton.disabled = false; boton.textContent = 'Abrir mi turno'; }
  }
}

// El cobro exitoso del modulo existente actualiza el resumen del turno.
window.actualizarTurnoCaja = cargarTurnoCaja;
document.addEventListener('DOMContentLoaded', cargarTurnoCaja);
