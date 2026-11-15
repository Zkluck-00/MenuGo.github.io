# MenuGo - Commit 22: impresora termica virtual (simulacion de ticket)

## Objetivo

Integrar el ticket PDF del commit 21 en los cobros confirmados de MenuGo, con una pantalla visual que simula la salida de papel termico sin impresora fisica. No se registra un nuevo cobro: se consulta el documento ya emitido por el endpoint GET del pago.

**Nota tributaria:** es un ticket **interno de demostracion**, sin validez como boleta o factura electronica ante SUNAT. La etiqueta `boleta/factura` que ya guarda MenuGo no equivale a emision electronica legal.

## Requisitos previos

- Tener el commit 21 aplicado y la rama `feature/cajero-tickets` actualizada.
- `backend/package.json` y `backend/package-lock.json` con PDFKit instalado (commit 21).
- Un backend en ejecucion con `GET /api/cajero/pagos/:id/ticket.pdf` habilitado.
- Usuario Cajero autenticado con JWT; solo puede consultar sus propios pagos.
- Tener un pago REAL `estado_pago = 'pagado'` y `detalle_pago` consistente. El endpoint deniega pagos de otros usuarios.
- Para ver el PDF en el navegador: usar el frontend sobre HTTP/HTTPS (por ejemplo, el frontend servido por Express), no abrir el HTML como `file://`.

## Archivos listos para copiar/reemplazar

**Crear:**

- `Frontend/Cajero/impresora_virtual.html`: pantalla con impresora virtual, selector 58/80 mm y PDF embebido.
- `Frontend/css/impresora-virtual.css`: impresora y animacion CSS; accesibilidad para movimiento reducido.
- `Frontend/js/ticket-virtual.js`: descarga autentificada del PDF en memoria, vista previa, descarga, apertura para imprimir, seguridad y modal reutilizable.
- `backend/test/ticket.virtual.frontend.test.cjs`: 16 pruebas de validacion, rutas, accesos, flujo y funciones de impresion.
- `docs/COMMIT_22_IMPRESORA_VIRTUAL.md`: esta guia.

**Reemplazar por el archivo COMPLETO:**

- `Frontend/Cajero/cajero.html`: incluye el script compartido sin quitar el panel ni turnos previos.
- `Frontend/js/caja.js`: ofrece impresora despues de registrar un pago normal confirmado.
- `Frontend/Cajero/dividir_cuenta.html`: incluye el script compartido para cuentas divididas.
- `Frontend/js/subcuentas-caja.js`: ofrece impresora despues de confirmar un pago individual.

**No se cambian:** base de datos, migraciones, controladores de pagos, JWT, endpoints de cobro, rutas del commit 21, historial ni configuracion de Neon.

## Flujo del cajero

1. En `Frontend/Cajero/cajero.html`, selecciona una cuenta y registra el pago.
2. El backend confirma el pago y devuelve `data.id_pago`.
3. Aparece **"Pago registrado"** con opciones **"Abrir impresora virtual"** y **"Continuar sin ticket"**.
4. Al abrir la impresora, la nueva pagina lee el `id_pago` de su propia URL (sin token).
5. Solicita autenticadamente mediante `fetch` el PDF del commit 21 con `Authorization: Bearer <JWT>`.
6. Muestra el PDF real a la derecha, y una animacion **ilustrativa** del papel a la izquierda.
7. Permite repetir la animacion (sin peticion adicional), cambiar 58/80 mm (nuevo GET al mismo pago), descargar PDF o abrir el visor del navegador para imprimir.
8. La opcion de imprimir abre el **visor PDF del navegador**; alli elige **Ctrl+P** (o boton de impresora) y **Guardar como PDF / Microsoft Print to PDF**. No es impresion silenciosa.

La misma secuencia funciona para `Frontend/Cajero/dividir_cuenta.html`: se imprime **solo el pago individual registrado** en la subcuenta, no toda la mesa.

## Prueba sin impresora fisica

1. En VS Code, arranca el backend con `npm run dev --prefix backend` o el comando que ya usas.
2. Entra con el rol Cajero desde MenuGo y abre tu turno si corresponde.
3. Usa un pago de prueba en tu entorno de desarrollo Neon.
4. Al confirmar el pago, pulsa **Abrir impresora virtual**.
5. Comprueba que se ve la animacion y el **PDF REAL** con productos, importes y metodo.
6. Cambia entre **80 mm** y **58 mm** y comprueba el ancho del PDF.
7. Pulsa **Repetir simulacion** y comprueba que no aparece otro pago en el historial.
8. Pulsa **Descargar PDF** y abre el archivo descargado.
9. Pulsa **Abrir para imprimir**: en la pestaña del PDF usa `Ctrl+P` y **Guardar como PDF**.
10. Regresa a Caja: el cobro original sigue registrado exactamente una vez.

Si el visor integrado no dibuja el PDF en tu navegador, **Descargar PDF** y **Abrir para imprimir** siguen disponibles. Si el navegador bloquea ventanas emergentes, permite abrirlas en tu sitio.

## Pruebas automatizadas

Desde la raiz del repositorio:

```bash
node --check Frontend/js/caja.js
node --check Frontend/js/subcuentas-caja.js
node --check Frontend/js/ticket-virtual.js
node --test backend/test/ticket.virtual.frontend.test.cjs
node --test backend/test/*.test.cjs
```

En el entorno de preparacion del ZIP se ejecutaron 16/16 pruebas nuevas y 62/62 pruebas de la **copia local limitada** (commit 21, frontend del commit 19 y pruebas incluidas en esa copia). Esto NO sustituye ejecutar la suite del repositorio completo ni una prueba integrada con tu Neon.

### Casos probados

- ID y formatos validos; no se admiten IDs maliciosos.
- Solo rutas de retorno internas; no hay redirecciones arbitrarias.
- Peticion GET del PDF con JWT por header; el token nunca se pone en URL.
- Animacion no altera pagos; cambio de ancho recupera PDF de mismo pago.
- Descarga/visor de impresion usan el Blob recibido, sin registrar pagos nuevos.
- 401 redirige a login y 403 no presenta informacion ajena.
- Rechaza respuestas HTML u otros errores como si fueran un PDF.
- Integracion con pago normal y pagos de subcuentas.
- `prefers-reduced-motion` permite visualizar el papel sin animacion.

## Errores habituales

- **401:** la sesion expiro, inicia sesion como Cajero.
- **403:** intentas consultar el pago de otro cajero; revisa con el usuario que realizo el cobro.
- **404:** el pago no existe o no fue confirmado.
- **409:** el pago no tiene un desglose valido para generar el ticket.
- **503:** PDFKit no esta instalado en el backend; ejecuta `npm install --prefix backend pdfkit@0.20.2 --save-exact`.
- **No aparece el cuadro de impresion:** el navegador puede bloquear la nueva pestana; descarga el PDF y usa Ctrl+P desde un visor PDF.
- **Solo ves la pantalla de carga:** verifica en DevTools > Network la solicitud `GET /api/cajero/pagos/:id/ticket.pdf` y el token JWT. La animacion NO inventa un ticket cuando la API falla.

## Crear y publicar el commit 22

Trabaja sobre la rama creada en el commit 21:

```bash
git switch feature/cajero-tickets
git status
node --test backend/test/ticket.virtual.frontend.test.cjs
node --test backend/test/*.test.cjs

git add Frontend/Cajero/impresora_virtual.html Frontend/Cajero/cajero.html Frontend/Cajero/dividir_cuenta.html
git add Frontend/css/impresora-virtual.css Frontend/js/ticket-virtual.js Frontend/js/caja.js Frontend/js/subcuentas-caja.js
git add backend/test/ticket.virtual.frontend.test.cjs docs/COMMIT_22_IMPRESORA_VIRTUAL.md
git diff --cached --check
git commit -m "feat(cajero): integrar impresora termica virtual y vista previa PDF"
git push origin feature/cajero-tickets
```

## Evidencias para la exposicion

- Confirmacion de pago con el boton **Abrir impresora virtual**.
- Impresora animada con ticket visible.
- Vista previa del PDF real para un pago de Neon.
- Ticket en 58 mm y 80 mm.
- Descarga del PDF y dialogo **Ctrl+P > Guardar como PDF**.
- Pruebas del frontend aprobadas.
- Un solo registro en el historial: reimprimir no genera otro pago.
- Commit `feat(cajero)...` en GitHub y workflow en verde (tras publicarlo).

## Siguiente etapa

**Commit 23:** agregar acceso a la impresora y reimpresion directamente desde el historial de pagos/comprobantes, sin registrar otra operacion.
