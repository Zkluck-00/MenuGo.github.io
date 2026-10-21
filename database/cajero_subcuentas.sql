-- ============================================================================
-- MenuGo | Commit 17/20 | Modelo de cuentas divididas
-- PostgreSQL / Neon | Migracion aditiva, transaccional y repetible.
--
-- Requisitos: cuentas, pedidos, detalle_producto, pagos, detalle_pago,
-- trabajador; usar sobre el esquema migrado de los commits 01-16.
-- NO ejecutar MenuGo_BD_Completa_NEON.sql en una BD con datos.
--
-- Las asignaciones representan IMPORTES de los detalles originales, no
-- nuevas ventas. Una linea puede dividirse por importe entre varias personas.
-- ============================================================================

BEGIN;

DO $requisitos$
BEGIN
    IF to_regclass('public.cuentas') IS NULL
       OR to_regclass('public.pedidos') IS NULL
       OR to_regclass('public.detalle_producto') IS NULL
       OR to_regclass('public.pagos') IS NULL
       OR to_regclass('public.detalle_pago') IS NULL
       OR to_regclass('public.trabajador') IS NULL THEN
        RAISE EXCEPTION 'Faltan tablas base de MenuGo; aplica primero el esquema y las migraciones previas.';
    END IF;
END;
$requisitos$;

-- 1. Personas o grupos de pago asociados a UNA cuenta original.
CREATE TABLE IF NOT EXISTS public.subcuentas (
    id_subcuenta       BIGSERIAL PRIMARY KEY,
    id_cuenta          INTEGER NOT NULL,
    nombre             VARCHAR(80) NOT NULL,
    estado             VARCHAR(12) NOT NULL DEFAULT 'pendiente',
    id_creada_por      INTEGER,
    creada_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subcuentas_cuenta
        FOREIGN KEY (id_cuenta) REFERENCES public.cuentas(id_cuenta)
        ON DELETE RESTRICT,
    CONSTRAINT fk_subcuentas_creador
        FOREIGN KEY (id_creada_por) REFERENCES public.trabajador(idtrabajador)
        ON DELETE SET NULL,
    CONSTRAINT ck_subcuentas_nombre
        CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 80),
    CONSTRAINT ck_subcuentas_estado
        CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
    CONSTRAINT uq_subcuentas_cuenta_id
        UNIQUE (id_cuenta, id_subcuenta)
);

-- No crear dos participantes activos con el mismo nombre en una cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_subcuentas_nombre_activo
    ON public.subcuentas (id_cuenta, lower(btrim(nombre)))
    WHERE estado <> 'anulada';

CREATE INDEX IF NOT EXISTS idx_subcuentas_cuenta_estado
    ON public.subcuentas (id_cuenta, estado, id_subcuenta);

-- 2. Asignacion de un detalle original a una persona.
--    monto_asignado es la fuente contable. cantidad_asignada es informativa:
--    admite fracciones para platos compartidos (ej.: 0.500 de un plato).
CREATE TABLE IF NOT EXISTS public.subcuenta_detalle (
    id_subcuenta_detalle BIGSERIAL PRIMARY KEY,
    id_subcuenta         BIGINT NOT NULL,
    id_detalle_producto  INTEGER NOT NULL,
    monto_asignado       NUMERIC(12,2) NOT NULL,
    cantidad_asignada    NUMERIC(10,3),
    creada_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subcuenta_detalle_subcuenta
        FOREIGN KEY (id_subcuenta)
        REFERENCES public.subcuentas(id_subcuenta) ON DELETE RESTRICT,
    CONSTRAINT fk_subcuenta_detalle_producto
        FOREIGN KEY (id_detalle_producto)
        REFERENCES public.detalle_producto(id_detalle_producto) ON DELETE RESTRICT,
    CONSTRAINT uq_subcuenta_detalle_producto
        UNIQUE (id_subcuenta, id_detalle_producto),
    CONSTRAINT ck_subcuenta_detalle_monto
        CHECK (monto_asignado > 0),
    CONSTRAINT ck_subcuenta_detalle_cantidad
        CHECK (cantidad_asignada IS NULL OR cantidad_asignada > 0)
);

CREATE INDEX IF NOT EXISTS idx_subcuenta_detalle_producto
    ON public.subcuenta_detalle (id_detalle_producto);

-- 3. Pago opcionalmente identificado con su participante.
--    FK COMPUESTA: impide asociar un pago de una cuenta a la persona
--    que pertenece a una cuenta distinta. Los pagos historicos quedan NULL.
ALTER TABLE public.pagos
    ADD COLUMN IF NOT EXISTS id_subcuenta BIGINT;

DO $tipo_pago$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.pagos'::regclass
          AND attname = 'id_subcuenta'
          AND NOT attisdropped
          AND atttypid = 'pg_catalog.int8'::regtype
    ) THEN
        RAISE EXCEPTION 'La columna pagos.id_subcuenta existe, pero no es BIGINT.';
    END IF;
END;
$tipo_pago$;

DO $fk_pago$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.pagos'::regclass
          AND conname = 'fk_pagos_subcuenta_misma_cuenta'
    ) THEN
        ALTER TABLE public.pagos
            ADD CONSTRAINT fk_pagos_subcuenta_misma_cuenta
            FOREIGN KEY (id_cuenta, id_subcuenta)
            REFERENCES public.subcuentas(id_cuenta, id_subcuenta)
            ON DELETE RESTRICT;
    END IF;
END;
$fk_pago$;

CREATE INDEX IF NOT EXISTS idx_pagos_subcuenta_estado
    ON public.pagos (id_subcuenta, estado_pago)
    WHERE id_subcuenta IS NOT NULL;

-- 4. Reglas para crear y mantener participantes, sin borrar su historial.
CREATE OR REPLACE FUNCTION public.fn_proteger_subcuenta()
RETURNS TRIGGER LANGUAGE plpgsql AS $funcion$
DECLARE
    v_estado_cuenta TEXT;
    v_total_asignado NUMERIC;
    v_total_pagado NUMERIC;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'No se eliminan subcuentas; cambia el estado a anulada cuando este vacia.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT estado INTO v_estado_cuenta
          FROM public.cuentas WHERE id_cuenta = NEW.id_cuenta FOR UPDATE;
        IF v_estado_cuenta IS DISTINCT FROM 'pendiente' THEN
            RAISE EXCEPTION 'Solo se divide una cuenta pendiente.' USING ERRCODE = '23514';
        END IF;
        IF NEW.estado <> 'pendiente' THEN
            RAISE EXCEPTION 'Una subcuenta nueva debe iniciar pendiente.' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.id_cuenta IS DISTINCT FROM OLD.id_cuenta THEN
            RAISE EXCEPTION 'No se puede mover una subcuenta a otra cuenta.' USING ERRCODE = '23514';
        END IF;
        IF OLD.estado IN ('pagada', 'anulada') AND NEW.estado <> OLD.estado THEN
            RAISE EXCEPTION 'No se puede reabrir una subcuenta pagada o anulada.' USING ERRCODE = '23514';
        END IF;
        IF OLD.estado <> 'anulada' AND NEW.estado = 'anulada'
           AND (
               EXISTS (SELECT 1 FROM public.subcuenta_detalle
                       WHERE id_subcuenta = OLD.id_subcuenta)
               OR EXISTS (SELECT 1 FROM public.pagos
                          WHERE id_subcuenta = OLD.id_subcuenta)
           ) THEN
            RAISE EXCEPTION 'Para anular, la subcuenta no debe tener asignaciones ni pagos.'
                USING ERRCODE = '23514';
        END IF;
        IF OLD.estado <> 'pagada' AND NEW.estado = 'pagada' THEN
            SELECT COALESCE(SUM(monto_asignado), 0) INTO v_total_asignado
              FROM public.subcuenta_detalle
             WHERE id_subcuenta = NEW.id_subcuenta;
            SELECT COALESCE(SUM(monto), 0) INTO v_total_pagado
              FROM public.pagos
             WHERE id_subcuenta = NEW.id_subcuenta
               AND estado_pago = 'pagado';
            IF v_total_asignado <= 0 OR v_total_pagado <> v_total_asignado THEN
                RAISE EXCEPTION 'Solo se marca pagada una subcuenta totalmente liquidada.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$funcion$;

DROP TRIGGER IF EXISTS trg_proteger_subcuenta ON public.subcuentas;
CREATE TRIGGER trg_proteger_subcuenta
    BEFORE INSERT OR UPDATE OR DELETE ON public.subcuentas
    FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_subcuenta();

-- 5. Cada asignacion debe apuntar a un pedido del mismo grupo de mesa,
--    no cancelado, y no superar el importe disponible del detalle.
--    Se bloquea la cuenta (como el backend de pagos) y el detalle del pedido
--    para serializar asignaciones concurrentes, incluso entre varias cuentas.
--    Los importes ya pagados SIN subcuenta restan disponibilidad; los pagos
--    CON subcuenta ya estan comprendidos dentro de las asignaciones.
CREATE OR REPLACE FUNCTION public.fn_validar_subcuenta_detalle()
RETURNS TRIGGER LANGUAGE plpgsql AS $funcion$
DECLARE
    v_id_subcuenta BIGINT;
    v_id_cuenta INTEGER;
    v_grupo INTEGER;
    v_estado_cuenta TEXT;
    v_estado_subcuenta TEXT;
    v_grupo_producto INTEGER;
    v_estado_pedido TEXT;
    v_subtotal NUMERIC;
    v_cantidad NUMERIC;
    v_pagado_libre NUMERIC;
    v_ya_asignado NUMERIC;
    v_ya_cantidad NUMERIC;
    v_excluir_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id_subcuenta IS DISTINCT FROM OLD.id_subcuenta
           OR NEW.id_detalle_producto IS DISTINCT FROM OLD.id_detalle_producto THEN
            RAISE EXCEPTION 'No se reasigna una fila: elimina y crea otra antes de cobrar.'
                USING ERRCODE = '23514';
        END IF;
        v_excluir_id := OLD.id_subcuenta_detalle;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_id_subcuenta := OLD.id_subcuenta;
    ELSE
        v_id_subcuenta := NEW.id_subcuenta;
    END IF;

    SELECT id_cuenta INTO v_id_cuenta
      FROM public.subcuentas WHERE id_subcuenta = v_id_subcuenta;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subcuenta inexistente.' USING ERRCODE = '23503';
    END IF;

    SELECT id_grupo_mesa, estado INTO v_grupo, v_estado_cuenta
      FROM public.cuentas WHERE id_cuenta = v_id_cuenta FOR UPDATE;

    SELECT estado INTO v_estado_subcuenta
      FROM public.subcuentas WHERE id_subcuenta = v_id_subcuenta FOR UPDATE;

    IF v_estado_cuenta IS DISTINCT FROM 'pendiente'
       OR v_estado_subcuenta IS DISTINCT FROM 'pendiente' THEN
        RAISE EXCEPTION 'Solo se editan asignaciones de subcuentas pendientes.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP <> 'INSERT' AND EXISTS (
        SELECT 1 FROM public.pagos
        WHERE id_subcuenta = v_id_subcuenta
          AND estado_pago IN ('pendiente', 'pagado')
    ) THEN
        RAISE EXCEPTION 'No se editan asignaciones de una subcuenta con pagos.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT p.id_grupo_mesa, p.estado, dp.subtotal, dp.cantidad
      INTO v_grupo_producto, v_estado_pedido, v_subtotal, v_cantidad
      FROM public.detalle_producto dp
      JOIN public.pedidos p ON p.id_pedido = dp.id_pedido
     WHERE dp.id_detalle_producto = NEW.id_detalle_producto
       FOR UPDATE OF dp;

    IF NOT FOUND OR v_grupo_producto IS DISTINCT FROM v_grupo
       OR v_estado_pedido = 'cancelado' THEN
        RAISE EXCEPTION 'El producto no pertenece a la cuenta o esta cancelado.'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(dpg.monto), 0)
      INTO v_pagado_libre
      FROM public.detalle_pago dpg
      JOIN public.pagos pg ON pg.id_pago = dpg.id_pago
     WHERE dpg.id_detalle_producto = NEW.id_detalle_producto
       AND pg.estado_pago IN ('pendiente', 'pagado')
       AND pg.id_subcuenta IS NULL;

    SELECT COALESCE(SUM(sd.monto_asignado), 0),
           COALESCE(SUM(sd.cantidad_asignada), 0)
      INTO v_ya_asignado, v_ya_cantidad
      FROM public.subcuenta_detalle sd
     WHERE sd.id_detalle_producto = NEW.id_detalle_producto
       AND (v_excluir_id IS NULL OR sd.id_subcuenta_detalle <> v_excluir_id);

    IF v_pagado_libre + v_ya_asignado + NEW.monto_asignado > v_subtotal THEN
        RAISE EXCEPTION 'El importe del producto excede su saldo sin asignar.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.cantidad_asignada IS NOT NULL
       AND v_ya_cantidad + NEW.cantidad_asignada > v_cantidad THEN
        RAISE EXCEPTION 'La cantidad asignada supera las unidades del pedido.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$funcion$;

DROP TRIGGER IF EXISTS trg_validar_subcuenta_detalle ON public.subcuenta_detalle;
CREATE TRIGGER trg_validar_subcuenta_detalle
    BEFORE INSERT OR UPDATE OR DELETE ON public.subcuenta_detalle
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_subcuenta_detalle();

-- 6. Impedir registrar un pago ligado a una persona por encima del total
--    monetario que le fue asignado (incluye pagos pendientes y pagados).
--    No afecta a pagos normales con id_subcuenta = NULL.
CREATE OR REPLACE FUNCTION public.fn_validar_pago_subcuenta()
RETURNS TRIGGER LANGUAGE plpgsql AS $funcion$
DECLARE
    v_estado_subcuenta TEXT;
    v_id_cuenta INTEGER;
    v_total_asignado NUMERIC;
    v_total_otros_pagos NUMERIC;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id_subcuenta IS DISTINCT FROM OLD.id_subcuenta
           AND EXISTS (SELECT 1 FROM public.detalle_pago WHERE id_pago = OLD.id_pago) THEN
            RAISE EXCEPTION 'No se cambia la subcuenta de un pago con detalles registrados.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.id_subcuenta IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id_cuenta, estado INTO v_id_cuenta, v_estado_subcuenta
      FROM public.subcuentas
     WHERE id_subcuenta = NEW.id_subcuenta FOR UPDATE;

    IF NOT FOUND OR v_id_cuenta IS DISTINCT FROM NEW.id_cuenta
       OR v_estado_subcuenta = 'anulada' THEN
        RAISE EXCEPTION 'Subcuenta inexistente, anulada o de otra cuenta.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.estado_pago IN ('pendiente', 'pagado') THEN
        SELECT COALESCE(SUM(monto_asignado), 0) INTO v_total_asignado
          FROM public.subcuenta_detalle WHERE id_subcuenta = NEW.id_subcuenta;
        SELECT COALESCE(SUM(monto), 0) INTO v_total_otros_pagos
          FROM public.pagos
         WHERE id_subcuenta = NEW.id_subcuenta
           AND estado_pago IN ('pendiente', 'pagado')
           AND id_pago IS DISTINCT FROM NEW.id_pago;
        IF v_total_otros_pagos + NEW.monto > v_total_asignado THEN
            RAISE EXCEPTION 'El pago supera el total asignado a esta subcuenta.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$funcion$;

DROP TRIGGER IF EXISTS trg_validar_pago_subcuenta ON public.pagos;
CREATE TRIGGER trg_validar_pago_subcuenta
    BEFORE INSERT OR UPDATE OF id_cuenta, id_subcuenta, estado_pago, monto
    ON public.pagos
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_pago_subcuenta();

-- 7. Respetar reservas por item tambien al insertar detalle_pago.
--    Esto no cambia el flujo historico cuando NO existen asignaciones.
--    La vinculacion con un participante obliga a pagar solo productos que
--    hayan sido asignados a ese participante.
CREATE OR REPLACE FUNCTION public.fn_validar_detalle_pago_subcuentas()
RETURNS TRIGGER LANGUAGE plpgsql AS $funcion$
DECLARE
    v_id_subcuenta BIGINT;
    v_total_producto NUMERIC;
    v_asignado_total NUMERIC;
    v_asignado_persona NUMERIC;
    v_pagado_libre NUMERIC;
    v_pagado_persona NUMERIC;
BEGIN
    SELECT id_subcuenta INTO v_id_subcuenta
      FROM public.pagos WHERE id_pago = NEW.id_pago;
    -- Si no hay subcuentas para el detalle, no hay reservas que verificar.
    IF v_id_subcuenta IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.subcuenta_detalle
        WHERE id_detalle_producto = NEW.id_detalle_producto
    ) THEN
        RETURN NEW;
    END IF;

    SELECT subtotal INTO v_total_producto
      FROM public.detalle_producto
     WHERE id_detalle_producto = NEW.id_detalle_producto FOR UPDATE;

    SELECT COALESCE(SUM(monto_asignado), 0) INTO v_asignado_total
      FROM public.subcuenta_detalle
     WHERE id_detalle_producto = NEW.id_detalle_producto;

    IF v_id_subcuenta IS NULL THEN
        SELECT COALESCE(SUM(dpg.monto), 0) INTO v_pagado_libre
          FROM public.detalle_pago dpg
          JOIN public.pagos pg ON pg.id_pago = dpg.id_pago
         WHERE dpg.id_detalle_producto = NEW.id_detalle_producto
           AND pg.estado_pago IN ('pendiente', 'pagado')
           AND pg.id_subcuenta IS NULL;
        IF v_asignado_total + v_pagado_libre + NEW.monto > v_total_producto THEN
            RAISE EXCEPTION 'El cobro invade importes reservados en subcuentas.'
                USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT COALESCE(SUM(monto_asignado), 0) INTO v_asignado_persona
          FROM public.subcuenta_detalle
         WHERE id_detalle_producto = NEW.id_detalle_producto
           AND id_subcuenta = v_id_subcuenta;
        SELECT COALESCE(SUM(dpg.monto), 0) INTO v_pagado_persona
          FROM public.detalle_pago dpg
          JOIN public.pagos pg ON pg.id_pago = dpg.id_pago
         WHERE dpg.id_detalle_producto = NEW.id_detalle_producto
           AND pg.id_subcuenta = v_id_subcuenta
           AND pg.estado_pago IN ('pendiente', 'pagado');
        IF v_pagado_persona + NEW.monto > v_asignado_persona THEN
            RAISE EXCEPTION 'El cobro excede el importe del item para la persona.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$funcion$;

DROP TRIGGER IF EXISTS trg_validar_detalle_pago_subcuentas ON public.detalle_pago;
CREATE TRIGGER trg_validar_detalle_pago_subcuentas
    BEFORE INSERT ON public.detalle_pago
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_detalle_pago_subcuentas();

-- 8. Vistas solo de lectura para el commit 18 (API y frontend).
CREATE OR REPLACE VIEW public.v_subcuentas_resumen AS
SELECT s.id_subcuenta, s.id_cuenta, s.nombre, s.estado, s.creada_at,
       COALESCE(a.total_asignado, 0)::NUMERIC(12,2) AS total_asignado,
       COALESCE(p.total_pagado, 0)::NUMERIC(12,2) AS total_pagado,
       GREATEST(COALESCE(a.total_asignado, 0) - COALESCE(p.total_pagado, 0), 0)
           ::NUMERIC(12,2) AS total_pendiente
FROM public.subcuentas s
LEFT JOIN LATERAL (
    SELECT SUM(monto_asignado) AS total_asignado
      FROM public.subcuenta_detalle
     WHERE id_subcuenta = s.id_subcuenta
) a ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(monto) AS total_pagado
      FROM public.pagos
     WHERE id_subcuenta = s.id_subcuenta AND estado_pago = 'pagado'
) p ON TRUE;

CREATE OR REPLACE VIEW public.v_distribucion_cuenta AS
SELECT c.id_cuenta, dp.id_detalle_producto, dp.id_pedido,
       dp.cantidad, dp.precio_unitario, dp.subtotal,
       COALESCE(libre.pagado_sin_subcuenta, 0)::NUMERIC(12,2)
           AS pagado_sin_subcuenta,
       COALESCE(asignado.total_asignado, 0)::NUMERIC(12,2)
           AS total_asignado,
       GREATEST(dp.subtotal - COALESCE(libre.pagado_sin_subcuenta, 0)
               - COALESCE(asignado.total_asignado, 0), 0)::NUMERIC(12,2)
           AS disponible_para_asignar
FROM public.cuentas c
JOIN public.pedidos pe ON pe.id_grupo_mesa = c.id_grupo_mesa
                      AND pe.estado <> 'cancelado'
JOIN public.detalle_producto dp ON dp.id_pedido = pe.id_pedido
LEFT JOIN LATERAL (
    SELECT SUM(dpg.monto) AS pagado_sin_subcuenta
      FROM public.detalle_pago dpg
      JOIN public.pagos pg ON pg.id_pago = dpg.id_pago
     WHERE dpg.id_detalle_producto = dp.id_detalle_producto
       AND pg.estado_pago IN ('pendiente', 'pagado')
       AND pg.id_subcuenta IS NULL
) libre ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(monto_asignado) AS total_asignado
      FROM public.subcuenta_detalle
     WHERE id_detalle_producto = dp.id_detalle_producto
) asignado ON TRUE;

COMMENT ON TABLE public.subcuentas IS
    'Personas o grupos de pago de una cuenta existente; no duplican pedidos ni deuda.';
COMMENT ON TABLE public.subcuenta_detalle IS
    'Distribucion del importe de detalle_producto; puede fraccionarse entre personas.';
COMMENT ON COLUMN public.subcuenta_detalle.cantidad_asignada IS
    'Cantidad descriptiva opcional (puede ser fraccion); monto_asignado manda para el cobro.';
COMMENT ON COLUMN public.pagos.id_subcuenta IS
    'Participante de la cuenta dividida (NULL para los pagos existentes sin division).';

COMMIT;
