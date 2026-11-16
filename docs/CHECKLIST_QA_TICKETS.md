# MenuGo | Checklist QA - impresora termica virtual y tickets

**Fecha de ejecucion:** ______  **Responsable:** ______  **Rama/commit:** ______

> Marcar una casilla solo despues de verificar el caso en el entorno indicado. Este documento no certifica pruebas que aun no se hayan ejecutado.

## A. Preparacion del entorno

- [ ] Rama `feature/cajero-tickets` actualizada desde el repositorio remoto.
- [ ] Node.js 20 y `npm ci --prefix backend` sin errores.
- [ ] Backend iniciado y conexion a Neon funcional para las pruebas integradas.
- [ ] JWT valido para Cajero y turno de caja abierto.
- [ ] Datos ficticios de prueba, sin RUC/DNI de personas reales.

## B. Generacion PDF y simulacion

- [ ] El cobro normal correcto ofrece «Abrir impresora virtual».
- [ ] La opcion «Continuar sin ticket» no revierte ni repite el cobro.
- [ ] El PDF corresponde al `id_pago` mostrado.
- [ ] El PDF de 58 mm tiene el ancho adecuado.
- [ ] El PDF de 80 mm tiene el ancho adecuado.
- [ ] El ticket muestra productos pagados, importe, metodo, fecha, cajero y referencia cuando exista.
- [ ] El ticket parcial muestra **solo** el importe realmente pagado por la subcuenta.
- [ ] La animacion simula la salida del papel; «Repetir simulacion» no consulta un nuevo pago.
- [ ] «Descargar PDF» produce un archivo visible y legible.
- [ ] «Abrir para imprimir» permite usar `Ctrl + P` -> «Guardar como PDF» sin impresora.
- [ ] La indicacion «no valido ante SUNAT» es visible.

## C. Historial y control de acceso

- [ ] «Ver ticket» funciona desde Historial de pagos.
- [ ] «Reimprimir» funciona desde Historial de pagos.
- [ ] «Ver ticket» funciona desde Comprobantes.
- [ ] «Reimprimir» funciona desde Comprobantes.
- [ ] Cambiar el ancho actualiza el PDF del **mismo** pago.
- [ ] Las consultas de ticket usan `GET` y conservan importes y saldos originales.
- [ ] Un Cajero no puede abrir tickets de otro cajero (`403`).
- [ ] Un ID inexistente o pago no confirmado no produce un ticket ficticio (`404`).
- [ ] Una sesion caducada no expone PDF ni continua descargando el documento.
- [ ] Los errores de carga se muestran al usuario; no se anuncia impresion exitosa al fallar.

## D. Automatizacion y CI

- [ ] `node --test backend/test/*.test.cjs` finaliza sin fallos.
- [ ] `node backend/scripts/ticket-release-check.cjs` imprime tres resultados `OK`.
- [ ] GitHub Actions se ejecuta al hacer push a `feature/cajero-tickets`.
- [ ] GitHub Actions se ejecuta en una Pull Request hacia `main`.
- [ ] Los pasos «Instalar dependencias», «Verificar sintaxis», «Ejecutar pruebas» y «Comprobar PDF» estan en verde.
- [ ] El historial de Git muestra los commits 21, 22, 23 y 24.
- [ ] Se confirma que no se subieron `.env`, claves JWT ni credenciales de Neon.

## E. Registro de incidencias

| Caso | Resultado | Evidencia | Observaciones |
| --- | --- | --- | --- |
| PDF 58 mm | Pendiente | | |
| PDF 80 mm | Pendiente | | |
| Subcuenta | Pendiente | | |
| Reimpresion | Pendiente | | |
| Autorizacion | Pendiente | | |
| GitHub Actions | Pendiente | | |

**Criterio de cierre:** todos los casos criticos (pagos sin duplicidad, permisos, importes, PDF real y CI) deben aprobar antes de fusionar la Pull Request.
