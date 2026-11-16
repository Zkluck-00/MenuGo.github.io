'use strict';

// MenuGo - Commit 23. Vista previa y reimpresion de tickets existentes.
// Opera exclusivamente con GET; nunca crea ni modifica pagos.
(function (global) {
  const DOM = typeof document !== 'undefined' ? document : null;
  const estado = { modal: null, urlPdf: null, controlador: null, solicitud: 0, idPago: null, origenFoco: null };
  const retornos = new Set(['historial_pagos.html', 'facturacion.html']);

  function idPagoValido(valor) {
    const texto = String(valor ?? '').trim();
    if (!/^[1-9]\d{0,9}$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isSafeInteger(numero) ? numero : null;
  }

  function retornoValido(valor) {
    return retornos.has(String(valor || '')) ? valor : 'historial_pagos.html';
  }

  function rutaTicket(idPago, retorno) {
    const id = idPagoValido(idPago);
    if (!id) throw new Error('El identificador del pago es invalido.');
    if (!global.MenuGoTicket?.rutaImpresora) {
      throw new Error('No se pudo cargar la impresora virtual.');
    }
    return global.MenuGoTicket.rutaImpresora(id, retornoValido(retorno));
  }

  function rutaPdf(apiBase, idPago, ancho) {
    const id = idPagoValido(idPago);
    if (!id) throw new Error('El identificador del pago es invalido.');
    if (!['58', '80'].includes(String(ancho))) throw new Error('Ancho de papel invalido.');
    const base = String(apiBase || '').replace(/\/+$/, '');
    return `${base}/cajero/pagos/${id}/ticket.pdf?ancho=${ancho}`;
  }

  function actual(selector) {
    return estado.modal?.querySelector(selector) || null;
  }

  function mensaje(texto, tipo = 'info') {
    const etiqueta = actual('#estado-vista-ticket');
    if (!etiqueta) return;
    etiqueta.textContent = texto;
    etiqueta.className = 'mt-3 rounded-xl border px-4 py-3 text-sm font-semibold ' + (
      tipo === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' :
      tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
      'border-slate-200 bg-slate-50 text-slate-700'
    );
  }

  function habilitarAcciones(habilitar) {
    for (const id of ['#descargar-vista-ticket', '#imprimir-vista-ticket']) {
      const boton = actual(id);
      if (boton) boton.disabled = !habilitar;
    }
  }

  function liberarPdf() {
    const visor = actual('#visor-vista-ticket');
    if (visor) { visor.src = 'about:blank'; visor.classList.add('hidden'); }
    if (estado.urlPdf) global.URL.revokeObjectURL(estado.urlPdf);
    estado.urlPdf = null;
    habilitarAcciones(false);
  }

  function detenerCarga() {
    estado.solicitud++;
    estado.controlador?.abort();
    estado.controlador = null;
    liberarPdf();
  }

  function cerrarVistaPrevia() {
    detenerCarga();
    const anterior = estado.origenFoco;
    estado.modal?.remove();
    estado.modal = null;
    estado.idPago = null;
    estado.origenFoco = null;
    if (anterior && typeof anterior.focus === 'function') anterior.focus();
  }

  async function cargarPdf() {
    if (!estado.modal || !estado.idPago) return false;
    detenerCarga();
    const numero = estado.solicitud;
    const controlador = new AbortController();
    estado.controlador = controlador;
    const ancho = actual('#ancho-vista-ticket')?.value || '80';
    const visor = actual('#visor-vista-ticket');
    const placeholder = actual('#placeholder-vista-ticket');
    if (placeholder) { placeholder.textContent = 'Consultando ticket en MenuGo...'; placeholder.classList.remove('hidden'); }
    mensaje(`Consultando el PDF de ${ancho} mm del pago #${estado.idPago}...`);

    try {
      const token = global.obtenerTokenPersonal?.('cajero');
      if (global.MENUGO_PERSONAL_BLOQUEADO || !token) {
        throw new Error('Debes iniciar sesion como Cajero para ver este ticket.');
      }
      const headers = global.headersAutenticadosPersonal?.('cajero', { Accept: 'application/pdf' }) ||
        { Authorization: `Bearer ${token}`, Accept: 'application/pdf' };
      if (headers.Authorization !== `Bearer ${token}`) {
        throw new Error('La sesion no tiene credenciales de autorizacion validas.');
      }
      const url = rutaPdf(global.MENUGO_API || 'http://localhost:4000/api', estado.idPago, ancho);
      const res = await global.fetch(url, {
        method: 'GET', headers, cache: 'no-store', signal: controlador.signal,
      });
      if (!res.ok) {
        let detalle = '';
        try { detalle = (await res.json())?.message || ''; } catch (_) {}
        if (res.status === 401) {
          global.localStorage?.removeItem('menugo_cajero_sesion');
          global.location?.replace('login.html?access=required');
        }
        const defecto = res.status === 403 ? 'No tienes permiso para imprimir este pago.' :
          res.status === 404 ? 'No existe un pago confirmado con ese identificador.' :
          `No se pudo recuperar el ticket (HTTP ${res.status}).`;
        throw new Error(detalle || defecto);
      }
      const tipo = res.headers?.get('content-type') || '';
      if (!tipo.toLowerCase().includes('application/pdf')) {
        throw new Error('La respuesta del servidor no corresponde a un PDF.');
      }
      const archivo = await res.blob();
      if (!archivo?.size) throw new Error('El documento recibido esta vacio.');
      if (numero !== estado.solicitud || controlador.signal.aborted) return false;
      estado.urlPdf = global.URL.createObjectURL(archivo);
      if (visor) { visor.src = estado.urlPdf; visor.classList.remove('hidden'); }
      placeholder?.classList.add('hidden');
      habilitarAcciones(true);
      mensaje(`Ticket del pago #${estado.idPago} listo (${ancho} mm).`, 'ok');
      return true;
    } catch (error) {
      if (controlador.signal.aborted || numero !== estado.solicitud) return false;
      if (placeholder) { placeholder.textContent = 'No se pudo mostrar el ticket.'; placeholder.classList.remove('hidden'); }
      mensaje(error?.message || 'No se pudo abrir el ticket.', 'error');
      return false;
    }
  }

  function descargarPdf() {
    if (!DOM || !estado.urlPdf || !estado.idPago) return false;
    const ancho = actual('#ancho-vista-ticket')?.value || '80';
    const enlace = DOM.createElement('a');
    enlace.href = estado.urlPdf;
    enlace.download = `menugo-ticket-pago-${estado.idPago}-${ancho}mm.pdf`;
    DOM.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    mensaje('Descarga solicitada. No se ha generado un nuevo cobro.', 'ok');
    return true;
  }

  function abrirParaImprimir() {
    if (!estado.urlPdf) return false;
    const ventana = global.open(estado.urlPdf, '_blank');
    if (!ventana) {
      mensaje('El navegador bloqueo la ventana del PDF. Permite ventanas emergentes o descargalo.', 'error');
      return false;
    }
    try { ventana.opener = null; } catch (_) {}
    mensaje('PDF abierto: usa Ctrl+P y selecciona Guardar como PDF.', 'ok');
    return true;
  }

  function abrirVistaPrevia(idPago, boton = null) {
    const id = idPagoValido(idPago);
    if (!id || !DOM?.body) return false;
    cerrarVistaPrevia();
    estado.idPago = id;
    estado.origenFoco = boton;
    const modal = DOM.createElement('section');
    modal.id = 'modal-vista-ticket';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'titulo-vista-ticket');
    modal.className = 'fixed inset-0 z-[110] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm';
    // El HTML es estatico. Los datos del pago se asignan con textContent.
    modal.innerHTML = `
      <div class="mx-auto my-3 w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-black uppercase tracking-wider text-orange-600">MenuGo · Historial de caja</p>
            <h2 id="titulo-vista-ticket" class="mt-1 text-2xl font-black text-slate-950">Vista previa del ticket</h2>
            <p id="referencia-vista-ticket" class="mt-1 text-sm font-semibold text-slate-500"></p>
          </div>
          <button id="cerrar-vista-ticket" type="button" aria-label="Cerrar vista previa" class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black hover:bg-slate-50">Cerrar ×</button>
        </div>
        <label class="mt-5 block text-sm font-bold text-slate-700">Formato de papel
          <select id="ancho-vista-ticket" class="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 sm:max-w-xs">
            <option value="80">80 mm · Ticket estándar</option>
            <option value="58">58 mm · Ticket compacto</option>
          </select>
        </label>
        <div class="relative mt-5 min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          <p id="placeholder-vista-ticket" class="p-8 text-center text-sm font-semibold text-slate-600" role="status">Preparando ticket...</p>
          <iframe id="visor-vista-ticket" title="Vista previa del ticket PDF" class="hidden h-[420px] w-full bg-white sm:h-[540px]" src="about:blank"></iframe>
        </div>
        <p id="estado-vista-ticket" role="status" class="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold">Consultando ticket...</p>
        <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button id="descargar-vista-ticket" disabled type="button" class="rounded-xl bg-orange-500 px-3 py-3 text-sm font-black text-white disabled:opacity-40">Descargar PDF</button>
          <button id="imprimir-vista-ticket" disabled type="button" class="rounded-xl bg-emerald-600 px-3 py-3 text-sm font-black text-white disabled:opacity-40">Abrir para imprimir</button>
          <button id="simular-vista-ticket" type="button" class="rounded-xl bg-slate-950 px-3 py-3 text-sm font-black text-white">Simular reimpresión</button>
        </div>
        <p class="mt-4 text-xs leading-5 text-slate-500">Para imprimir sin impresora, abre el PDF y usa Ctrl+P → Guardar como PDF. Documento interno de demostración, no válido como comprobante electrónico SUNAT.</p>
      </div>`;
    DOM.body.appendChild(modal);
    estado.modal = modal;
    actual('#referencia-vista-ticket').textContent = `Pago registrado #${id} · Solo lectura`;
    habilitarAcciones(false);
    actual('#cerrar-vista-ticket').addEventListener('click', cerrarVistaPrevia);
    actual('#ancho-vista-ticket').addEventListener('change', cargarPdf);
    actual('#descargar-vista-ticket').addEventListener('click', descargarPdf);
    actual('#imprimir-vista-ticket').addEventListener('click', abrirParaImprimir);
    actual('#simular-vista-ticket').addEventListener('click', () => {
      global.location.assign(rutaTicket(id, global.location.pathname.split('/').pop()));
    });
    modal.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') cerrarVistaPrevia(); });
    actual('#cerrar-vista-ticket').focus();
    cargarPdf();
    return true;
  }

  function enlazarContenedor(idContenedor, retorno) {
    const contenedor = DOM?.getElementById(idContenedor);
    if (!contenedor || !retornos.has(retorno) || contenedor.dataset.historialTicketsVinculado) return false;
    contenedor.dataset.historialTicketsVinculado = '1';
    contenedor.addEventListener('click', (evento) => {
      const boton = evento.target?.closest?.('button[data-ticket-accion]');
      if (!boton || !contenedor.contains(boton)) return;
      const id = idPagoValido(boton.dataset.pago);
      if (!id) return;
      if (boton.dataset.ticketAccion === 'ver') abrirVistaPrevia(id, boton);
      if (boton.dataset.ticketAccion === 'simular') global.location.assign(rutaTicket(id, retorno));
    });
    return true;
  }

  const api = {
    idPagoValido, retornoValido, rutaTicket, rutaPdf, abrirVistaPrevia,
    cerrarVistaPrevia, cargarPdf, descargarPdf, abrirParaImprimir, enlazarContenedor,
  };
  global.MenuGoHistorialTicket = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (DOM) global.addEventListener('pagehide', cerrarVistaPrevia);
})(typeof window !== 'undefined' ? window : globalThis);
