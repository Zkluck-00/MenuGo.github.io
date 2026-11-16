## Resumen del cambio

- [ ] Incluye solamente cambios revisados en `feature/cajero-mejoras`.
- [ ] Explica las funcionalidades y el impacto sobre otros roles.

## Pruebas y evidencia

- [ ] `node --test backend/test/*.test.cjs` sin fallos.
- [ ] `git diff --check` sin problemas.
- [ ] Workflow `Pruebas automatizadas del cajero` aprobado en GitHub Actions.
- [ ] Checklist `docs/CHECKLIST_QA_CAJERO.md` ejecutado en ambiente de desarrollo.
- [ ] Flujo QR -> cocina -> mesero -> caja verificado.
- [ ] Roles y accesos no autorizados comprobados.

## Base de datos y seguridad

- [ ] Backup de Neon confirmado antes de migraciones.
- [ ] Migraciones aplicadas en orden en la base de desarrollo.
- [ ] `database/20261020_cajero_release_verificacion.sql` indica solo OK.
- [ ] No se suben `.env`, contrasenas, URLs secretas ni tokens.
- [ ] Cobros, movimientos, subcuentas y cierres revisados en PostgreSQL.
- [ ] No se borran ni se duplican pagos historicos.

## Integracion

- [ ] La rama contiene el commit 19 y la pantalla `Frontend/Cajero/dividir_cuenta.html`.
- [ ] Rama actualizada respecto de `main` y conflictos resueltos (si los hubo).
- [ ] Usar **Create a merge commit** para conservar el historial de los commits.
- [ ] Crear la etiqueta `cajero-v1.0.0` solo despues de fusionar y verificar `main`.

## Observaciones / pruebas pendientes

Describe aqui las validaciones manuales, las limitaciones y cualquier riesgo antes del merge.
