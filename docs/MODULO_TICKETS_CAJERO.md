# MenuGo | Manual tecnico del modulo de tickets del Cajero

**Version academica:** 1.0 (commits 21-24)  
**Rama de desarrollo:** `feature/cajero-tickets`  
**Tecnologias:** HTML, Tailwind CSS, JavaScript, Node.js, Express, PostgreSQL (Neon), PDFKit.

## 1. Objetivo y alcance

El modulo permite visualizar, generar, descargar y reimprimir tickets **internos** asociados a cobros confirmados. Incorpora una impresora termica **virtual** que simula la salida del papel y una vista previa del PDF real en 58 u 80 milimetros.

No requiere impresora fisica, no inicia cobros nuevos y no emite comprobantes electronicos ante SUNAT. Las palabras "boleta" y "factura" del formulario indican datos solicitados/registrados, no un documento tributario autorizado.

## 2. Componentes del sistema

| Componente | Archivo | Responsabilidad |
| --- | --- | --- |
| Endpoint de PDF | `backend/src/routes/cajero.routes.js` | GET de un ticket por `id_pago` |
| Controlador | `backend/src/controllers/ticket.controller.js` | Autorizacion y consultas parametrizadas a PostgreSQL |
| Servicio PDF | `backend/src/services/ticket-pdf.service.js` | Calculo seguro en centimos, maquetacion de 58/80 mm y PDFKit |
| Confirmacion posterior al pago | `Frontend/js/caja.js`, `Frontend/js/subcuentas-caja.js` | Ofrece impresion solo si el servidor confirma el pago |
| Simulador | `Frontend/Cajero/impresora_virtual.html`, `Frontend/css/impresora-virtual.css`, `Frontend/js/ticket-virtual.js` | Animacion, vista previa y acciones PDF |
| Historiales | `Frontend/Cajero/historial_pagos.html`, `Frontend/Cajero/facturacion.html` | Acceso a pagos y comprobantes guardados |
| Reimpresion | `Frontend/js/historial-tickets.js` | Vista previa, descarga y reimpresion del mismo pago |
| CI | `.github/workflows/pruebas-cajero.yml` | Pruebas automaticas y verificacion PDF real |

## 3. Flujo funcional

1. El Cajero abre turno y registra un pago normal o individual de subcuenta.
2. El servidor confirma el pago y entrega `id_pago`; el frontend no inventa identificadores.
3. La interfaz ofrece abrir la impresora virtual o continuar sin ticket.
4. El simulador solicita un PDF del pago mediante JWT, usando **solo GET**.
5. La API obtiene los datos existentes de `pagos`, `detalle_pago`, `detalle_producto`, `comprobantes` y sus relaciones.
6. El controlador rechaza pagos no confirmados, ID invalidos, importes inconsistentes y acceso a pagos ajenos al cajero. El administrador tiene acceso conforme a su rol.
7. PDFKit genera el documento en memoria; el navegador presenta la animacion, muestra la vista previa y permite descargar o abrir el visor de impresion.
8. Desde Historial y Comprobantes puede recuperarse el mismo `id_pago` para reimprimir. **No se ejecuta un segundo cobro.**

## 4. Contrato HTTP

```http
GET /api/cajero/pagos/:id/ticket.pdf?ancho=80
Authorization: Bearer <JWT_DEL_CAJERO>
Accept: application/pdf
```

- `:id` = identificador positivo de `pagos.id_pago`.
- `ancho` = `58` o `80`; predeterminado `80`.
- La respuesta exitosa entrega `application/pdf` con `Cache-Control: private, no-store`.
- Para descarga directa desde un cliente HTTP compatible, se admite `descargar=1` (disposicion `attachment`).
- Respuestas relevantes: `400` parametros incorrectos; `401/403` autenticacion o permisos; `404` pago no confirmado/inexistente; `409` importe y desglose inconsistentes; `503` PDFKit no disponible.

**Seguridad:** el JWT se envia en cabecera `Authorization`, no en la URL. Los PDF en el navegador usan URLs `blob:` locales, revocadas al salir o cambiar ancho. El sistema evita cachear tickets con datos personales en el servidor.

## 5. Funcionamiento sin impresora termica

En MenuGo: Caja -> registrar pago -> Abrir impresora virtual -> observar animacion -> elegir 58/80 mm -> Descargar PDF o Abrir para imprimir.

Al abrir el PDF se puede elegir `Ctrl + P` -> `Guardar como PDF` (o `Microsoft Print to PDF` en Windows). La animacion representa la salida del papel, **no imprime silenciosamente**. La impresora virtual no necesita instalar drivers ni servicios externos.

## 6. Preparacion y comprobaciones

Desde la raiz del repositorio:

```bash
npm ci --prefix backend
node --test backend/test/*.test.cjs
node backend/scripts/ticket-release-check.cjs
```

El ultimo comando genera **en memoria** tres PDFs a partir de datos ficticios: cobro completo en 58 mm, cobro completo en 80 mm y cobro parcial en 58 mm. Comprueba cabecera PDF, cierre del documento y dimensiones `/MediaBox`; **no consulta Neon, no guarda archivos y no registra operaciones**.

Como comprobacion visual adicional, utiliza el script del commit 21:

```bash
node backend/scripts/ticket-demo.cjs 80
node backend/scripts/ticket-demo.cjs 58
```

Los PDF de demostracion se guardan en el directorio temporal del sistema. Revisa visualmente saltos de linea, anchura, importes y legibilidad; el smoke binario por si solo no verifica su aspecto.

## 7. Pruebas de aceptacion manuales

El checklist completo esta en `docs/CHECKLIST_QA_TICKETS.md`. Se recomienda verificar:

- Pago completo y parcial, con total igual a la suma de sus productos.
- Botones «Ver ticket», «Reimprimir», «Descargar PDF» y «Abrir para imprimir».
- Formatos de 58 y 80 mm, incluida la fecha y el medio de pago.
- Cambios de ancho sin segundo cobro ni nuevos registros de PostgreSQL.
- `403` al intentar consultar el ticket de un cajero distinto.
- Comportamiento al caducar JWT, al no existir el pago y al bloquear el navegador ventanas emergentes.
- Estado de GitHub Actions verde al hacer push y abrir Pull Request hacia `main`.

## 8. Limites conscientes del proyecto academico

- **No es facturacion electronica ante SUNAT.** Requiere un proceso adicional de emision formal si se pretende validez tributaria.
- **No confirma automaticamente pagos de Yape/Plin.** Las referencias capturadas se verifican segun el flujo actual del negocio.
- **No transmite comandos ESC/POS** ni imprime directamente en una impresora fisica. Se usa el visor de impresion del navegador.
- El flujo HTTP real depende de una configuracion valida de JWT, datos de pago y esquema de Neon; las pruebas locales con datos ficticios no sustituyen la validacion integrada.

## 9. Evidencias para presentar

Toma capturas del formulario de cobro, confirmacion del pago, simulacion animada, vista previa del ticket de 58 y 80 mm, cuadro `Ctrl + P`, descarga del PDF, reimpresion desde Historial, reimpresion desde Comprobantes y ejecucion de GitHub Actions en verde. Evita exponer tokens, contrasenas o datos personales reales.
