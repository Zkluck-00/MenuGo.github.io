          AND conname = 'ck_pagos_idempotencia_formato'
    ) THEN
        ALTER TABLE public.pagos
            ADD CONSTRAINT ck_pagos_idempotencia_formato
            CHECK (
                (idempotency_key IS NULL AND idempotency_hash IS NULL)
                OR
                (
                    idempotency_key IS NOT NULL
                    AND idempotency_hash IS NOT NULL
                    AND char_length(idempotency_key) BETWEEN 16 AND 100
                    AND idempotency_key = btrim(idempotency_key)
                    AND idempotency_key !~ '[[:cntrl:]]'
                    AND idempotency_hash ~ '^[0-9a-f]{64}$'
                )
            );
    END IF;
END;
$migracion$;

-- 3. Diagnostico previo: si hay claves duplicadas de una migracion
--    anterior, detenerse sin modificar pagos ni crear un indice incompleto.
DO $diagnostico$
DECLARE
    clave_duplicada VARCHAR(100);
BEGIN
    SELECT idempotency_key INTO clave_duplicada
    FROM public.pagos
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1
    LIMIT 1;

    IF clave_duplicada IS NOT NULL THEN
        RAISE EXCEPTION
            'Ya existen pagos con claves de idempotencia duplicadas. Revisar pagos antes de crear el indice unico.';
    END IF;
END;
$diagnostico$;

-- 4. Solo puede existir un pago por clave (incluyendo solicitudes
--    simultaneas). Los NULL historicos quedan fuera del indice.
--    No aplicar UNIQUE al hash: dos ventas distintas pueden coincidir
--    en su contenido y deben seguir siendo transacciones independientes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_idempotency_key
    ON public.pagos (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 5. Documentar las columnas para futuras tareas del equipo.
COMMENT ON COLUMN public.pagos.idempotency_key IS
    'Identificador estable de un intento logico de pago; unico para prevenir cobros repetidos.';
COMMENT ON COLUMN public.pagos.idempotency_hash IS
    'Huella SHA-256 hexadecimal de los parametros canonicos del intento de pago; permite detectar reutilizacion incorrecta de la clave.';

COMMIT;
