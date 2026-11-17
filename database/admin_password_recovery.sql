-- Recuperación por correo para cuentas de la tabla administrador.
-- Ejecuta esta migración una sola vez sobre la misma base de MenuGo.

ALTER TABLE public.administrador
  ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.admin_password_recovery_codes (
  id_administrador INTEGER PRIMARY KEY
    REFERENCES public.administrador(idadministrador) ON DELETE CASCADE,
  codigo_hash CHAR(64) NOT NULL,
  intentos SMALLINT NOT NULL DEFAULT 0
    CHECK (intentos >= 0 AND intentos <= 5),
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_password_recovery_expires
  ON public.admin_password_recovery_codes (expires_at);
