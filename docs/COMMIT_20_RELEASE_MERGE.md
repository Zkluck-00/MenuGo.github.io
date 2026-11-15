# MenuGo - Commit 20/20 y merge a main

## Alcance del commit

Este commit incorpora pruebas de contratos de release, un smoke HTTP sin operaciones de escritura, un workflow de GitHub Actions mas amplio y documentacion para la Pull Request. No modifica controladores, tablas ni flujos monetarios existentes.

### Archivos

| Archivo | Accion |
|---|---|
| `backend/test/release.contratos.test.cjs` | Crear |
| `backend/test/release.smoke.test.cjs` | Crear |
| `backend/scripts/release-smoke.cjs` | Crear |
| `.github/workflows/pruebas-cajero.yml` | Reemplazar por archivo completo |
| `.github/PULL_REQUEST_TEMPLATE.md` | Crear |
| `README.md` | Crear en la raiz |
| `database/20261020_cajero_release_verificacion.sql` | Crear (auditoria SQL de solo lectura) |
| `docs/CHECKLIST_QA_CAJERO.md` | Crear |
| `docs/RELEASE_NOTES_CAJERO_v1.0.0.md` | Crear |
| `docs/COMMIT_20_RELEASE_MERGE.md` | Crear (esta guia) |
| `docs/EVIDENCIA_COMMIT_20.md` | Crear (resultado local documentado) |

## Requisito: publicar el commit 19 primero

Antes de preparar el merge comprueba que el archivo `Frontend/Cajero/dividir_cuenta.html` aparece en GitHub en `feature/cajero-mejoras`. Si no, realiza `git push origin feature/cajero-mejoras` desde el proyecto donde agregaste el commit 19.

```bash
git switch feature/cajero-mejoras
git status
git log -4 --oneline
```

No apliques los archivos del commit 20 sobre una rama sin el commit 19.

## Pruebas automaticas

Con Node.js 20+ desde la raiz del repositorio:

```bash
node --check backend/scripts/release-smoke.cjs
node --check backend/test/release.contratos.test.cjs
node --test backend/test/release.contratos.test.cjs backend/test/release.smoke.test.cjs
node --test backend/test/*.test.cjs
```

El numero de tests puede cambiar con nuevos cambios. Lo importante es `fail 0`.

### Smoke HTTP: solo lectura

Con el backend iniciado en desarrollo:

```bash
node backend/scripts/release-smoke.cjs
```

Por defecto consulta `http://127.0.0.1:4000`: endpoint health y varias rutas sin JWT que deben responder 401. **Nunca** registra pagos, turnos ni movimientos. Si deseas probar consultas autenticadas de Cajero, configura temporalmente `MENUGO_CAJERO_TOKEN` como variable de entorno en una terminal segura y no lo compartas ni lo subas a Git.

Usa `MENUGO_BASE_URL` solo para un origen de confianza. Los tokens se bloquean sobre HTTP externo sin TLS.

### Validacion manual con Neon

Ejecuta `database/20261020_cajero_release_verificacion.sql` en SQL Editor: todos los renglones deben indicar **OK**. Luego completa `docs/CHECKLIST_QA_CAJERO.md` usando una rama de Neon de desarrollo y consumos de prueba. No se pueden afirmar pruebas de integracion completas usando solamente test dobles.

## Commit 20

```bash
git switch feature/cajero-mejoras
git status
git diff --check

git add backend/test/release.contratos.test.cjs backend/test/release.smoke.test.cjs backend/scripts/release-smoke.cjs
git add .github/workflows/pruebas-cajero.yml .github/PULL_REQUEST_TEMPLATE.md
git add README.md database/20261020_cajero_release_verificacion.sql docs/CHECKLIST_QA_CAJERO.md docs/RELEASE_NOTES_CAJERO_v1.0.0.md docs/EVIDENCIA_COMMIT_20.md docs/COMMIT_20_RELEASE_MERGE.md

git diff --cached --check
git diff --cached --stat
git commit -m "chore(release): validar modulo cajero y preparar merge a main"
git push origin feature/cajero-mejoras
```

Luego confirma los archivos en GitHub y la ejecucion de Actions.

## Pull Request (recomendada, no merge directo)

1. Abre `https://github.com/Zkluck-00/MenuGo.github.io/compare/main...feature/cajero-mejoras?expand=1`.
2. Comprueba **base: main** y **compare: feature/cajero-mejoras**.
3. Titulo recomendado: `release(cajero): integrar modulo completo de caja a main`.
4. Pega el siguiente resumen y la evidencia de las pruebas:

> Se integra el modulo Cajero de MenuGo: dashboard, cobros parciales y validaciones, pagos idempotentes, JWT, apertura de turnos, movimientos, arqueo y cierre, y division de cuentas por persona. Se anaden pruebas de regresion, smoke HTTP de solo lectura, documentacion y checklist de QA. Verificaciones: `node --test backend/test/*.test.cjs`, GitHub Actions y casos manuales en Neon de desarrollo. Migraciones aplicadas de forma incremental con backup. No incluye datos ni credenciales reales.

5. Abre la Pull Request, revisa **Files changed** y comprueba que la pantalla `dividir_cuenta.html` y los archivos del commit 20 aparecen.
6. Confirma que Actions termine verde en el commit exacto del PR. Revisa incidencias y conflictos con el equipo.
7. Selecciona **Merge pull request > Create a merge commit**. No uses Squash and merge si quieres que se vean los 20 commits individuales en el historial de `main`.
8. Confirma el merge. No elimines la rama de respaldo.

## Si hay conflictos

Actualiza las referencias antes de fusionar. Puedes resolver los conflictos de forma local:

```bash
git fetch origin
git switch feature/cajero-mejoras
git merge origin/main
# Resolver los archivos en conflicto; verificar que no se pierdan los cambios.
node --test backend/test/*.test.cjs
git add -A
git commit
git push origin feature/cajero-mejoras
```

Haz esto **solo si** Git indica conflictos. Nunca uses `git push --force` para resolverlos.

## Tras un merge correcto

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git tag -a cajero-v1.0.0 -m "Release del modulo Cajero de MenuGo"
git push origin cajero-v1.0.0
```

Crea la etiqueta una sola vez y unicamente cuando `main` ya contenga la funcionalidad revisada. En GitHub: **Releases > Draft a new release > Tag cajero-v1.0.0**, usa las notas de `docs/RELEASE_NOTES_CAJERO_v1.0.0.md`.

## Plan de reversa

Ante un problema posterior al merge, bloquea nuevos cobros si hay riesgo contable, conserva registros para auditoria y utiliza la opcion **Revert** en la Pull Request si aplica. Para un merge commit se puede evaluar `git revert -m 1 SHA_DEL_MERGE`, con revision del equipo; esto revierte el codigo pero **no** deshace migraciones ni pagos ya registrados. La restauracion de PostgreSQL debe planearse aparte. Nunca borres `public` ni ejecutes scripts `DROP SCHEMA` en produccion.
