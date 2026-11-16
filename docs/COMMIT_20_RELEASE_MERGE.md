# Integración del release Cajero — commit 20

Este documento registra los pasos de integración previstos para la rama `feature/cajero-mejoras`. No implica que el commit, la revisión, el merge o el despliegue ya hayan ocurrido.

## Antes de integrar

1. Actualiza la rama de trabajo respecto de `main` y resuelve cualquier conflicto.
2. Ejecuta desde la raíz del repositorio:

   ```bash
   node --test backend/test/*.test.cjs
   git diff --check
   ```

3. Revisa en GitHub Actions que el workflow **Pruebas automatizadas del cajero** haya terminado correctamente.
4. Completa `docs/CHECKLIST_QA_CAJERO.md` en un ambiente de desarrollo y anota cualquier incidencia.
5. Revisa las migraciones de `database/`, confirma un backup antes de operar sobre cualquier base con datos y valida el esquema en desarrollo.
6. Confirma que no se hayan incluido `.env`, credenciales, tokens ni URLs secretas.
7. Verifica los cambios funcionales y sus efectos en los roles de administrador, mesero, cocina y cajero.

## Pull request y merge

1. Revisa que el Pull Request describa los cambios y las pruebas efectivamente realizadas.
2. Espera la aprobación requerida y que todos los checks estén verdes.
3. Si corresponde al proceso del equipo, integra mediante **Create a merge commit** para conservar el historial de commits.
4. Después del merge, verifica `main` y el workflow resultante.
5. Crea la etiqueta `cajero-v1.0.0` solo después de confirmar el merge y la verificación de `main`.

## Despliegue

El despliegue es un paso separado. Antes de aplicarlo, confirma el ambiente destino, el plan de migración y el procedimiento de recuperación. No ejecutes migraciones destructivas o pruebas que alteren pagos en producción como parte del smoke test.
