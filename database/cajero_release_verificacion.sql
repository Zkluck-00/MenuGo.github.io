-- MenuGo - Commit 20. AUDITORIA SQL DE SOLO LECTURA.
-- Ejecutar en la rama de desarrollo de Neon despues de todas las migraciones.
-- Si algun resultado es FALLA, no hacer merge hasta corregir el esquema.

WITH auditoria (comprobacion, correcto) AS (
  VALUES
    ('Tabla turnos_caja', to_regclass('public.turnos_caja') IS NOT NULL),
    ('Tabla movimientos_caja', to_regclass('public.movimientos_caja') IS NOT NULL),
    ('Tabla subcuentas', to_regclass('public.subcuentas') IS NOT NULL),
    ('Tabla subcuenta_detalle', to_regclass('public.subcuenta_detalle') IS NOT NULL),
    ('Vista v_subcuentas_resumen', to_regclass('public.v_subcuentas_resumen') IS NOT NULL),
    ('Columna pagos.id_turno', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pagos' AND column_name = 'id_turno'
    )),
    ('Columna pagos.id_subcuenta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pagos' AND column_name = 'id_subcuenta'
    )),
    ('Columna pagos.monto_recibido', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pagos' AND column_name = 'monto_recibido'
    )),
    ('Columna pagos.vuelto', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pagos' AND column_name = 'vuelto'
    )),
    ('Columna pagos.idempotency_key', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pagos' AND column_name = 'idempotency_key'
    )),
    ('Indice unico de turnos abiertos', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'turnos_caja'
        AND indexname = 'ux_turnos_caja_abiertos'
        AND indexdef ILIKE '%UNIQUE%'
    )),
    ('Indice unico de idempotencia de pagos', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'pagos'
        AND indexname = 'ux_pagos_idempotency_key'
        AND indexdef ILIKE '%UNIQUE%'
    )),
    ('Indice unico de cierre idempotente', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'turnos_caja'
        AND indexname = 'ux_turnos_cierre_idempotency_key'
        AND indexdef ILIKE '%UNIQUE%'
    ))
)
SELECT comprobacion, CASE WHEN correcto THEN 'OK' ELSE 'FALLA' END AS resultado
FROM auditoria
ORDER BY CASE WHEN correcto THEN 1 ELSE 0 END, comprobacion;

