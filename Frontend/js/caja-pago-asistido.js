'use strict';

// MenuGo - asistencia visual de cobro.
// Nunca crea pagos ni autoriza transacciones bancarias: esos pasos siguen en caja.js
// y en el POS/aplicacion real del comercio. La vista previa NO es un comprobante emitido.
(function (global) {
  const DOM = typeof document === 'undefined' ? null : document;
  const YAPE_QR_REAL = '../img/qr-yape-comercio.png';
  const YAPE_QR_DEMO = '../img/qr-yape-demo.png';
  const estado = {
    cuenta: null,
    totalCentavos: null,
    panel: null,
    demoPos: 0,
    escucharInput: null,
    escucharCambio: null,
    escucharClick: null,
  };

  function escapeHTML(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function dinero(centavos) {
    return `S/ ${(Number(centavos) / 100).toFixed(2)}`;
  }

  function centavos(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) return 0;
    return Math.round(n * 100);
  }

  function metodoExterno(metodo) {
    return ['Yape', 'Plin', 'Tarjeta credito', 'Tarjeta debito'].includes(String(metodo || ''));
  }

  function metodoTarjeta(metodo) {
    return metodo === 'Tarjeta credito' || metodo === 'Tarjeta debito';
  }

  function modeloTicketPrevio(cuenta, detallesSeleccionados, opciones = {}) {
    const detallePorId = new Map((cuenta?.detalles || [])
      .map((detalle) => [String(detalle.id_detalle_producto), detalle]));
    const acumulado = new Map();
    let total = 0;
    for (const item of detallesSeleccionados || []) {
      const importe = centavos(item.monto);
      if (!importe) continue;
      total += importe;
      const detalle = detallePorId.get(String(item.id_detalle_producto));
      const nombre = String(detalle?.nombre || 'Producto');
      const clave = `${nombre}\u0000${importe}`;
      const previo = acumulado.get(clave);
      if (previo) {
        previo.cantidad += 1;
        previo.importe += importe;
      } else {
        acumulado.set(clave, { nombre, cantidad: 1, importe });
      }
    }
    return {
      etiqueta: String(cuenta?.etiqueta || 'Cuenta'),
      lineas: Array.from(acumulado.values()),
      totalCentavos: total,
      metodo: String(opciones.metodo || 'Efectivo'),
      documento: String(opciones.documento || ''),
      tipo: opciones.tipo === 'factura' ? 'FACTURA INTERNA' : 'BOLETA INTERNA',
      pagadoPor: String(opciones.pagadoPor || 'Cliente'),
    };
  }

  function datosActuales() {
    if (!DOM || !estado.cuenta) return null;
    const seleccionados = Array.from(DOM.querySelectorAll('.item-cobro-caja:checked'))
      .map((entrada) => ({
        id_detalle_producto: entrada.dataset.id,
        monto: entrada.dataset.monto,
      }));
    return modeloTicketPrevio(estado.cuenta, seleccionados, {
      metodo: DOM.getElementById('metodo-cobro-caja')?.value || 'Efectivo',
      documento: DOM.getElementById('documento-caja')?.value || '',
      tipo: DOM.getElementById('comprobante-caja')?.value || 'boleta',
      pagadoPor: DOM.getElementById('pagado-por-caja')?.value || 'Cliente',
    });
  }

  function actualizarVistaPrevia() {
    const modelo = datosActuales();
    const destino = DOM?.getElementById('contenido-ticket-previo-caja');
    if (!modelo || !destino) return;

    // Si se modifica el importe después de verificar un cobro externo,
    // se exige una nueva confirmación; el POS/Yape deben coincidir en importe.
    if (estado.totalCentavos !== null && estado.totalCentavos !== modelo.totalCentavos) {
      const confirmado = DOM.getElementById('confirmacion-externa-caja');
      if (confirmado?.checked) {
        confirmado.checked = false;
        if (typeof global.actualizarBotonCobroCaja === 'function') global.actualizarBotonCobroCaja();
      }
      estado.demoPos = 0;
      actualizarPantallaPos();
    }
    estado.totalCentavos = modelo.totalCentavos;

    const lineas = modelo.lineas.map((linea) => `
      <div class="flex items-start justify-between gap-2 py-1 text-xs">
        <span class="min-w-0 flex-1 break-words">${linea.cantidad} x ${escapeHTML(linea.nombre)}</span>
        <strong class="shrink-0 text-right">${dinero(linea.importe)}</strong>
      </div>`).join('');

    destino.innerHTML = `
      <div class="relative mx-auto max-w-[360px] overflow-hidden rounded-sm border border-slate-200 bg-white px-5 py-6 font-mono text-slate-950 shadow-lg">
        <div class="text-center">
          <img src="../img/Log.png" alt="Logo MenuGo" class="mx-auto mb-2 h-16 w-16 object-contain" />
          <p class="text-lg font-black tracking-widest">MENUGO</p>
          <p class="mt-1 text-[10px] uppercase tracking-widest text-slate-600">${modelo.tipo}</p>
          <p class="mt-2 rounded bg-orange-100 px-2 py-1 text-[10px] font-black text-orange-800">VISTA PREVIA · NO EMITIDO</p>
        </div>
        <div class="my-4 border-t border-dashed border-slate-400"></div>
        <div class="space-y-1 text-[11px]">
          <p><strong>Cuenta:</strong> ${escapeHTML(modelo.etiqueta)}</p>
          <p><strong>Cliente:</strong> ${escapeHTML(modelo.pagadoPor)}</p>
          <p><strong>Pago:</strong> ${escapeHTML(modelo.metodo)}</p>
          ${modelo.documento ? `<p><strong>Documento:</strong> ${escapeHTML(modelo.documento)}</p>` : ''}
        </div>
        <div class="my-4 border-t border-dashed border-slate-400"></div>
        <p class="mb-2 text-[10px] font-bold uppercase tracking-wide">Productos seleccionados</p>
        <div>${lineas || '<p class="text-xs text-slate-500">Selecciona productos.</p>'}</div>
        <div class="my-3 border-t border-dashed border-slate-400"></div>
        <div class="flex justify-between gap-2 text-base font-black"><span>TOTAL</span><span>${dinero(modelo.totalCentavos)}</span></div>
        <p class="mt-4 text-center text-[10px] leading-4 text-slate-500">El ticket definitivo se genera desde el pago confirmado en MenuGo.</p>
      </div>`;
    const posMonto = DOM.getElementById('importe-pos-caja');
    if (posMonto) posMonto.textContent = dinero(modelo.totalCentavos);
    const yapeMonto = DOM.getElementById('importe-yape-caja');
    if (yapeMonto) yapeMonto.textContent = dinero(modelo.totalCentavos);
  }

  function bloqueConfirmacion(metodo) {
    const operacion = metodoTarjeta(metodo) ? 'POS del comercio' : `aplicación ${metodo}`;
    return `<label class="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold text-slate-800">
      <input id="confirmacion-externa-caja" type="checkbox" class="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" />
      <span>Confirmo que comprobé una operación <strong>real y aprobada</strong> en la ${escapeHTML(operacion)}, por el importe exacto de esta cuenta. La demostración no cuenta como confirmación.</span>
    </label>`;
  }

  function pantallaYape() {
    return `<section id="ayuda-yape-caja" class="mt-3 rounded-2xl border border-purple-200 bg-purple-50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-black text-purple-950">Cobro con Yape</h4><span class="rounded-full bg-purple-200 px-2.5 py-1 text-[10px] font-black text-purple-900">QR del comercio</span></div>
      <p class="mt-1 text-xs font-semibold text-purple-800">1. Muestra el QR al cliente. 2. Verifica en tu Yape de negocio que recibiste <strong id="importe-yape-caja">S/ 0.00</strong>. 3. Escribe la referencia y confirma.</p>
      <div class="mx-auto mt-3 max-w-[210px] rounded-2xl bg-white p-3 shadow-sm">
        <img id="codigo-yape-caja" src="${YAPE_QR_REAL}" alt="QR del comercio para Yape" class="mx-auto aspect-square w-full object-contain" />
        <p id="tipo-codigo-yape-caja" class="mt-2 text-center text-[10px] font-extrabold uppercase text-slate-600">Comprobando QR configurado...</p>
      </div>
      <p class="mt-3 text-[11px] font-semibold leading-5 text-purple-900">El sistema no consulta el banco ni confirma transferencias automáticamente. El cajero debe verificar el abono en la aplicación real.</p>
      ${bloqueConfirmacion('Yape')}
    </section>`;
  }

  function pantallaPlin() {
    return `<section class="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h4 class="font-black text-blue-950">Cobro con Plin</h4>
      <p class="mt-2 text-xs font-semibold leading-5 text-blue-900">Solicita el pago usando los datos o QR oficiales de Plin de tu comercio. Comprueba el abono en tu aplicación y anota el número de operación arriba. MenuGo no valida bancos automáticamente.</p>
      ${bloqueConfirmacion('Plin')}
    </section>`;
  }

  function pantallaPos(metodo) {
    return `<section id="ayuda-pos-caja" class="mt-3 rounded-2xl border border-slate-300 bg-white p-3">
      <div class="rounded-[24px] bg-slate-950 p-4 text-white shadow-xl shadow-slate-950/20">
        <div class="flex items-center justify-between"><p class="text-xs font-black tracking-[.15em] text-emerald-400">MENUGO · POS</p><span class="rounded-full border border-amber-400/40 px-2 py-1 text-[10px] font-black text-amber-300">DEMO</span></div>
        <div class="mt-4 rounded-xl border border-emerald-700/50 bg-emerald-950/80 p-4 text-center">
          <p class="text-[11px] font-bold uppercase tracking-widest text-emerald-300">${metodo === 'Tarjeta credito' ? 'Tarjeta de crédito' : 'Tarjeta de débito'}</p>
          <p id="importe-pos-caja" class="mt-1 text-3xl font-black text-white">S/ 0.00</p>
          <p id="estado-pos-caja" role="status" aria-live="polite" class="mt-2 text-xs font-bold text-emerald-200">Esperando operación en el POS físico</p>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-demo-pos="lectura" class="rounded-xl bg-white/10 px-3 py-3 text-xs font-black text-white hover:bg-white/20">Simular tarjeta</button>
          <button type="button" data-demo-pos="aprobacion" disabled class="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Simular aprobación</button>
        </div>
      </div>
      <p class="mt-3 text-[11px] font-bold leading-5 text-amber-800">La pantalla anterior es solo una simulación visual. NO procesa ni autoriza tarjetas. Para cobrar de verdad, utiliza el POS del comercio y verifica su comprobante de operación aprobada.</p>
      ${bloqueConfirmacion(metodo)}
    </section>`;
  }

  function prepararQR() {
    const img = DOM?.getElementById('codigo-yape-caja');
    const texto = DOM?.getElementById('tipo-codigo-yape-caja');
    if (!img || !texto) return;
    let demo = false;
    img.addEventListener('load', () => {
      texto.textContent = demo
        ? 'QR DEMO · No recibe dinero'
        : 'QR cargado del comercio · verifica el destinatario';
      texto.className = 'mt-2 text-center text-[10px] font-extrabold uppercase ' +
        (demo ? 'text-rose-700' : 'text-emerald-700');
    });
    img.addEventListener('error', () => {
      if (!demo) {
        demo = true;
        texto.textContent = 'No hay QR real. Mostrando QR DEMO.';
        img.alt = 'QR de demostración: no permite pagar';
        img.src = YAPE_QR_DEMO;
      } else {
        img.classList.add('hidden');
        texto.textContent = 'Falta configurar el QR del comercio.';
      }
    });
    // Si el archivo ya está en caché, el evento load pudo ocurrir antes del listener.
    if (img.complete && img.naturalWidth > 0) texto.textContent = 'QR cargado del comercio · verifica el destinatario';
  }

  function mostrarMetodo(metodo) {
    if (!DOM || !estado.cuenta) return;
    const box = DOM.getElementById('campos-pago-caja');
    if (!box) return;
    const anterior = box.querySelector('[data-asistencia-caja]');
    anterior?.remove();
    estado.demoPos = 0;
    if (metodo === 'Efectivo') {
      actualizarVistaPrevia();
      return;
    }
    const ayuda = DOM.createElement('div');
    ayuda.dataset.asistenciaCaja = '1';
    ayuda.innerHTML = metodo === 'Yape' ? pantallaYape()
      : metodo === 'Plin' ? pantallaPlin()
        : metodoTarjeta(metodo) ? pantallaPos(metodo) : '';
    box.appendChild(ayuda);
    if (metodo === 'Yape') prepararQR();
    actualizarVistaPrevia();
  }

  function actualizarPantallaPos() {
    const texto = DOM?.getElementById('estado-pos-caja');
    const btnAprobar = DOM?.querySelector('[data-demo-pos="aprobacion"]');
    if (!texto) return;
    texto.textContent = estado.demoPos === 0
      ? 'Esperando operación en el POS físico'
      : estado.demoPos === 1
        ? 'DEMO: tarjeta detectada. Simula la aprobación.'
        : 'APROBACIÓN SIMULADA · No es una autorización bancaria';
    if (btnAprobar) btnAprobar.disabled = estado.demoPos !== 1;
  }

  function puedeRegistrar(metodo) {
    if (!metodoExterno(metodo)) return true;
    const verificado = DOM?.getElementById('confirmacion-externa-caja')?.checked === true;
    const referencia = DOM?.getElementById('referencia-pago-caja')?.value?.trim() || '';
    return verificado && referencia.length > 0;
  }

  function motivoNoRegistrable(metodo) {
    if (!metodoExterno(metodo) || puedeRegistrar(metodo)) return '';
    if (!DOM?.getElementById('referencia-pago-caja')?.value?.trim()) {
      return 'Anota la referencia que muestra la aplicación o el POS real.';
    }
    return 'Antes de registrar el cobro, confirma que verificaste el pago REAL en Yape, Plin o en el POS físico.';
  }

  function manejarEntrada(e) {
    if (!estado.cuenta) return;
    if (e.target?.id === 'referencia-pago-caja') {
      if (typeof global.actualizarBotonCobroCaja === 'function') global.actualizarBotonCobroCaja();
    }
    actualizarVistaPrevia();
  }

  function manejarCambio(e) {
    if (!estado.cuenta) return;
    if (e.target?.id === 'confirmacion-externa-caja' && typeof global.actualizarBotonCobroCaja === 'function') {
      global.actualizarBotonCobroCaja();
    }
    actualizarVistaPrevia();
  }

  function manejarClick(e) {
    const boton = e.target?.closest?.('[data-demo-pos]');
    if (!boton || !estado.cuenta) return;
    e.preventDefault();
    if (boton.dataset.demoPos === 'lectura') estado.demoPos = 1;
    else if (boton.dataset.demoPos === 'aprobacion' && estado.demoPos === 1) estado.demoPos = 2;
    actualizarPantallaPos();
  }

  function limpiar() {
    if (estado.panel) {
      estado.panel.removeEventListener('input', manejarEntrada);
      estado.panel.removeEventListener('change', manejarCambio);
      estado.panel.removeEventListener('click', manejarClick);
    }
    estado.cuenta = null;
    estado.panel = null;
    estado.totalCentavos = null;
    estado.demoPos = 0;
  }

  function iniciar(cuenta) {
    limpiar();
    const contenido = DOM?.getElementById('contenido-cobro');
    const seccionProductos = contenido?.querySelector('section');
    if (!contenido || !seccionProductos || !cuenta) return;
    estado.cuenta = cuenta;
    estado.panel = contenido;
    const panel = DOM.createElement('section');
    panel.id = 'ticket-previo-caja';
    panel.className = 'mt-6 rounded-3xl border border-orange-200 bg-orange-50/60 p-3 sm:p-4';
    panel.innerHTML = `<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><p class="text-[11px] font-black uppercase tracking-widest text-orange-700">Antes de registrar el cobro</p>
      <h3 class="mt-1 text-base font-black text-slate-900">Vista previa del ticket</h3></div>
      <span class="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black text-orange-800">NO IMPRESO</span>
    </div>
    <div id="contenido-ticket-previo-caja"></div>
    <p class="mt-3 text-xs font-semibold leading-5 text-slate-600">Puedes verificar productos, total, método y documento. Al pulsar <strong>Registrar cobro</strong> y recibir la confirmación del servidor, se ofrecerá el PDF real para imprimir en 58 o 80 mm.</p>`;
    seccionProductos.appendChild(panel);
    contenido.addEventListener('input', manejarEntrada);
    contenido.addEventListener('change', manejarCambio);
    contenido.addEventListener('click', manejarClick);
    mostrarMetodo(DOM.getElementById('metodo-cobro-caja')?.value || 'Efectivo');
    actualizarVistaPrevia();
  }

  const api = {
    iniciar, limpiar, mostrarMetodo, actualizarVistaPrevia,
    puedeRegistrar, motivoNoRegistrable, modeloTicketPrevio, metodoExterno,
  };
  global.MenuGoCobroAsistido = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
