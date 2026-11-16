# MenuGo - Commit 23: ver y reimprimir tickets desde el historial

**Rama:** `feature/cajero-tickets`

**Mensaje recomendado:** `feat(cajero): habilitar vista previa y reimpresion de tickets desde historiales`

## Objetivo

Incorporar acciones de vista previa, descarga, impresion y simulacion de reimpresion en las pantallas **Historial de pagos** y **Comprobantes** del Cajero, reutilizando el endpoint GET de tickets PDF creado en el commit 21 y la impresora virtual del commit 22.

## Archivos de entrega

| Archivo | Accion | Motivo |
|---|---|---|
| `Frontend/Cajero/historial_pagos.html` | Reemplazar | Columna Ticket y scripts de visualizacion |
| `Frontend/js/historial-pagos.js` | Reemplazar | Filtro por cajero, botones Ver ticket y Reimprimir |
| `Frontend/Cajero/facturacion.html` | Reemplazar | Acceso a la previsualizacion desde Comprobantes |
| `Frontend/js/facturacion.js` | Reemplazar | Botones por comprobante y tratamiento de errores |
| `Frontend/js/ticket-virtual.js` | Reemplazar | Volver desde el simulador a uno de los dos historiales |
| `Frontend/js/historial-tickets.js` | Nuevo | Modal de previsualizacion PDF autentificada, descarga, impresion y reutilizacion |
| `backend/test/ticket.historial.frontend.test.cjs` | Nuevo | Pruebas automatizadas del commit 23 |
| `docs/COMMIT_23_HISTORIAL_TICKETS.md` | Nuevo | Esta guia |

**No se modifica PostgreSQL. No hay migraciones nuevas, ni dependencias npm adicionales.** La dependencia PDFKit del commit 21 debe continuar instalada.

## Como incorporar

1. Asegurate de estar en `feature/cajero-tickets`.
2. Extrae el ZIP sobre la **raiz de MenuGo** y conserva las rutas originales (`Frontend/`, `backend/`, `docs/`).
3. Reemplaza los archivos existentes al extraer. Los nuevos se agregan.
4. Ejecuta las pruebas y despues `git add`, `git commit` y `git push`.

Comandos (desde la raiz del proyecto):

```bash
git switch feature/cajero-tickets
git pull --ff-only origin feature/cajero-tickets

node --check Frontend/js/historial-tickets.js
node --check Frontend/js/historial-pagos.js
node --check Frontend/js/facturacion.js
node --check Frontend/js/ticket-virtual.js
node --test backend/test/ticket.historial.frontend.test.cjs
node --test backend/test/ticket.pdf.test.cjs backend/test/ticket.controller.test.cjs backend/test/ticket.virtual.frontend.test.cjs backend/test/ticket.historial.frontend.test.cjs
node --test backend/test/*.test.cjs
```

Si todas las pruebas terminan satisfactoriamente:

```bash
git add Frontend/Cajero/historial_pagos.html Frontend/Cajero/facturacion.html
git add Frontend/js/historial-pagos.js Frontend/js/facturacion.js Frontend/js/ticket-virtual.js Frontend/js/historial-tickets.js
git add backend/test/ticket.historial.frontend.test.cjs docs/COMMIT_23_HISTORIAL_TICKETS.md
git commit -m "feat(cajero): habilitar vista previa y reimpresion de tickets desde historiales"
git push origin feature/cajero-tickets
```

## Como probar con datos reales

**Requisito:** tener un pago confirmado y visible para el Cajero, y backend activo con la dependencia PDFKit instalada.

### Caso A: Historial de pagos

1. Inicia sesion como Cajero.
2. Abre **Historial** desde el panel principal.
3. Aplica opcionalmente filtros por fecha o metodo de pago. La pantalla muestra solo pagos del cajero autentificado con `mios=1`.
4. Pulsa **Ver ticket** de un pago; debe abrirse un modal con el PDF de ese pago.
5. Selecciona el formato **58 mm**. Debe generarse el PDF correspondiente y reemplazar la vista previa.
6. Pulsa **Descargar PDF** y verifica el archivo.
7. Pulsa **Abrir para imprimir**, seguido de `Ctrl + P` y **Guardar como PDF**; no necesitas una impresora fisica.
8. Cierra el modal y pulsa **Reimprimir** en la misma fila. Se abrira la impresora virtual del commit 22 y el boton de retorno llevara al Historial.

### Caso B: Comprobantes

1. Abre **Comprobantes** desde el menu Cajero.
2. Filtra por **Todos**, **Boletas** o **Facturas** (son registros internos, no comprobantes tributarios electronicos validados ante SUNAT).
3. Elige un pago de tu propiedad. Pulsa **Ver ticket PDF** y comprueba la vista previa.
4. Pulsa **Reimprimir** para visualizar la animacion de la impresora virtual.
5. El enlace de retorno debe llevar nuevamente a **Comprobantes**.

### Caso C: Validaciones y seguridad

- Sin sesion valida, no se genera ningun PDF.
- Con un pago ajeno: el backend puede responder **403**, y el frontend debe indicar que no existe permiso. La pagina Comprobantes conserva el listado general previo del proyecto; el endpoint de tickets solo da acceso a pagos propios, salvo autorizaciones de administrador definidas en el backend.
- Si el pago no existe o no esta confirmado, se muestra el error y se bloquea la descarga.
- Si falla la respuesta PDF, no se genera un ticket ficticio.
- Cambiar el ancho o cerrar el modal libera el recurso `blob:` anterior y detiene peticiones pendientes.
- Todas las operaciones de consulta de tickets utilizan exclusivamente **GET**. No hay nuevos `POST` de cobro.
- Los tokens JWT viajan en el encabezado `Authorization`; nunca en la URL.

## Como funciona internamente

```text
Pantalla Historial / Comprobantes
   |
   +-- Ver ticket --> HistorialTicket.abrirVistaPrevia(id_pago)
   |                        |
   |                        +-- GET /api/cajero/pagos/:id/ticket.pdf?ancho=80
   |                        +-- JWT en Authorization
   |                        +-- Blob local + iframe
   |                        +-- Descargar / Imprimir / Cambiar ancho
   |
   +-- Reimprimir --> impresora_virtual.html?pago=ID&volver=historial_pagos.html
                              |
                              +-- GET del mismo PDF
                              +-- Animacion de impresion (sin hardware)
                              +-- Retorno seguro a la pantalla de origen
```

El codigo nuevo no altera los controladores de pagos, ni las tablas, ni el proceso de cierre de caja.

## Pruebas

En la copia de trabajo se ejecutaron **62 pruebas locales de los commits 21-23**, con **62 aprobadas y 0 fallidas**. De ellas, **27** corresponden al archivo nuevo `ticket.historial.frontend.test.cjs`.

Estas pruebas utilizan simulaciones de red, navegador y PDFKit; la integracion con un pago de Neon y la impresion real mediante el navegador deben comprobarse manualmente desde tu proyecto. Si la suite completa presenta fallos anteriores en otros archivos, revisa el error por separado antes de fusionar ramas.

## Evidencias sugeridas para la exposicion

1. Historial de pagos mostrando las columnas y acciones nuevas.
2. Modal de vista previa de un ticket de 80 mm.
3. Vista previa despues de cambiar a 58 mm.
4. Impresora virtual mostrando un ticket reimpreso desde el historial.
5. Archivo PDF descargado y dialogo de impresion con la opcion Guardar como PDF.
6. Terminal con las pruebas aprobadas y commit/push a GitHub.

## Pendiente para commit 24

Pruebas completas, documentacion final, verificacion de GitHub Actions y revisiones de interfaz integradas con datos reales de Neon.
