-- ============================================================================
-- MenuGo - Commit 17 | Verificacion de solo lectura para Neon PostgreSQL
-- Ejecutar DESPUES de database/20261020_cajero_subcuentas.sql.
-- No modifica ningun registro ni crea pedidos/pagos de prueba.
-- ============================================================================

-- 1) Deben existir 4 objetos: dos tablas y dos vistas.
SELECT nombre,
       to_regclass('public.' || nombre) IS NOT NULL AS existe
FROM (VALUES
    ('subcuentas'), ('subcuenta_detalle'),
    ('v_subcuentas_resumen'), ('v_distribucion_cuenta')
) AS objetos(nombre)
ORDER BY nombre;

-- 2) Columnas de nuevas tablas y referencia opcional de pagos.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('subcuentas', 'subcuenta_detalle', 'pagos')
  AND (
      table_name IN ('subcuentas', 'subcuenta_detalle')
      OR column_name = 'id_subcuenta'
  )
ORDER BY table_name, ordinal_position;

-- 3) Claves foraneas y restricciones (incluida la FK compuesta).
SELECT conrelid::regclass AS tabla, conname AS restriccion,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN (
    'public.subcuentas'::regclass,
    'public.subcuenta_detalle'::regclass,
    'public.pagos'::regclass
)
  AND (conrelid <> 'public.pagos'::regclass
       OR conname = 'fk_pagos_subcuenta_misma_cuenta')
ORDER BY 1, 2;

-- 4) Verificar triggers activos de integridad.
SELECT tgrelid::regclass AS tabla, tgname AS nombre_trigger,
       tgenabled AS estado
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN (
      'trg_proteger_subcuenta',
      'trg_validar_subcuenta_detalle',
      'trg_validar_pago_subcuenta',
      'trg_validar_detalle_pago_subcuentas'
  )
ORDER BY nombre_trigger;

-- 5) Indices para consultas rapidas y nombres unicos.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'ux_subcuentas_nombre_activo',
      'idx_subcuentas_cuenta_estado',
      'idx_subcuenta_detalle_producto',
      'idx_pagos_subcuenta_estado'
  )
ORDER BY indexname;

-- 6) Los pagos historicos no se reasignan al ejecutar la migracion.
--    Antes del commit 18 deberia dar cero pagos con id_subcuenta.
SELECT COUNT(*) AS total_pagos,
       COUNT(*) FILTER (WHERE id_subcuenta IS NOT NULL) AS pagos_asociados
FROM public.pagos;

-- 7) Lectura de resumen: cero filas es NORMAL si aun no creaste subcuentas.
SELECT id_subcuenta, id_cuenta, nombre, estado,
       total_asignado, total_pagado, total_pendiente
FROM public.v_subcuentas_resumen
ORDER BY id_subcuenta DESC
LIMIT 10;

-- 8) Desglose disponible para asignar, SIN modificar pagos.
SELECT id_cuenta, id_detalle_producto, subtotal,
       pagado_sin_subcuenta, total_asignado,
       disponible_para_asignar
FROM public.v_distribucion_cuenta
WHERE disponible_para_asignar > 0
ORDER BY id_cuenta DESC, id_detalle_producto
LIMIT 20;

-- 9) La suma asignada por producto nunca debe superar su subtotal.
SELECT sd.id_detalle_producto, MAX(dp.subtotal) AS subtotal,
       SUM(sd.monto_asignado) AS total_asignado
FROM public.subcuenta_detalle sd
JOIN public.detalle_producto dp USING (id_detalle_producto)
GROUP BY sd.id_detalle_producto
HAVING SUM(sd.monto_asignado) > MAX(dp.subtotal);
-- Resultado esperado: CERO filas.

-- 10) Chequeo adicional: reservas + pagos normales nunca deben exceder el detalle.
SELECT id_cuenta, id_detalle_producto, subtotal,
       pagado_sin_subcuenta, total_asignado
FROM public.v_distribucion_cuenta
WHERE pagado_sin_subcuenta + total_asignado > subtotal;
-- Resultado esperado: CERO filas.
