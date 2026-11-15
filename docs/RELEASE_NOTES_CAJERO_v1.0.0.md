# MenuGo - Notas de version del modulo Cajero 1.0.0

**Etiqueta propuesta:** `cajero-v1.0.0` (se crea unicamente despues del merge exitoso).  
**Rama de desarrollo:** `feature/cajero-mejoras`  
**Rama de release:** `main`

## Funcionalidades incluidas

- Dashboard de cuentas pendientes, entregas y ventas del cajero.
- Cobros parciales de productos entregados y calculo de vuelto desde PostgreSQL.
- Metodos efectivo, Yape, Plin, tarjeta de credito y debito con referencias manuales.
- Validaciones de metodo, cantidades, precios de catalogo e importes.
- Prevencion de pagos duplicados mediante claves de idempotencia.
- Autenticacion JWT y autorizacion segun los roles del personal.
- Apertura de turnos con fondo inicial y pagos asociados al turno.
- Movimientos manuales de efectivo (ingresos, gastos y retiros).
- Arqueo y cierre con efectivo contado y diferencias.
- Division de cuentas por personas, asignacion de importes y pagos individuales.
- Pruebas automatizadas de controladores, interfaces y contratos de integracion.

## Compatibilidad y datos

- Base de datos: PostgreSQL/Neon. Las migraciones deben aplicarse a una base de desarrollo antes de promover cambios.
- Los pagos historicos conservan su relacion con el corte antiguo; no se reasignan a turnos o personas.
- Se requieren `JWT_SECRET`, trabajadores activos y un turno abierto para registrar nuevos cobros.
- Las funciones de cobro dependen de las migraciones del modulo Cajero.

## Limitaciones conocidas

- Las confirmaciones Yape, Plin y tarjeta **no son verificaciones bancarias automaticas**. El personal debe constatar el pago.
- Las pruebas automatizadas utilizan dobles/simulaciones de PostgreSQL y DOM; no sustituyen pruebas sobre Neon de desarrollo.
- Las migraciones SQL no se revierten al revertir un commit Git. Es necesario plan de respaldo y restauracion.
- El manejo del acceso remoto y la infraestructura depende de las variables de entorno, CORS y los permisos del despliegue.

## Criterios antes del merge

1. Publicar commits 19 y 20 en `feature/cajero-mejoras`.
2. Ejecutar todas las pruebas y el smoke HTTP de solo lectura.
3. Ejecutar `database/20261020_cajero_release_verificacion.sql` y completar `docs/CHECKLIST_QA_CAJERO.md` en Neon de desarrollo.
4. Comprobar GitHub Actions en el head de la Pull Request y ausencia de secretos.
5. Revisar y fusionar mediante **Create a merge commit** para preservar el historial.

## Versionado

La etiqueta `cajero-v1.0.0` identifica la primera entrega del modulo de Cajero. No cambia por si sola la version del paquete npm del backend.
