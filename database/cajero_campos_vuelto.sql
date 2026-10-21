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
