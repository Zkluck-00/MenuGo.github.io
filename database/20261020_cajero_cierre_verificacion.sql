-- MenuGo | Commit 16/20 | Ejecutar despues de la migracion.
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'turnos_caja'
  AND column_name IN ('observaciones_cierre', 'cierre_idempotency_key', 'cierre_idempotency_hash')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'turnos_caja'
  AND indexname = 'ux_turnos_cierre_idempotency_key';

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.turnos_caja'::regclass
  AND conname IN ('ck_turnos_cierre_idempotente', 'ck_turnos_observaciones_cierre');

SELECT id_turno, id_cajero, estado, fondo_inicial, efectivo_esperado,
       efectivo_contado, diferencia, abierto_at, cerrado_at, observaciones_cierre
FROM public.turnos_caja
ORDER BY id_turno DESC LIMIT 10;
