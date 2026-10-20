

BEGIN;

-- 1) Agregar los campos a la tabla que YA existe.
ALTER TABLE public.pagos
    ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS vuelto NUMERIC(12,2);

-- 2) Los pagos antiguos no tienen informacion del efectivo entregado.
--    No inventamos ese monto: se conserva como NULL.
--    El vuelto historico queda en 0 por compatibilidad.
ALTER TABLE public.pagos
    ALTER COLUMN vuelto SET DEFAULT 0;

UPDATE public.pagos
SET vuelto = 0
WHERE vuelto IS NULL;

ALTER TABLE public.pagos
    ALTER COLUMN vuelto SET NOT NULL;

-- 3) Agregar reglas una sola vez. PostgreSQL no ofrece
--    ADD CONSTRAINT IF NOT EXISTS para CHECK; se usa pg_constraint.
DO $migracion$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pagos'::regclass
          AND conname = 'ck_cajero_monto_recibido_no_negativo'
    ) THEN
        ALTER TABLE public.pagos
            ADD CONSTRAINT ck_cajero_monto_recibido_no_negativo
            CHECK (monto_recibido IS NULL OR monto_recibido >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pagos'::regclass
          AND conname = 'ck_cajero_vuelto_no_negativo'
    ) THEN
        ALTER TABLE public.pagos
            ADD CONSTRAINT ck_cajero_vuelto_no_negativo
            CHECK (vuelto >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pagos'::regclass
          AND conname = 'ck_cajero_vuelto_consistente'
    ) THEN
        ALTER TABLE public.pagos
            ADD CONSTRAINT ck_cajero_vuelto_consistente
            CHECK (
                (
                    metodo_pago = 'efectivo'
                    AND (
                        -- Pagos historicos: aun no se conocia el recibido.
                        (monto_recibido IS NULL AND vuelto = 0)
                        OR
                        -- Pagos nuevos: el recibido cubre el importe y
                        -- el vuelto coincide con la diferencia exacta.
                        (
                            monto_recibido IS NOT NULL
                            AND monto_recibido >= monto
                            AND vuelto = monto_recibido - monto
                        )
                    )
                )
                OR
                (
                    -- Otros medios de pago no manejan efectivo ni vuelto.
                    metodo_pago <> 'efectivo'
                    AND monto_recibido IS NULL
                    AND vuelto = 0
                )
            );
    END IF;
END;
$migracion$;

COMMIT;

-- ============================================================
-- VERIFICACION OPCIONAL (solo lectura):
-- Ejecutar estas consultas desde el SQL Editor de Neon.
-- ============================================================
-- SELECT column_name, data_type, numeric_precision, numeric_scale,
--        is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'pagos'
--   AND column_name IN ('monto_recibido', 'vuelto')
-- ORDER BY column_name;
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.pagos'::regclass
--   AND conname LIKE 'ck_cajero_%'
-- ORDER BY conname;
