# Notas de versión — Cajero 1.0.0

## Resumen

Primera versión del módulo Cajero integrado con MenuGo, enfocada en el cobro de cuentas, el control de efectivo y la división de cuentas.

## Funcionalidades

- Cobros parciales de productos entregados y cálculo de vuelto para pagos en efectivo.
- Métodos de pago en efectivo, Yape, Plin y tarjeta. Yape, Plin y tarjeta requieren confirmación manual del cajero; no se incluye verificación bancaria automática.
- Protección contra pagos duplicados mediante claves de idempotencia y validaciones del lado del servidor.
- Apertura y cierre de turnos, registro de ingresos y retiros, consulta de movimientos y arqueo de caja.
- Creación de subcuentas, asignación de productos/importes y pagos individuales.
- Protección de rutas y endpoints del módulo mediante autenticación y roles.
- Pruebas automatizadas del backend y scripts de smoke de solo lectura.

## Base de datos y despliegue

- Revisa las migraciones incrementales disponibles en `database/` y aplícalas en orden en un ambiente de desarrollo antes de cualquier despliegue.
- Realiza y verifica un backup antes de aplicar cambios a una base con datos reales.
- Ejecuta el checklist manual de `docs/CHECKLIST_QA_CAJERO.md` en desarrollo.
- La consulta `database/20261020_cajero_release_verificacion.sql` es de auditoría; inspecciónala y ejecútala únicamente como consulta de solo lectura.

## Limitaciones

- Los pagos con Yape, Plin y tarjeta se confirman manualmente; no hay integración de verificación con entidades bancarias.
- Las pruebas automatizadas usan simulaciones y no validan una conexión real a Neon.
- El smoke HTTP está diseñado para usar solicitudes GET y no debe utilizarse como prueba de operaciones que modifiquen dinero.

## Validación

Antes de integrar o desplegar, ejecuta `node --test backend/test/*.test.cjs`, revisa `git diff --check` y completa las pruebas manuales en un ambiente de desarrollo. No se afirma aquí que dichas verificaciones se hayan ejecutado para un despliegue concreto.
