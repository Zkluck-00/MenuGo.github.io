-- ============================================================
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuario_rol;
ALTER TABLE usuarios
ADD CONSTRAINT chk_usuario_rol
CHECK (rol IN ('cliente', 'mesero', 'cocina', 'cajero', 'administrador'));

ALTER TABLE pagos
ADD COLUMN IF NOT EXISTS id_cajero INTEGER REFERENCES trabajador(idtrabajador) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_id_cajero_fecha
ON pagos(id_cajero, fecha_pago DESC);

CREATE TABLE IF NOT EXISTS cierres_caja (
    id_cierre_caja SERIAL PRIMARY KEY,
    id_cajero INTEGER NOT NULL REFERENCES trabajador(idtrabajador) ON DELETE RESTRICT,
    fecha_desde TIMESTAMP NOT NULL,
    fecha_hasta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cantidad_pagos INTEGER NOT NULL DEFAULT 0,
    total_efectivo NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_yape NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_plin NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_tarjeta_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_tarjeta_debito NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_general NUMERIC(12,2) NOT NULL DEFAULT 0,
    observaciones TEXT,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cierre_caja_pagos (
    id_cierre_caja INTEGER NOT NULL REFERENCES cierres_caja(id_cierre_caja) ON DELETE CASCADE,
    id_pago INTEGER NOT NULL UNIQUE REFERENCES pagos(id_pago) ON DELETE RESTRICT,
    PRIMARY KEY (id_cierre_caja, id_pago)
);

CREATE INDEX IF NOT EXISTS idx_cierres_caja_cajero_fecha
ON cierres_caja(id_cajero, fecha_hasta DESC);
