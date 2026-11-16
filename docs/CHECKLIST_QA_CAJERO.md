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
