'use strict';

// MenuGo - Commit 22. Pantalla de impresion termica SIMULADA.
// Este archivo solo consulta un PDF previamente registrado (GET).
// No modifica cuentas, pagos ni comprobantes y no almacena tokens en URLs.
(function (global) {
  const RETORNOS_PERMITIDOS = new Set(['cajero.html', 'dividir_cuenta.html', 'historial_pagos.html', 'facturacion.html']);
  const DOM = typeof document !== 'undefined' ? document : null;
  const estado = { idPago: null, pdfUrl: null, carga: null, numeroSolicitud: 0 };

  function idPagoValido(valor) {
    const texto = String(valor ?? '').trim();
    if (!/^[1-9]\d{0,9}$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isSafeInteger(numero) ? numero : null;
  }

  function retornoSeguro(ruta) {
    return RETORNOS_PERMITIDOS.has(String(ruta || '')) ? ruta : 'cajero.html';
  }

  function rutaImpresora(idPago, retorno = 'cajero.html') {
    const id = idPagoValido(idPago);
    if (!id) throw new Error('El pago no tiene un identificador valido.');
    const parametros = new URLSearchParams({ pago: String(id), volver: retornoSeguro(retorno) });
    return `impresora_virtual.html?${parametros.toString()}`;
  }

  function rutaEndpointTicket(apiBase, idPago, ancho) {
    const id = idPagoValido(idPago);
    if (!id) throw new Error('ID de pago invalido.');
    const formato = String(ancho);
    if (!['58', '80'].includes(formato)) throw new Error('Ancho de ticket invalido.');
    return `${String(apiBase || '').replace(/\/+$/, '')}/cajero/pagos/${id}/ticket.pdf?ancho=${formato}`;
  }

  function porId(id) { return DOM?.getElementById(id) || null; }

  // Se utiliza en el cobro normal y en las subcuentas. El usuario decide si desea imprimir.
  function ofrecerImpresion(pago, opciones = {}) {
    const id = idPagoValido(pago?.id_pago);
    if (!id || !DOM?.body) return false;
    porId('modal-ticket-confirmacion')?.remove();

    const modal = DOM.createElement('section');
    modal.id = 'modal-ticket-confirmacion';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'titulo-confirmacion-ticket');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm';
    // HTML fijo: los valores de la API solo se asignan con textContent, nunca con innerHTML.
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-3xl text-emerald-700" aria-hidden="true">✓</div>
        <p class="text-xs font-black uppercase tracking-widest text-emerald-700">Operación confirmada</p>
        <h2 id="titulo-confirmacion-ticket" class="mt-2 text-2xl font-black text-slate-950">¡Pago registrado!</h2>
        <p id="detalle-confirmacion-ticket" class="mt-2 text-sm font-semibold text-slate-600"></p>
        <p class="mt-3 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">Puedes simular la salida del ticket y ver su PDF. Esta acción NO crea otro cobro.</p>
        <a id="ir-impresora-ticket" class="mt-5 block rounded-xl bg-orange-500 px-5 py-3 text-center text-sm font-black text-white hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900" href="#">▤ Abrir impresora virtual</a>
        <button id="cerrar-modal-ticket" type="button" class="mt-2 w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Continuar sin ticket</button>
      </div>`;
    DOM.body.appendChild(modal);

    const importe = Number(pago.monto);
    const montoTexto = Number.isFinite(importe) && importe >= 0 ? ` · S/ ${importe.toFixed(2)}` : '';
    modal.querySelector('#detalle-confirmacion-ticket').textContent = `Pago #${id}${montoTexto}. Tu operación está guardada en MenuGo.`;
    modal.querySelector('#ir-impresora-ticket').href = rutaImpresora(id, opciones.retorno);

    const quitar = () => { modal.removeEventListener('keydown', teclado); modal.remove(); };
    const teclado = (evento) => { if (evento.key === 'Escape') quitar(); };
    modal.querySelector('#cerrar-modal-ticket').addEventListener('click', quitar);
    modal.addEventListener('keydown', teclado);
    modal.querySelector('#ir-impresora-ticket').focus();
    return true;
  }

  function estadoVisible(mensaje, tipo = 'info') {
    const etiqueta = porId('estado-impresora');
    if (!etiqueta) return;
    etiqueta.textContent = mensaje;
    etiqueta.className = 'mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ' +
      (tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : tipo === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-slate-200 bg-slate-50 text-slate-700');
  }

  function controlesActivos(habilitar) {
    for (const id of ['btn-simular-impresora', 'btn-descargar-impresora', 'btn-imprimir-impresora']) {
      const boton = porId(id);
      if (boton) boton.disabled = !habilitar;
    }
  }

  function mostrarError(mensaje) {
    const error = porId('error-pdf-impresora');
    if (error) { error.textContent = mensaje; error.classList.remove('hidden'); }
    porId('btn-reintentar-pdf-impresora')?.classList.remove('hidden');
    estadoVisible(mensaje, 'error');
  }

  function limpiarError() {
    const error = porId('error-pdf-impresora');
    if (error) { error.textContent = ''; error.classList.add('hidden'); }
    porId('btn-reintentar-pdf-impresora')?.classList.add('hidden');
  }

  function liberarPdf() {
    const actual = estado.pdfUrl;
    estado.pdfUrl = null;
    const visor = porId('visor-pdf-impresora');
    if (visor) { visor.src = 'about:blank'; visor.classList.add('hidden'); }
    if (actual) URL.revokeObjectURL(actual);
    controlesActivos(false);
  }

  function simularImpresion() {
    if (!estado.pdfUrl) return false;
    const papel = porId('papel-impresora');
    if (!papel) return false;
    papel.classList.remove('imprimiendo', 'impreso');
    // Reinicia la animacion para permitir repetir la simulacion con el mismo PDF.
    void papel.offsetWidth;
    const reducido = typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    papel.classList.add(reducido ? 'impreso' : 'imprimiendo');
    estadoVisible(reducido
      ? 'Simulación completada. El documento está disponible para descargar o imprimir.'
      : 'Simulando la salida del ticket…', reducido ? 'ok' : 'info');
    return true;
  }

  async function cargarTicketPdf() {
    if (!estado.idPago || !DOM) return;
    estado.carga?.abort();
    const controlador = new AbortController();
    estado.carga = controlador;
    const solicitud = ++estado.numeroSolicitud;
    limpiarError();
    liberarPdf();
    const placeholder = porId('placeholder-pdf-impresora');
    if (placeholder) { placeholder.classList.remove('hidden'); placeholder.textContent = 'Generando vista previa desde PostgreSQL…'; }
    estadoVisible('Consultando el PDF de este pago registrado…');
    const ancho = String(porId('ancho-ticket-impresora')?.value || '80');
    const papel = porId('papel-impresora');
    if (papel) { papel.dataset.ancho = ancho; papel.classList.remove('imprimiendo', 'impreso'); }
    const textoAncho = porId('ancho-papel-impresora');
    if (textoAncho) textoAncho.textContent = `${ancho} mm`;

    try {
      if (global.MENUGO_PERSONAL_BLOQUEADO || typeof global.obtenerTokenPersonal !== 'function' ||
          !global.obtenerTokenPersonal('cajero')) {
        throw new Error('Debes iniciar sesion como Cajero para consultar el ticket.');
      }
      const origen = global.MENUGO_API || 'http://localhost:4000/api';
      const url = rutaEndpointTicket(origen, estado.idPago, ancho);
      const cabeceras = typeof global.headersAutenticadosPersonal === 'function'
        ? global.headersAutenticadosPersonal('cajero', { Accept: 'application/pdf' })
        : { Authorization: `Bearer ${global.obtenerTokenPersonal('cajero')}`, Accept: 'application/pdf' };
      const respuesta = await global.fetch(url, {
        method: 'GET', headers: cabeceras, cache: 'no-store', signal: controlador.signal,
      });
      if (!respuesta.ok) {
        let mensaje = `No se pudo abrir el ticket (HTTP ${respuesta.status}).`;
        try { const datos = await respuesta.json(); if (datos.message) mensaje = datos.message; } catch (_) {}
        if (respuesta.status === 401) {
          global.localStorage?.removeItem('menugo_cajero_sesion');
          global.location?.replace('login.html?access=required');
        }
        throw new Error(mensaje);
      }
      const tipo = respuesta.headers?.get('content-type') || '';
      if (!tipo.toLowerCase().includes('application/pdf')) {
        throw new Error('El servidor no devolvio un PDF valido. Revisa el endpoint del commit 21.');
      }
      const blob = await respuesta.blob();
      if (!blob || !blob.size) throw new Error('El ticket PDF llego vacio.');
      if (solicitud !== estado.numeroSolicitud || controlador.signal.aborted) return;
      const urlPdf = URL.createObjectURL(blob);
      estado.pdfUrl = urlPdf;
      const visor = porId('visor-pdf-impresora');
      if (visor) { visor.src = urlPdf; visor.classList.remove('hidden'); }
      if (placeholder) placeholder.classList.add('hidden');
      controlesActivos(true);
      estadoVisible(`PDF de ${ancho} mm generado correctamente para el pago #${estado.idPago}.`, 'ok');
      simularImpresion();
    } catch (error) {
      if (controlador.signal.aborted || solicitud !== estado.numeroSolicitud) return;
      mostrarError(error?.message || 'No se pudo cargar el ticket.');
    }
  }

  function descargarPdf() {
    if (!estado.pdfUrl || !DOM) return false;
    const formato = String(porId('ancho-ticket-impresora')?.value || '80');
    const enlace = DOM.createElement('a');
    enlace.href = estado.pdfUrl;
    enlace.download = `menugo-ticket-pago-${estado.idPago}-${formato}mm.pdf`;
    DOM.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    estadoVisible('Descarga solicitada. El cobro original permanece sin cambios.', 'ok');
    return true;
  }

  function abrirParaImprimir() {
    if (!estado.pdfUrl) return false;
    // El clic abre el PDF real en el visor del navegador, que ofrece su propio dialogo
    // de impresion. No se promete impresion automatica/silenciosa sin hardware.
    const ventana = global.open(estado.pdfUrl, '_blank');
    if (!ventana) {
      mostrarError('El navegador bloqueo la pestaña del PDF. Habilita las ventanas emergentes o usa Descargar PDF.');
      return false;
    }
    try { ventana.opener = null; } catch (_) {}
    estadoVisible('PDF abierto. Pulsa Ctrl+P o el icono Imprimir y elige Guardar como PDF.', 'ok');
    return true;
  }

  function iniciarPantalla() {
    if (!porId('pantalla-impresora-menugo') || global.MENUGO_PERSONAL_BLOQUEADO) return;
    const parametros = new URLSearchParams(global.location.search);
    estado.idPago = idPagoValido(parametros.get('pago'));
    const volver = retornoSeguro(parametros.get('volver'));
    const enlaceVolver = porId('enlace-volver-impresora');
    if (enlaceVolver) {
      enlaceVolver.href = volver;
      const nombres = {
        'cajero.html': '← Volver a Caja',
        'dividir_cuenta.html': '← Volver a dividir cuentas',
        'historial_pagos.html': '← Volver al historial',
        'facturacion.html': '← Volver a comprobantes',
      };
      enlaceVolver.textContent = nombres[volver] || nombres['cajero.html'];
    }
    if (!estado.idPago) {
      mostrarError('No se encontro un identificador de pago valido. Regresa a Caja y registra un pago confirmado.');
      const placeholder = porId('placeholder-pdf-impresora');
      if (placeholder) placeholder.textContent = 'No hay un pago seleccionado.';
      controlesActivos(false);
      return;
    }
    for (const id of ['numero-pago-impresora', 'pago-papel-impresora']) {
      const el = porId(id); if (el) el.textContent = `#${estado.idPago}`;
    }
    const papel = porId('papel-impresora');
    papel?.addEventListener('animationend', (evento) => {
      if (evento.animationName !== 'menugo-papel-salir') return;
      papel.classList.remove('imprimiendo');
      papel.classList.add('impreso');
      estadoVisible('Simulación completada. El PDF está listo para imprimir o descargar.', 'ok');
    });
    porId('ancho-ticket-impresora')?.addEventListener('change', cargarTicketPdf);
    porId('btn-reintentar-pdf-impresora')?.addEventListener('click', cargarTicketPdf);
    porId('btn-simular-impresora')?.addEventListener('click', simularImpresion);
    porId('btn-descargar-impresora')?.addEventListener('click', descargarPdf);
    porId('btn-imprimir-impresora')?.addEventListener('click', abrirParaImprimir);
    global.addEventListener('pagehide', () => { estado.carga?.abort(); liberarPdf(); }, { once: true });
    cargarTicketPdf();
  }

  const api = {
    ofrecerImpresion, iniciarPantalla, validarIdPago: idPagoValido,
    retornoSeguro, rutaImpresora, rutaEndpointTicket,
  };
  global.MenuGoTicket = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (DOM) DOM.addEventListener('DOMContentLoaded', iniciarPantalla);
})(typeof window !== 'undefined' ? window : globalThis);
