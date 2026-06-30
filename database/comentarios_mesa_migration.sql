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

-- MenuGo - notificacion al mesero cuando el cliente solicita cuenta
CREATE TABLE IF NOT EXISTS solicitudes_cuenta (
    id_solicitud SERIAL PRIMARY KEY,
    id_grupo_mesa INTEGER NOT NULL REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE CASCADE,
    id_cuenta INTEGER REFERENCES cuentas(id_cuenta) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    nota TEXT,
    fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendido_at TIMESTAMP,
    CONSTRAINT chk_solicitud_estado CHECK (estado IN ('pendiente', 'atendida', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_cuenta_pendientes
ON solicitudes_cuenta(id_grupo_mesa, estado, fecha_solicitud DESC);

-- MenuGo - soporte para seguimiento de pedidos para llevar
-- No se crea una tabla nueva: se utiliza la tabla pedidos existente.
-- El codigo visible del cliente se genera como LLEV-001, LLEV-002, etc. a partir del id_pedido.
CREATE INDEX IF NOT EXISTS idx_pedidos_llevar_estado
ON pedidos(tipo_pedido, estado, fecha_creacion DESC)
WHERE tipo_pedido = 'llevar';
