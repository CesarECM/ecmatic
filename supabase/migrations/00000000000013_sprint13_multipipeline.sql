-- ============================================================
-- ECMatic · Sprint 13.5 · Soporte Multi-Pipeline Simultáneo
-- ============================================================

-- ── lead_pipelines ───────────────────────────────────────────
-- Posición actual de un lead en cada pipeline activo.
-- Un lead puede estar en 2+ pipelines sin conflicto.
CREATE TABLE lead_pipelines (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  ruta          TEXT        NOT NULL,
  etapa_actual  TEXT        NOT NULL DEFAULT 'Nuevo',
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_pipelines_unique UNIQUE (lead_id, ruta)
);

CREATE INDEX lead_pipelines_lead_idx ON lead_pipelines (lead_id) WHERE activo = TRUE;
CREATE INDEX lead_pipelines_ruta_idx ON lead_pipelines (ruta, etapa_actual) WHERE activo = TRUE;

ALTER TABLE lead_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_pipelines_admin" ON lead_pipelines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "lead_pipelines_vendedor_read" ON lead_pipelines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN vendedores v ON v.id = l.vendedor_id
      WHERE l.id = lead_pipelines.lead_id AND v.profile_id = auth.uid()
    )
  );

CREATE POLICY "lead_pipelines_service_role" ON lead_pipelines
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER lead_pipelines_updated_at BEFORE UPDATE ON lead_pipelines
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── ruta en pipeline_movimientos ─────────────────────────────
-- Distingue a qué pipeline pertenece cada movimiento.
-- NULL = movimiento legacy del pipeline primario.
ALTER TABLE pipeline_movimientos
  ADD COLUMN IF NOT EXISTS ruta TEXT;

-- ── Backfill: sincronizar lead_pipelines con leads activos ───
-- Cada lead activo entra en su pipeline primario actual.
INSERT INTO lead_pipelines (lead_id, ruta, etapa_actual)
SELECT id, pipeline_ruta, pipeline_stage
FROM leads
WHERE activo = TRUE
ON CONFLICT (lead_id, ruta) DO NOTHING;
