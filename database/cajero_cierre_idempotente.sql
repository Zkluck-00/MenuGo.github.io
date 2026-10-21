-- MenuGo | Commit 16/20 | Auditoria e idempotencia del cierre de turno.
-- Aplica DESPUES de los commits 12 y 14; usa una rama de desarrollo Neon.
-- Migracion transaccional, sin borrar ni alterar pagos historicos.
BEGIN;

DO $dependencias$
BEGIN
  IF to_regclass('public.turnos_caja') IS NULL OR
     to_regclass('public.movimientos_caja') IS NULL THEN
    RAISE EXCEPTION 'Ejecuta primero las migraciones de los commits 12 y 14.';
  END IF;
END;
$dependencias$;

ALTER TABLE public.turnos_caja
  ADD COLUMN IF NOT EXISTS observaciones_cierre TEXT,
  ADD COLUMN IF NOT EXISTS cierre_idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cierre_idempotency_hash VARCHAR(64);

DO $integridad$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turnos_caja'::regclass
      AND conname = 'ck_turnos_cierre_idempotente'
  ) THEN
    ALTER TABLE public.turnos_caja ADD CONSTRAINT ck_turnos_cierre_idempotente
    CHECK (
      (cierre_idempotency_key IS NULL AND cierre_idempotency_hash IS NULL)
      OR (
        estado = 'cerrado'
        AND cierre_idempotency_key IS NOT NULL
        AND cierre_idempotency_hash IS NOT NULL
        AND char_length(cierre_idempotency_key) BETWEEN 16 AND 100
        AND cierre_idempotency_key = btrim(cierre_idempotency_key)
        AND cierre_idempotency_key !~ '[[:cntrl:]]'
        AND cierre_idempotency_hash ~ '^[0-9a-f]{64}$'
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turnos_caja'::regclass
      AND conname = 'ck_turnos_observaciones_cierre'
  ) THEN
    ALTER TABLE public.turnos_caja ADD CONSTRAINT ck_turnos_observaciones_cierre
    CHECK (observaciones_cierre IS NULL OR char_length(observaciones_cierre) <= 500);
  END IF;
END;
$integridad$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_turnos_cierre_idempotency_key
  ON public.turnos_caja (cierre_idempotency_key)
  WHERE cierre_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.turnos_caja.observaciones_cierre IS
  'Notas registradas en el arqueo; se preservan las observaciones de apertura.';
COMMENT ON COLUMN public.turnos_caja.cierre_idempotency_key IS
  'Identificador estable de la solicitud logica de cierre, para reintentos seguros.';
COMMENT ON COLUMN public.turnos_caja.cierre_idempotency_hash IS
  'SHA256 del cajero, turno, efectivo contado y observaciones canonicas.';

COMMIT;
