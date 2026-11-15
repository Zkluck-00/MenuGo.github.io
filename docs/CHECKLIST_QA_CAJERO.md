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
