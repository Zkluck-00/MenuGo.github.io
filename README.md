# MenuGo

Sistema web para restaurante con pedidos por QR, cocina, mesero, administrador y cajero.

## Arquitectura

- Frontend: HTML, Tailwind CSS y JavaScript.
- Backend: Node.js, Express, JWT.
- Base de datos: PostgreSQL / Neon.
- Actualizacion de pedidos: Server-Sent Events (SSE).

## Inicio local

1. Copia `backend/.env.example` a `backend/.env` y configura tu base de desarrollo y `JWT_SECRET`.
2. Desde la carpeta `backend`, ejecuta `npm ci` y `npm run dev`.
3. Abre `Frontend/` con tu servidor local habitual (por ejemplo Live Server).
4. Ingresa con un trabajador real en el rol correspondiente.

No compartas el `.env`. No ejecutes el SQL completo de creacion sobre una base con datos reales: utiliza las migraciones incrementales de `database/` y genera un backup.

## Módulo Cajero

Incluye cuentas por mesa, cobro parcial, efectivo y vuelto, metodos digitales con confirmacion manual, subcuentas, turnos, ingresos/retiros, arqueo y cierre.

**Limitacion:** los pagos Yape, Plin y tarjeta requieren confirmacion manual del cajero; no existe verificacion bancaria automatica. Las pruebas automatizadas usan simulaciones, no Neon real.

## Pruebas

Desde la raiz de MenuGo:

```bash
node --test backend/test/*.test.cjs
node backend/scripts/release-smoke.cjs
```

La segunda instruccion requiere que el backend local este ejecutandose y solo envia solicitudes GET.

## Documentacion de release

- [Checklist de pruebas manuales](docs/CHECKLIST_QA_CAJERO.md)
- [Auditoria SQL (Neon, solo lectura)](database/20261020_cajero_release_verificacion.sql)
- [Notas de la version Cajero 1.0.0](docs/RELEASE_NOTES_CAJERO_v1.0.0.md)
- [Commit 20 y pasos del merge](docs/COMMIT_20_RELEASE_MERGE.md)
- [Evidencia de pruebas locales](docs/EVIDENCIA_COMMIT_20.md)

La rama de trabajo se integra en `main` mediante Pull Request despues de aprobar las pruebas y verificar el estado de las migraciones.
