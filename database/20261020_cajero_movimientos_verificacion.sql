-- ============================================================================
-- MENUGO | COMMIT 14/20 | Verificacion de movimientos de caja
-- SOLO CONSULTAS. No modifica datos de Neon.
-- Ejecutar despues de 20261020_cajero_movimientos_caja.sql.
-- ============================================================================

-- 1. Tabla y tipos. Se esperan 11 columnas.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'movimientos_caja'
ORDER BY ordinal_position;

-- 2. Dos FK y cinco CHECK, ademas de la clave primaria.
SELECT conname AS restriccion, contype AS tipo,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.movimientos_caja'::regclass
ORDER BY conname;

-- 3. Indice de consulta e indice UNIQUE para idempotencia.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'movimientos_caja'
ORDER BY indexname;

-- 4. Verificar el trigger de inmutabilidad y el estado del turno.
SELECT tgname AS trigger, pg_get_triggerdef(oid) AS definicion
FROM pg_trigger
WHERE tgrelid = 'public.movimientos_caja'::regclass
  AND NOT tgisinternal;

-- 5. Confirmar que la vista de totales esta disponible.
SELECT table_schema, table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'v_resumen_movimientos_caja';

-- 6. Ver movimientos existentes, sin exponer credenciales ni modificar filas.
SELECT m.id_movimiento, m.id_turno, m.tipo, m.categoria,
       m.monto, m.motivo, m.registrado_at
FROM public.movimientos_caja m
ORDER BY m.id_movimiento DESC
LIMIT 10;

-- 7. Totales por turno, incluyendo turnos que todavia no tienen movimientos.
SELECT t.id_turno, t.estado, t.fondo_inicial,
       r.total_ingresos, r.total_retiros,
       r.saldo_movimientos, r.cantidad_movimientos
FROM public.turnos_caja t
JOIN public.v_resumen_movimientos_caja r ON r.id_turno = t.id_turno
ORDER BY t.id_turno DESC
LIMIT 20;

-- 8. Comprobacion de que no existe monto <= 0 (deberia devolver 0).
SELECT COUNT(*) AS movimientos_con_monto_invalido
FROM public.movimientos_caja
WHERE monto <= 0;
