-- ============================================================
-- ECMatic · Sprint 10 · Panel de Control Central y Alertas
-- ============================================================

-- ── log_ia: registro de acciones tomadas por la IA ───────────
CREATE TABLE log_ia (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_accion   TEXT        NOT NULL,
  lead_id       UUID        REFERENCES leads(id) ON DELETE SET NULL,
  recurso_kb_id UUID        REFERENCES recursos_conocimiento(id) ON DELETE SET NULL,
  resultado     TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX log_ia_fecha_idx   ON log_ia (created_at DESC);
CREATE INDEX log_ia_lead_idx    ON log_ia (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX log_ia_tipo_idx    ON log_ia (tipo_accion, created_at DESC);

ALTER TABLE log_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log_ia_admin" ON log_ia FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

-- ── sugerencias_ia: cola centralizada de aprobaciones ────────
-- Para sugerencias que no tienen tabla propia (pipeline, flujos, etc.)
CREATE TABLE sugerencias_ia (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo          TEXT        NOT NULL
                            CHECK (tipo IN ('pipeline', 'flujo', 'avatar', 'gatillo', 'general')),
  titulo        TEXT        NOT NULL,
  descripcion   TEXT        NOT NULL,
  prioridad     TEXT        NOT NULL DEFAULT 'puede_esperar'
                            CHECK (prioridad IN ('urgente', 'importante', 'puede_esperar')),
  aprobado      BOOLEAN,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sugerencias_pendientes_idx ON sugerencias_ia (prioridad, created_at)
  WHERE aprobado IS NULL;

ALTER TABLE sugerencias_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sugerencias_admin" ON sugerencias_ia FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

CREATE TRIGGER sugerencias_updated_at BEFORE UPDATE ON sugerencias_ia
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
