'use strict';

// Commit 19: pruebas reales de la logica del JS del navegador en DOM simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.resolve(__dirname, '../../Frontend/js/subcuentas-caja.js'), 'utf8');
const caja = fs.readFileSync(path.resolve(__dirname, '../../Frontend/js/caja.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../Frontend/Cajero/dividir_cuenta.html'), 'utf8');
const home = fs.readFileSync(path.resolve(__dirname, '../../Frontend/Cajero/cajero.html'), 'utf8');

function ejemplo() {
  return {
    cuenta: { id_cuenta: 7, id_grupo_mesa: 10, estado: 'pendiente' },
    subcuentas: [
      { id_subcuenta: 101, id_cuenta: 7, nombre: 'Ana', estado: 'pendiente', total_asignado: '40.00', total_pagado: '0.00', total_pendiente: '40.00', detalles: [
        { id_subcuenta_detalle: 901, id_subcuenta: 101, id_detalle_producto: 11, monto_asignado: '15.00', monto_pagado: '0.00', monto_pendiente: '15.00' },
        { id_subcuenta_detalle: 902, id_subcuenta: 101, id_detalle_producto: 12, monto_asignado: '25.00', monto_pagado: '0.00', monto_pendiente: '25.00' },
      ] },
      { id_subcuenta: 102, id_cuenta: 7, nombre: 'Luis', estado: 'pendiente', total_asignado: '20.00', total_pagado: '0.00', total_pendiente: '20.00', detalles: [
        { id_subcuenta_detalle: 903, id_subcuenta: 102, id_detalle_producto: 11, monto_asignado: '20.00', monto_pagado: '0.00', monto_pendiente: '20.00' },
      ] },
    ],
    productos: [
      { id_detalle_producto: 11, id_pedido: 18, nombre: 'Pizza compartida', subtotal: '35.00', total_asignado: '35.00', disponible_para_asignar: '0.00', estado_pedido: 'entregado' },
      { id_detalle_producto: 12, id_pedido: 19, nombre: 'Arroz con pollo', subtotal: '25.00', total_asignado: '25.00', disponible_para_asignar: '0.00', estado_pedido: 'en_preparacion' },
    ],
  };
}

function inventarVista({ fetchMock, bloqueado = false, cuenta = ejemplo(), cuentaOriginal, turno = true } = {}) {
  const nodos = new Map();
  const solicitudes = [];
  const storage = new Map();
  const clases = () => {
    const set = new Set(['hidden']);
    return { add: x => set.add(x), remove: x => set.delete(x), toggle(x, force) {
      if (force === undefined ? !set.has(x) : force) set.add(x); else set.delete(x);
    }, contains: x => set.has(x) };
  };
  function elemento(id) {
    if (!nodos.has(id)) {
      nodos.set(id, { id, value: '', textContent: '', innerHTML: '', disabled: false, classList: clases(), dataset: {},
        addEventListener() {}, scrollIntoView() {}, focus() {}, maxLength: 100, placeholder: '' });
    }
    return nodos.get(id);
  }
  function casillas() {
    const fuente = elemento('lista-seleccion-pago-sub').innerHTML;
    return [...fuente.matchAll(/<input name="detalle-pago-sub"[^>]+>/g)].map(match => {
      const tag = match[0];
      return {
        dataset: { id: tag.match(/data-id="(\d+)"/)?.[1], monto: tag.match(/data-monto="(\d+)"/)?.[1] },
        disabled: /\bdisabled\b/.test(tag),
        checked: /\bchecked\b/.test(tag),
      };
    }).filter(n => n.checked);
  }
  const cuentaVista = cuentaOriginal || { id_cuenta: 7, etiqueta: 'Mesa 04', total_pendiente: 60, mesas: [4], es_llevar: false,
    detalles: [ {id_detalle_producto: 11, puede_pagarse: true}, {id_detalle_producto: 12, puede_pagarse: false} ] };
  const respuesta = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const mock = fetchMock || (async (url, opts = {}) => {
    const r = String(url);
    if (r.endsWith('/cajero/cuentas')) return respuesta({ ok: true, data: [cuentaVista] });
    if (r.endsWith('/cajero/turnos/actual')) return respuesta({ ok: true, data: turno ? { id_turno: 17, estado: 'abierto' } : null });
    if (r.endsWith('/cajero/cuentas/7/subcuentas')) return respuesta({ ok: true, data: cuenta });
    if (r.endsWith('/pagos')) return respuesta({ ok: true, data: { id_pago: 450, vuelto: '5.00' } }, 201);
    if (opts.method === 'POST' || opts.method === 'DELETE') return respuesta({ ok: true, data: { id_subcuenta: 105 } }, 201);
    throw new Error(`URL inesperada: ${r}`);
  });
  const vmContext = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: bloqueado, MENUGO_API: '/api', location: { search: '?id_cuenta=7', href: 'http://localhost/Cajero/dividir_cuenta.html?id_cuenta=7', replace() {} },
      crypto: { randomUUID: () => 'abc00000-1111-2222-3333-444444444444' } },
    document: { getElementById: elemento, addEventListener() {}, querySelectorAll(query) { return query === 'input[name="detalle-pago-sub"]:checked' ? casillas() : []; } },
    headersAutenticadosPersonal: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test' }),
    obtenerSesionPersonal: () => ({ id_trabajador: 8 }),
    localStorage: { removeItem() {} },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    fetch: async (...args) => { solicitudes.push(args); return mock(...args); },
    URL, URLSearchParams, history: { replaceState() {} },
    confirm: () => true, console: { error() {}, log() {} },
  });
  vm.runInContext(script, vmContext, { filename: 'subcuentas-caja.js' });
  const state = vm.runInContext('estadoSub', vmContext);
  state.idCuenta = 7;
  state.cuentas = [cuentaVista];
  state.detalle = JSON.parse(JSON.stringify(cuenta));
  state.turno = turno ? { id_turno: 17, estado: 'abierto' } : null;
  return { run: code => vm.runInContext(code, vmContext), state, nodo: elemento, solicitudes, storage, respuesta, vmContext };
}

function formularioPago(ui, persona = 101, metodo = 'Efectivo', recibido = '20.00') {
  ui.run(`abrirPagoSub(${persona})`);
  ui.nodo('metodo-pago-sub').value = metodo;
  ui.nodo('tipo-comprobante-sub').value = 'boleta';
  ui.nodo('documento-pago-sub').value = '12345678';
  ui.nodo('recibido-pago-sub').value = recibido;
  ui.nodo('referencia-pago-sub').value = 'OPER-12345';
}

// Contrato entre ambos HTML, JS y backend.
test('19: pagina publica nuevo JS y usa autenticacion de cajero', () => {
  assert.match(html, /\.\.\/js\/personal-auth\.js/);
  assert.match(html, /\.\.\/js\/subcuentas-caja\.js/);
  assert.match(script, /headersAutenticadosPersonal\('cajero'/);
  assert.match(script, /MENUGO_PERSONAL_BLOQUEADO/);
});
test('19: navegacion permite abrir la division desde el dashboard y cada cuenta', () => {
  assert.match(home, /href="dividir_cuenta.html"/);
  assert.match(caja, /dividir_cuenta\.html\?id_cuenta=/);
});
test('19: formulario incluye los tres endpoints de gestion y pagos individuales', () => {
  for (const patron of [/\/subcuentas`/, /\/detalles`/, /\/pagos`/]) assert.match(script, patron);
  for (const id of ['form-persona-sub', 'form-asignar-sub', 'form-pago-sub', 'aviso-pendiente-sub']) {
    assert.ok(html.includes(`id="${id}"`));
  }
});
test('19: importe decimal exacto en centimos, y rechaza fracciones invalidas', () => {
  const ui = inventarVista();
  assert.equal(ui.run("centimosSub('0.10') + centimosSub('0.20')"), 30);
  assert.equal(ui.run("centimosSub('0.001')"), null);
  assert.equal(ui.run("centimosSub('0.00', false)"), null);
  assert.equal(ui.run("centimosSub('-1.00')"), null);
  assert.equal(ui.run("centimosSub('1e3')"), null);
  assert.equal(ui.run("centimosSub('NaN')"), null);
  assert.equal(ui.run("importeFijoSub(30)"), '0.30');
});
test('19: valida cantidades de hasta tres decimales', () => {
  const ui = inventarVista();
  assert.equal(ui.run("cantidadValidaSub('0.500')"), true);
  assert.equal(ui.run("cantidadValidaSub('')"), true);
  for (const v of ['0', '-1', '0.000', '0.1234']) assert.equal(ui.run(`cantidadValidaSub('${v}')`), false);
});
test('19: resumen coincide con S/ 60, asignaciones y pagos', () => {
  const ui = inventarVista();
  const r = ui.run('resumenCuentaSub()');
  assert.equal(r.pendiente, 6000);
  assert.equal(r.asignado, 6000);
  assert.equal(r.libre, 0);
  assert.equal(r.pagado, 0);
});
test('19: mesa unificada se identifica por etiquetas y mesas del grupo', () => {
  const ui = inventarVista({ cuentaOriginal: { id_cuenta: 7, etiqueta: 'Cumpleaños', mesas: [4, 5], total_pendiente: 60,
    detalles: [{id_detalle_producto: 11, puede_pagarse: true}, {id_detalle_producto: 12, puede_pagarse: false}] } });
  ui.run('actualizarResumenSub()');
  assert.equal(ui.nodo('mesas-cuenta-sub').textContent, 'Mesa 4 · Mesa 5');
  assert.equal(ui.nodo('titulo-cuenta-sub').textContent, 'Cumpleaños');
});
test('19: platos en cocina pueden asignarse, pero no cobrarse', () => {
  const ui = inventarVista();
  assert.equal(ui.run('productoEntregadoSub(productoActualSub(11))'), true);
  assert.equal(ui.run('productoEntregadoSub(productoActualSub(12))'), false);
  assert.equal(ui.run('asignacionListaSub(personaActualSub(101).detalles[0])'), true);
  assert.equal(ui.run('asignacionListaSub(personaActualSub(101).detalles[1])'), false);
});
test('19: abrir cobro preselecciona unicamente importes entregados de Ana', () => {
  const ui = inventarVista();
  formularioPago(ui);
  assert.equal(ui.run('totalSeleccionadoSub()'), 1500);
  assert.match(ui.nodo('lista-seleccion-pago-sub').innerHTML, /data-monto="1500" checked/);
  assert.match(ui.nodo('lista-seleccion-pago-sub').innerHTML, /data-monto="2500" disabled/);
  assert.equal(ui.nodo('total-pago-sub').textContent, 'S/ 15.00');
});
test('19: Luis solo puede pagar los S/ 20 asignados a su porcion', () => {
  const ui = inventarVista();
  formularioPago(ui, 102);
  assert.equal(ui.run('totalSeleccionadoSub()'), 2000);
  assert.doesNotMatch(ui.nodo('lista-seleccion-pago-sub').innerHTML, /Arroz con pollo/);
});
test('19: efectivo recibido genera payload sin confiar al servidor subtotal del browser', () => {
  const ui = inventarVista();
  formularioPago(ui);
  const intento = ui.run('datosPagoSub()');
  assert.equal(intento.id_cuenta, 7);
  assert.equal(intento.id_subcuenta, 101);
  assert.equal(intento.datos.metodo_pago, 'Efectivo');
  assert.equal(intento.datos.monto_recibido, '20.00');
  assert.equal(intento.datos.idempotency_key.length, 36);
  assert.equal(intento.datos.detalles.length, 1);
  assert.equal(intento.datos.detalles[0].id_detalle_producto, 11);
  assert.equal(intento.datos.monto, undefined);
  assert.equal(intento.datos.vuelto, undefined);
});
test('19: pago digital exige referencia y no envia monto recibido', () => {
  const ui = inventarVista();
  formularioPago(ui, 101, 'Yape');
  const intento = ui.run('datosPagoSub()');
  assert.equal(intento.datos.referencia, 'OPER-12345');
  assert.equal(intento.datos.monto_recibido, undefined);
});
test('19: efectivo insuficiente no permite construir un pago', () => {
  const ui = inventarVista();
  formularioPago(ui, 101, 'Efectivo', '10.00');
  assert.throws(() => ui.run('datosPagoSub()'), /insuficiente/i);
});
test('19: no acepta documentos invalidos para boleta', () => {
  const ui = inventarVista();
  formularioPago(ui);
  ui.nodo('documento-pago-sub').value = '1234';
  assert.throws(() => ui.run('datosPagoSub()'), /DNI/);
});
test('19: factura pide RUC y razon social', () => {
  const ui = inventarVista();
  formularioPago(ui);
  ui.nodo('tipo-comprobante-sub').value = 'factura';
  ui.nodo('documento-pago-sub').value = '12345678901';
  assert.throws(() => ui.run('datosPagoSub()'), /RUC/);
  ui.nodo('razon-social-sub').value = 'MenuGo SAC';
  assert.equal(ui.run('datosPagoSub()').datos.razon_social, 'MenuGo SAC');
});
test('19: evita nuevo cobro si no hay turno abierto', () => {
  const ui = inventarVista({ turno: false });
  formularioPago(ui);
  assert.throws(() => ui.run('datosPagoSub()'), /turno/i);
});
test('19: participantes pagados no se ofrecen para editar asignaciones', () => {
  const d = ejemplo();
  d.subcuentas[0].estado = 'pagada'; d.subcuentas[0].total_pagado = '40.00'; d.subcuentas[0].total_pendiente = '0.00';
  const ui = inventarVista({ cuenta: d });
  assert.equal(ui.run('disponiblesParaPersonaSub(101).length'), 0);
  ui.run('renderPersonasSub()');
  assert.doesNotMatch(ui.nodo('lista-personas-sub').innerHTML, /data-persona-sub="101" data-asignacion-sub/);
});
test('19: productos ya asignados no se ofrecen de nuevo a la misma persona', () => {
  const d = ejemplo();
  d.productos[0].disponible_para_asignar = '5.00';
  const ui = inventarVista({ cuenta: d });
  assert.equal(ui.run('disponiblesParaPersonaSub(101).length'), 0);
});
test('19: impide asignaciones que superan el saldo libre', async () => {
  const d = ejemplo(); d.productos[0].disponible_para_asignar = '5.00';
  d.subcuentas.push({ id_subcuenta: 103, nombre: 'Sol', estado: 'pendiente', total_asignado: '0.00', total_pagado: '0.00', total_pendiente: '0.00', detalles: [] });
  const ui = inventarVista({ cuenta: d });
  ui.nodo('select-persona-asignar').value = '103';
  ui.nodo('select-producto-asignar').value = '11';
  ui.nodo('monto-asignar-sub').value = '5.01';
  ui.nodo('cantidad-asignar-sub').value = '';
  await ui.run('asignarImporteSub({preventDefault(){}})');
  assert.match(ui.nodo('mensaje-sub').textContent, /no supere el saldo libre/i);
  assert.equal(ui.solicitudes.length, 0);
});
test('19: la lista escapa contenido HTML en nombres de persona y productos', () => {
  const d = ejemplo(); d.subcuentas[0].nombre = '<svg onload=alert(1)>'; d.productos[0].nombre = '<img src=x onerror=alert(1)>';
  const ui = inventarVista({ cuenta: d });
  ui.run('renderPersonasSub(); renderProductosSub();');
  assert.match(ui.nodo('lista-personas-sub').innerHTML, /&lt;svg/);
  assert.match(ui.nodo('lista-productos-sub').innerHTML, /&lt;img/);
  assert.doesNotMatch(ui.nodo('lista-productos-sub').innerHTML, /<img src/);
});
test('19: una solicitud fallida por red conserva idempotency_key en sessionStorage', async () => {
  let llamadas = 0;
  const ui = inventarVista({ fetchMock: async () => { llamadas++; throw new Error('red caida'); } });
  formularioPago(ui);
  await ui.run('registrarPagoSub({preventDefault(){}})');
  assert.equal(llamadas, 1);
  assert.ok(ui.state.pagoPendiente);
  assert.equal(ui.storage.size, 1);
  assert.match(ui.nodo('mensaje-sub').textContent, /misma operacion/i);
});
test('19: reintenta mismo payload y clave, luego limpia pendiente al confirmar', async () => {
  let llamadas = 0;
  const cuerpos = [];
  const ui = inventarVista({ fetchMock: async (url, opciones) => {
    llamadas++;
    if (String(url).endsWith('/pagos')) {
      cuerpos.push(opciones.body);
      if (cuerpos.length === 1) throw new Error('red caida');
      return { ok: true, status: 200, json: async () => ({ ok: true, repetido: true, data: { id_pago: 444, vuelto: '5.00' } }) };
    }
    if (String(url).endsWith('/cajero/cuentas')) return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
    if (String(url).endsWith('/cajero/turnos/actual')) return { ok: true, status: 200, json: async () => ({ ok: true, data: { id_turno: 17, estado: 'abierto' } }) };
    throw new Error('URL inesperada');
  } });
  formularioPago(ui);
  await ui.run('registrarPagoSub({preventDefault(){}})');
  assert.equal(ui.state.pagoPendiente.datos.idempotency_key.length, 36);
  await ui.run('reintentarPagoSub()');
  assert.equal(cuerpos.length, 2);
  assert.equal(cuerpos[0], cuerpos[1]);
  assert.equal(ui.state.pagoPendiente, null);
  assert.equal(ui.storage.size, 0);
});
test('19: error HTTP 400 borra el intento, porque no se registro el pago', async () => {
  const ui = inventarVista({ fetchMock: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, message: 'Datos invalidos' }) }) });
  formularioPago(ui);
  await ui.run('registrarPagoSub({preventDefault(){}})');
  assert.equal(ui.state.pagoPendiente, null);
  assert.match(ui.nodo('mensaje-sub').textContent, /Datos invalidos/);
});
test('19: HTTP 409 conserva clave para verificar conflicto o resultado incierto', async () => {
  const ui = inventarVista({ fetchMock: async () => ({ ok: false, status: 409, json: async () => ({ ok: false, code: 'IDEMPOTENCY_CONFLICT', message: 'Conflicto' }) }) });
  formularioPago(ui);
  await ui.run('registrarPagoSub({preventDefault(){}})');
  assert.ok(ui.state.pagoPendiente);
  assert.equal(ui.storage.size, 1);
});
test('19: bloqueo de ruta sin sesion es compatible con autenticarPersonal', () => {
  const ui = inventarVista({ bloqueado: true });
  assert.equal(ui.run('window.MENUGO_PERSONAL_BLOQUEADO'), true);
  assert.match(script, /if \(window\.MENUGO_PERSONAL_BLOQUEADO\) return;/);
});
test('19: flujo regular de caja usa monto_libre cuando existe, no reserva de persona', () => {
  const elementos = new Map();
  const get = id => { if (!elementos.has(id)) elementos.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}},addEventListener(){},disabled:false,value:''});return elementos.get(id); };
  const context = vm.createContext({ window:{MENUGO_PERSONAL_BLOQUEADO:false,location:{search:''}}, document:{getElementById:get,addEventListener(){},querySelectorAll(){return[];}}, URLSearchParams, setTimeout(){},setInterval(){},alert(){} });
  vm.runInContext(caja, context);
  const item = { id_detalle_producto: 11, monto_pendiente: 35, monto_libre: 20, monto_reservado: 15, puede_pagarse: true, nombre: 'Pizza' };
  assert.equal(vm.runInContext(`montoLibreDetalleCaja(${JSON.stringify(item)})`, context), 20);
  vm.runInContext(`cuentasCaja = [{id_cuenta:7, etiqueta:'Mesa 4', detalles:[${JSON.stringify(item)}], total_pendiente:35, mesas:[4]}]; abrirCobroCaja('7')`, context);
  assert.match(get('contenido-cobro').innerHTML, /data-monto="20"/);
  assert.doesNotMatch(get('contenido-cobro').innerHTML, /data-monto="35"/);
});
test('19: sin saldo libre los productos asignados no habilitan el cobro normal', () => {
  const ctx = vm.createContext({ window:{MENUGO_PERSONAL_BLOQUEADO:false,location:{search:''}}, document:{addEventListener(){}},URLSearchParams,setInterval(){} });
  vm.runInContext(caja,ctx);
  assert.equal(vm.runInContext("productosCobrablesCaja({detalles:[{puede_pagarse:true,monto_pendiente:15,monto_libre:0}]}).length",ctx),0);
});
