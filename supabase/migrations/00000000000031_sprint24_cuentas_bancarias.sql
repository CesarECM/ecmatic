-- ============================================================
-- ECMatic · Sprint 24 · S24.2 — Cuentas bancarias + precio en servicios
-- ============================================================

-- Precio opcional en recursos de tipo servicio
ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS precio_centavos INTEGER;

-- Tabla global de cuentas bancarias (aplica a todos los servicios)
CREATE TABLE cuentas_bancarias (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  banco       TEXT        NOT NULL,
  titular     TEXT        NOT NULL,
  clabe       TEXT,        -- 18 dígitos, SPEI
  cuenta      TEXT,        -- número de cuenta alternativo
  activa      BOOLEAN     NOT NULL DEFAULT TRUE,
  orden       SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cuentas_bancarias_activa_idx ON cuentas_bancarias (activa, orden);

ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_bancarias_read_authenticated" ON cuentas_bancarias
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cuentas_bancarias_write_admin" ON cuentas_bancarias
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "cuentas_bancarias_service_role" ON cuentas_bancarias
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER cuentas_bancarias_updated_at BEFORE UPDATE ON cuentas_bancarias
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
