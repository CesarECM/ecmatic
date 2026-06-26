-- Sprint GHL-1: tabla de workflows de GoHighLevel con clasificación IA
CREATE TABLE ghl_workflows (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id          TEXT        UNIQUE NOT NULL,
  nombre          TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('draft','published')),
  version         INTEGER     DEFAULT 1,
  pasos           JSONB,                          -- JSON completo extraído por browser automation
  clasificacion   TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (clasificacion IN ('keep','rescue','delete','pending')),
  notas           TEXT,
  resumen_ia      TEXT,                           -- descripción en lenguaje natural generada por IA
  tags_detectados TEXT[],                         -- triggers/acciones clave detectados
  version_hash    TEXT,                           -- hash de pasos para detectar cambios
  ultima_sync     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Índices para el panel de administración
CREATE INDEX idx_ghl_workflows_clasificacion ON ghl_workflows (clasificacion);
CREATE INDEX idx_ghl_workflows_status        ON ghl_workflows (status);
CREATE INDEX idx_ghl_workflows_ultima_sync   ON ghl_workflows (ultima_sync DESC);

-- RLS: solo admin puede leer y escribir
ALTER TABLE ghl_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ghl_workflows"
  ON ghl_workflows
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.rol = 'admin'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ghl_workflows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ghl_workflows_updated_at
  BEFORE UPDATE ON ghl_workflows
  FOR EACH ROW EXECUTE FUNCTION update_ghl_workflows_updated_at();
