-- ============================================================================
-- MENUGO | COMMIT 14/20 | Movimientos manuales de caja
-- Archivo: database/20261020_cajero_movimientos_caja.sql
-- PostgreSQL / Neon | Migracion incremental y no destructiva
--
-- Requisitos: commit 12 (public.turnos_caja) y public.trabajador.
-- Ejecutar primero en una rama de Neon de desarrollo, tras un respaldo.
-- NO ejecutar MenuGo_BD_Completa_NEON.sql en una BD con datos.
--
-- REGLA CONTABLE: esta tabla NO almacena ventas ni vueltos. Las ventas en
-- efectivo permanecen en public.pagos. Aqui se registran solo reposiciones,
-- gastos y retiros MANUALES, para no sumar una venta dos veces.
-- ============================================================================

BEGIN;

-- 1. Comprobar dependencias ANTES de crear objetos nuevos.
DO $dependencias$
BEGIN
    IF to_regclass('public.turnos_caja') IS NULL THEN
        RAISE EXCEPTION 'Falta public.turnos_caja. Ejecuta primero la migracion del commit 12.';
    END IF;
    IF to_regclass('public.trabajador') IS NULL THEN
        RAISE EXCEPTION 'Falta public.trabajador. Comprueba el esquema original de MenuGo.';
    END IF;
END;
$dependencias$;

-- 2. Libro de movimientos del efectivo fisico (NO registra ventas).
--    El registrador es el trabajador autenticado; no necesariamente el
--    titular del turno si posteriormente se autoriza a un supervisor.
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
    id_movimiento       BIGSERIAL PRIMARY KEY,
    id_turno            BIGINT NOT NULL,
    id_registrado_por   INTEGER NOT NULL,
    tipo                VARCHAR(10) NOT NULL,
    categoria           VARCHAR(20) NOT NULL DEFAULT 'otro',
    monto               NUMERIC(12,2) NOT NULL,
    motivo              TEXT NOT NULL,
    referencia          VARCHAR(100),
    idempotency_key     VARCHAR(100),
    idempotency_hash    VARCHAR(64),
    registrado_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Reglas de integridad; se pueden ejecutar nuevamente sin duplicarlas.
DO $integridad$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'fk_movimientos_caja_turno'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT fk_movimientos_caja_turno
            FOREIGN KEY (id_turno)
            REFERENCES public.turnos_caja(id_turno)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'fk_movimientos_caja_registrador'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT fk_movimientos_caja_registrador
            FOREIGN KEY (id_registrado_por)
            REFERENCES public.trabajador(idtrabajador)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'ck_movimientos_caja_tipo_categoria'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT ck_movimientos_caja_tipo_categoria CHECK (
                (tipo = 'ingreso' AND categoria IN ('reposicion', 'ajuste', 'otro'))
                OR
                (tipo = 'retiro' AND categoria IN ('gasto', 'retiro_banco', 'ajuste', 'otro'))
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'ck_movimientos_caja_monto_positivo'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT ck_movimientos_caja_monto_positivo
            CHECK (monto > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'ck_movimientos_caja_motivo'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT ck_movimientos_caja_motivo
            CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 300);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'ck_movimientos_caja_referencia'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT ck_movimientos_caja_referencia
            CHECK (referencia IS NULL OR char_length(btrim(referencia)) > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.movimientos_caja'::regclass
          AND conname = 'ck_movimientos_caja_idempotencia'
    ) THEN
        ALTER TABLE public.movimientos_caja
            ADD CONSTRAINT ck_movimientos_caja_idempotencia CHECK (
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
$integridad$;

-- 4. Indices para consultas por turno e idempotencia de reintentos.
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_turno_fecha
    ON public.movimientos_caja (id_turno, registrado_at DESC, id_movimiento DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_idempotency_key
    ON public.movimientos_caja (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 5. Impedir movimientos posteriores al cierre e impedir modificaciones
--    del historial. La fila del turno se bloquea (FOR UPDATE) para coordinar
--    la insercion con el cierre concurrente que implementara el commit 16.
--    Si hay un error, se corrige con un movimiento compensatorio de tipo
--    contrario, nunca editando ni borrando el registro de auditoria.
CREATE OR REPLACE FUNCTION public.fn_validar_movimiento_caja()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $funcion$
DECLARE
    v_estado VARCHAR(12);
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION
            'Los movimientos de caja son inmutables. Registra un movimiento compensatorio.'
            USING ERRCODE = '23514';
    END IF;

    SELECT estado INTO v_estado
    FROM public.turnos_caja
    WHERE id_turno = NEW.id_turno
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El turno de caja % no existe.', NEW.id_turno
            USING ERRCODE = '23503';
    END IF;

    IF v_estado <> 'abierto' THEN
        RAISE EXCEPTION 'No se permiten movimientos en un turno cerrado.'
            USING ERRCODE = '23514';
    END IF;

    -- Evitar fechas arbitrarias enviadas desde un cliente.
    NEW.registrado_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$funcion$;

DO $activacion_trigger$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.movimientos_caja'::regclass
          AND tgname = 'trg_validar_movimiento_caja'
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER trg_validar_movimiento_caja
        BEFORE INSERT OR UPDATE OR DELETE
        ON public.movimientos_caja
        FOR EACH ROW
        EXECUTE FUNCTION public.fn_validar_movimiento_caja();
    END IF;
END;
$activacion_trigger$;

-- 6. Totales independientes de pagos. Incluir turnos sin movimientos con 0.
--    Formula futura del arqueo (commit 16):
--    fondo_inicial + ventas_efectivo + total_ingresos - total_retiros.
CREATE OR REPLACE VIEW public.v_resumen_movimientos_caja AS
SELECT
    t.id_turno,
    COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0) AS total_ingresos,
    COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'retiro'), 0) AS total_retiros,
    COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'ingreso'), 0)
      - COALESCE(SUM(m.monto) FILTER (WHERE m.tipo = 'retiro'), 0) AS saldo_movimientos,
    COUNT(m.id_movimiento)::INTEGER AS cantidad_movimientos
FROM public.turnos_caja t
LEFT JOIN public.movimientos_caja m ON m.id_turno = t.id_turno
GROUP BY t.id_turno;

-- 7. Comentarios para documentacion y mantenimiento.
COMMENT ON TABLE public.movimientos_caja IS
    'Libro inmutable de ingresos y retiros manuales de efectivo; las ventas estan en pagos.';
COMMENT ON COLUMN public.movimientos_caja.id_turno IS
    'Turno al que corresponde el movimiento de efectivo.';
COMMENT ON COLUMN public.movimientos_caja.id_registrado_por IS
    'Trabajador autenticado que realizo la operacion.';
COMMENT ON COLUMN public.movimientos_caja.monto IS
    'Valor POSITIVO en soles: el signo contable depende de tipo ingreso/retiro.';
COMMENT ON COLUMN public.movimientos_caja.idempotency_key IS
    'Identificador estable para reintentos: se conectara desde la API en el commit 15.';
COMMENT ON VIEW public.v_resumen_movimientos_caja IS
    'Agregados de movimientos manuales por turno, sin incluir ventas de pagos.';

COMMIT;

-- Ejecutar despues:
-- database/20261020_cajero_movimientos_verificacion.sql
