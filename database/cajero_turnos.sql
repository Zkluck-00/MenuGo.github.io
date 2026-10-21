
CREATE TABLE IF NOT EXISTS public.turnos_caja (
    id_turno BIGSERIAL PRIMARY KEY,

    id_cajero INTEGER NOT NULL
        REFERENCES public.trabajador(idtrabajador)
        ON DELETE RESTRICT,

    estado VARCHAR(12) NOT NULL DEFAULT 'abierto',

    abierto_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    cerrado_at TIMESTAMPTZ,

    fondo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,

    efectivo_esperado NUMERIC(12,2),
    efectivo_contado NUMERIC(12,2),
    diferencia NUMERIC(12,2),

    observaciones TEXT
);
