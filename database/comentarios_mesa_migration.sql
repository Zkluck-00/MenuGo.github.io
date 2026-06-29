-- MenuGo - migracion para comentarios del cliente al mesero
-- Ejecutar en Neon si se desea crear la tabla manualmente.

CREATE TABLE IF NOT EXISTS comentarios_mesa (
    id_comentario_mesa SERIAL PRIMARY KEY,
    id_mesa INTEGER REFERENCES mesas(id_mesa) ON DELETE SET NULL,
    numero_mesa INTEGER NOT NULL,
    id_grupo_mesa INTEGER REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE SET NULL,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    motivo VARCHAR(80) NOT NULL,
    detalle TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendido_at TIMESTAMP,
    CONSTRAINT chk_comentario_mesa_estado CHECK (estado IN ('pendiente', 'atendido', 'cancelado'))
);

CREATE INDEX IF NOT EXISTS idx_comentarios_mesa_pendientes
ON comentarios_mesa(numero_mesa, estado, fecha_creacion DESC);
