# MenuGo | Commit 24: pruebas finales y cierre del modulo de tickets

**Rama:** `feature/cajero-tickets`  
**Mensaje recomendado:** `test(ci): validar PDFs termicos reales y cerrar modulo de tickets`

## 1. Objetivo

Finalizar la primera version academica del sistema de tickets del Cajero (commits 21-24). Se mantienen las funcionalidades existentes sin reescribir pagos, cuentas o tablas PostgreSQL. Este commit refuerza el proceso de calidad y la documentacion.

## 2. Archivos incluidos (rutas relativas a la raiz del proyecto)

| Archivo | Accion | Motivo |
| --- | --- | --- |
| `.github/workflows/pruebas-cajero.yml` | Reemplazar | Ejecutar CI en push a `feature/cajero-tickets`, instalar dependencias con lockfile y comprobar PDF real |
| `backend/scripts/ticket-release-check.cjs` | Crear | Smoke test de PDFKit sin BD y sin impresora fisica |
| `backend/test/ticket.release.contratos.test.cjs` | Crear | Regresion de CI, seguridad, formatos y documentacion |
| `docs/MODULO_TICKETS_CAJERO.md` | Crear | Manual tecnico consolidado de commits 21-24 |
| `docs/CHECKLIST_QA_TICKETS.md` | Crear | Checklist de verificaciones de aceptacion, evidencias y errores |
| `docs/COMMIT_24_CIERRE_TICKETS.md` | Crear | Esta guia de entrega y publicacion |

**Sin migraciones SQL ni cambios en `package.json` o `package-lock.json`.** PDFKit `0.20.2` ya debe estar instalado/declarado desde el commit 21.

## 3. Instalacion y verificacion

Extrae el ZIP sobre la **raiz de MenuGo**, conservando las carpetas `.github`, `backend` y `docs`.

```bash
git switch feature/cajero-tickets
git status
npm ci --prefix backend
node --check backend/scripts/ticket-release-check.cjs
node --check backend/test/ticket.release.contratos.test.cjs
node --test backend/test/ticket.release.contratos.test.cjs
node --test backend/test/*.test.cjs
node backend/scripts/ticket-release-check.cjs
```

El comando del smoke real deberia informar tres verificaciones `OK`: completo 58 mm, completo 80 mm y parcial 58 mm. Revisa tambien `docs/CHECKLIST_QA_TICKETS.md` en una sesion real del Cajero; las pruebas sin Neon no sustituyen esos casos.

## 4. Comandos Git

```bash
git add .github/workflows/pruebas-cajero.yml
git add backend/scripts/ticket-release-check.cjs backend/test/ticket.release.contratos.test.cjs
git add docs/MODULO_TICKETS_CAJERO.md docs/CHECKLIST_QA_TICKETS.md docs/COMMIT_24_CIERRE_TICKETS.md
git commit -m "test(ci): validar PDFs termicos reales y cerrar modulo de tickets"
git push origin feature/cajero-tickets
```

GitHub Actions se ejecutara en el push a la nueva rama. En la pestaña Actions, abre «Pruebas automatizadas del cajero». Deben aparecer en verde:

1. Preparar Node.js 20.
2. Instalar dependencias mediante `npm ci`.
3. Verificar sintaxis JavaScript.
4. Ejecutar pruebas automatizadas.
5. Comprobar PDF termico real sin base de datos.

Si el workflow falla, abre el paso rojo para ver el error concreto. No ocultes ni elimines las pruebas con fallos.

## 5. Pull Request de integracion

Abre una PR `feature/cajero-tickets` -> `main` despues de verificar los pasos anteriores. Descripcion sugerida:

> Implementa tickets termicos internos de 58/80 mm usando PDFKit, simulacion visual de impresora, descarga, vista previa y reimpresion desde historial de pagos y comprobantes. Mantiene los datos reales de PostgreSQL, JWT, autorizacion de acceso a pagos propios, y evita cobros duplicados. Incluye pruebas automatizadas, smoke PDF real, checklist QA y manual tecnico. No implementa facturacion electronica SUNAT ni requiere impresora fisica.

Fusiona la PR **solo cuando el CI este verde, el historial sea correcto y no existan conflictos**. El merge debe hacerlo un colaborador con permisos de escritura. Si deseas conservar los commits separados para tu exposicion, elige «Create a merge commit».

## 6. Evidencias academicas

Capturas recomendadas: commits 21-24 en la rama, workflow en verde, salida del smoke PDF, registro de cobro, animacion, ticket 58 mm, ticket 80 mm, descarga, visor de impresion, reimpresion desde ambos historiales y checklist QA completado.

**Nota:** `docs/` contiene explicaciones y checklist; por lo general no altera el comportamiento de Caja, pero existen pruebas que verifican la presencia de algunos documentos, por lo que deben permanecer versionados.
