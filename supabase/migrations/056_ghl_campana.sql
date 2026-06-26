-- Sprint GHL-4: logs de campaña SBC para tracking A/B y estado del pipeline
CREATE TABLE ghl_campana_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campana         TEXT        NOT NULL DEFAULT 'sbc_jun26',
  ghl_contact_id  TEXT        NOT NULL,
  nombre          TEXT,
  categoria_sbc   TEXT        NOT NULL,
  workflow_id     TEXT,
  variante        TEXT        CHECK (variante IN ('a', 'b')),
  enviado         BOOLEAN     NOT NULL DEFAULT false,
  enviado_at      TIMESTAMPTZ,
  respuesta_tipo  TEXT        CHECK (respuesta_tipo IN ('positivo','negativo','neutro','sin_respuesta')),
  respuesta_at    TIMESTAMPTZ,
  convirtio       BOOLEAN,
  error_msg       TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un contacto aparece una sola vez por campaña
CREATE UNIQUE INDEX idx_ghl_campana_contact ON ghl_campana_logs (ghl_contact_id, campana);
CREATE INDEX idx_ghl_campana_categoria ON ghl_campana_logs (categoria_sbc);
CREATE INDEX idx_ghl_campana_variante   ON ghl_campana_logs (variante);
CREATE INDEX idx_ghl_campana_enviado    ON ghl_campana_logs (enviado);

ALTER TABLE ghl_campana_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ghl_campana_logs"
  ON ghl_campana_logs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE OR REPLACE FUNCTION update_ghl_campana_logs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ghl_campana_logs_updated_at
  BEFORE UPDATE ON ghl_campana_logs
  FOR EACH ROW EXECUTE FUNCTION update_ghl_campana_logs_updated_at();
