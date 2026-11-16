# MenuGo - Checklist QA del modulo Cajero

**Ambiente requerido:** PostgreSQL/Neon de desarrollo con backup reciente. Utiliza usuarios y consumos de prueba; no ejecutes cobros reales para verificar el release.

Anota `OK`, `FALLA` o `NO PROBADO` junto con una captura o numero de caso. No marques OK por el resultado de una prueba simulada.

## Preparacion

- [ ] `git status` limpio, rama de desarrollo actualizada.
- [ ] Todas las migraciones incrementales aplicadas en orden a una rama de Neon de desarrollo.
- [ ] `database/20261020_cajero_release_verificacion.sql` devuelve solo OK (incluye indices unicos).
- [ ] `JWT_SECRET` configurado en `.env` fuera de Git.
- [ ] Credenciales activas para administrador, cajero, mesero y cocina.
- [ ] `node --test backend/test/*.test.cjs` termina sin errores.
- [ ] `node backend/scripts/release-smoke.cjs` pasa con el backend iniciado.

## Flujo completo del restaurante

- [ ] Escanear el QR de una mesa con token valido y crear pedido.
- [ ] Intentar usar QR invalido; no debe permitir operar otra mesa.
- [ ] Cocina recibe y cambia el estado del pedido autenticada.
- [ ] Mesero marca el pedido como entregado; cambia la vista del cajero.
- [ ] Una cuenta con un plato entregado y otro en cocina solo habilita cobro parcial.

## Cobro y comprobantes

- [ ] Efectivo: S/ 35.00 con S/ 50.00 recibido => S/ 15.00 de vuelto en `pagos`.
- [ ] Efectivo insuficiente => no hay nuevo pago.
- [ ] Yape/Plin/tarjeta exige codigo de aprobacion manual; no supone validacion bancaria.
- [ ] Reintentar el mismo cobro con la misma `idempotency_key` => mismo pago sin duplicar.
- [ ] Reusar una clave con parametros diferentes => HTTP 409.
- [ ] Boleta con DNI y factura con RUC y razon social guardan campos correctos.
- [ ] Alterar `precio` en la peticion no cambia el precio del catalogo PostgreSQL.

## Turnos, movimientos y arqueo

- [ ] Cajero abre turno con fondo inicial e identidad del JWT.
- [ ] Un segundo intento de apertura del mismo cajero no duplica el turno.
- [ ] Los pagos nuevos se vinculan al `id_turno` activo.
- [ ] Registrar una reposicion y un gasto, y verificar suma del efectivo teorico.
- [ ] Retiro superior al efectivo disponible => rechazado.
- [ ] Cerrar con efectivo contado diferente al esperado y verificar faltante/sobrante.
- [ ] Un turno cerrado ya no admite pagos ni movimientos nuevos.
- [ ] El corte antiguo no vuelve a sumar pagos asociados a turnos modernos.

## Division de cuentas

- [ ] Crear dos participantes (Ana y Luis) de una cuenta de prueba.
- [ ] Pizza S/ 35.00: asignar S/ 15.00 a Ana y S/ 20.00 a Luis.
- [ ] No permitir que las asignaciones superen S/ 35.00.
- [ ] Cobrar S/ 15.00 a Ana: Luis conserva S/ 20.00 pendiente.
- [ ] El cobro normal no incluye dinero ya reservado a participantes.
- [ ] No cobrar producto aun no entregado ni transferirlo entre cuentas.
- [ ] Pago individual con reintento no genera un segundo pago.

## Autorizacion e integridad

- [ ] Sin JWT, las rutas privadas de Cajero devuelven HTTP 401.
- [ ] Un token de Cocina no puede registrar cobros ni abrir caja.
- [ ] Un trabajador suspendido no puede operar con JWT anterior.
- [ ] Los eventos publicos SSE no incluyen nombres, montos de pago ni tokens QR.
- [ ] No aparecen archivos `.env`, claves ni contrasenas en el diff de Git.

## Evidencia para la Pull Request

| Caso | Resultado real | Evidencia / incidencia |
|---|---|---|
| Tests automatizados | Pendiente | |
| Smoke HTTP | Pendiente | |
| QR -> cocina -> mesero -> caja | Pendiente | |
| Cobro parcial y comprobante | Pendiente | |
| Idempotencia | Pendiente | |
| Apertura, movimiento y arqueo | Pendiente | |
| Division por dos personas | Pendiente | |
| Roles y permisos | Pendiente | |

**Criterio de salida:** sin fallos criticos, CI aprobado, migraciones verificadas y revision del equipo. No fusionar con casos obligatorios sin probar.
# Checklist de QA manual — módulo Cajero

Usa este checklist en un ambiente de desarrollo, con datos de prueba y una cuenta de cajero. No lo ejecutes contra producción. Las pruebas automatizadas no sustituyen estas comprobaciones manuales.

## Preparación

- [ ] Confirma que el backend y el frontend apuntan a una base de datos de desarrollo.
- [ ] Comprueba que las migraciones del módulo Cajero están aplicadas en el orden previsto.
- [ ] Inicia sesión con un usuario de prueba que tenga el rol de cajero.
- [ ] Ten a mano una cuenta/mesa de prueba con productos entregados y pendientes.

## Acceso y autorización

- [ ] Inicia sesión y abre el panel del cajero.
- [ ] Comprueba que las páginas del módulo requieren autenticación.
- [ ] Comprueba que un usuario sin el rol autorizado no puede acceder a las rutas de cajero.
- [ ] Cierra sesión y confirma que las páginas protegidas no quedan accesibles.

## Cuenta y cobros

- [ ] Consulta una cuenta abierta y verifica que los productos, cantidades y precios coinciden con los datos de prueba.
- [ ] Intenta cobrar un importe inválido o superior al saldo pendiente; confirma que se rechaza sin registrar un pago.
- [ ] Registra un pago parcial válido y comprueba que el saldo pendiente se actualiza correctamente.
- [ ] Para efectivo, prueba un monto recibido insuficiente y confirma que no se registra el cobro.
- [ ] Para efectivo, prueba un monto válido y comprueba el cálculo del vuelto.
- [ ] Verifica que Yape, Plin y tarjeta requieren confirmación manual; no se debe asumir una verificación bancaria automática.
- [ ] Comprueba que un error del servidor no muestra un mensaje de cobro exitoso.
- [ ] Si ocurre un error de red durante un pago, reintenta la misma operación y confirma que se conserva la solicitud/idempotency key para evitar duplicados.

## División de cuenta

- [ ] Crea subcuentas de prueba y asigna productos o importes.
- [ ] Comprueba que los saldos individuales y el saldo reservado/libre son coherentes.
- [ ] Registra pagos separados y verifica los saldos actualizados.
- [ ] Simula un error de red y reintenta; confirma que el mismo pago no se duplica.

## Turnos, movimientos y cierre

- [ ] Abre un turno con un fondo inicial de prueba.
- [ ] Registra un ingreso y un retiro de prueba; revisa el historial y el efectivo teórico.
- [ ] Ejecuta el arqueo y compara el efectivo contado con el esperado.
- [ ] Cierra el turno y verifica que el resultado queda asociado al turno correcto.
- [ ] Repite una solicitud de cierre con la misma clave de idempotencia y confirma que no se crea un segundo cierre.
- [ ] Comprueba que los errores de base de datos revierten la transacción y no dejan operaciones parciales.

## Integración y seguridad

- [ ] Recorre el flujo de prueba QR → cocina → mesero → caja, según los datos disponibles.
- [ ] Confirma que los eventos de actualización no exponen datos privados del cobro.
- [ ] Verifica que los errores de migración no revelan detalles internos de PostgreSQL.
- [ ] Revisa que la consulta `database/20261020_cajero_release_verificacion.sql` sea de solo lectura antes de ejecutarla, y ejecútala solo en la base de desarrollo.

## Resultado

- Fecha y ambiente: ______________________________
- Versión/commit probado: ________________________
- Resultado: [ ] Aprobado  [ ] Requiere correcciones
- Incidencias y pasos para reproducirlas: __________

No marques una comprobación como aprobada si no se ejecutó. No uses dinero real ni datos de clientes durante estas pruebas.
