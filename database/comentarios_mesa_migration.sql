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

-- MenuGo - credenciales de trabajadores por rol
ALTER TABLE trabajador
ADD COLUMN IF NOT EXISTS usuario_acceso VARCHAR(100);

ALTER TABLE trabajador
ADD COLUMN IF NOT EXISTS clave_acceso VARCHAR(255);

-- Permite estados legibles usados por el panel: Activo, Inactivo, Suspendido.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trabajador'
      AND column_name = 'estado'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE trabajador
    ALTER COLUMN estado TYPE VARCHAR(20)
    USING CASE WHEN estado = true THEN 'Activo' ELSE 'Inactivo' END;
  END IF;
END $$;

ALTER TABLE trabajador
ALTER COLUMN estado SET DEFAULT 'Activo';

UPDATE trabajador
SET usuario_acceso = correo
WHERE usuario_acceso IS NULL
  AND correo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajador_usuario_acceso
ON trabajador(LOWER(usuario_acceso))
WHERE usuario_acceso IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajador_correo_acceso
ON trabajador(LOWER(correo))
WHERE correo IS NOT NULL;

-- MenuGo - disponibilidad independiente para consumo local y pedidos para llevar
ALTER TABLE platos
ADD COLUMN IF NOT EXISTS disponible_llevar BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_platos_disponibilidad_cliente
ON platos(activo, disponible_llevar, cantidad_de_platos);
