-- ============================================================
-- ECMatic · Sprint 37 · Panel de Gestión de Pipelines
-- ============================================================

-- ── 1. Tabla pipelines (fuente de verdad para metadatos) ─────
CREATE TABLE pipelines (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ruta             TEXT        NOT NULL UNIQUE,
  nombre           TEXT        NOT NULL,
  descripcion      TEXT,
  servicio_id      UUID        REFERENCES recursos_conocimiento(id) ON DELETE SET NULL,
  tipo             TEXT        NOT NULL DEFAULT 'tronco'
                               CHECK (tipo IN ('tronco', 'rama')),
  fase_cagc_inicio SMALLINT    CHECK (fase_cagc_inicio BETWEEN 0 AND 16),
  fase_cagc_fin    SMALLINT    CHECK (fase_cagc_fin BETWEEN 0 AND 16),
  activo           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_read_authenticated" ON pipelines
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "pipelines_write_admin" ON pipelines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "pipelines_service_role" ON pipelines
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER pipelines_updated_at BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Pre-poblar con los pipelines existentes
INSERT INTO pipelines (ruta, nombre, descripcion, tipo, fase_cagc_inicio, fase_cagc_fin) VALUES
  ('tripwire', 'Tripwire ($1,799)', 'Pipeline de entrada para certificación económica', 'tronco', 1, 10),
  ('premium',  'Premium ($10,000+)', 'Pipeline consultivo para certificación de alto valor', 'tronco', 1, 10);

-- ── 2. Eliminar CHECK restrictivo en pipeline_etapas.ruta ────
-- Permite crear etapas para pipelines nuevos más allá de tripwire/premium
ALTER TABLE pipeline_etapas
  DROP CONSTRAINT IF EXISTS pipeline_etapas_ruta_check;

-- ── 3. Campos GHL por etapa ───────────────────────────────────
ALTER TABLE pipeline_etapas
  ADD COLUMN IF NOT EXISTS sla_dias             SMALLINT,
  ADD COLUMN IF NOT EXISTS rotting_dias         SMALLINT,
  ADD COLUMN IF NOT EXISTS criterios_entrada    TEXT,
  ADD COLUMN IF NOT EXISTS criterios_salida     TEXT,
  ADD COLUMN IF NOT EXISTS tareas_obligatorias  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS plantillas_mensaje   JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS condiciones_workflow JSONB NOT NULL DEFAULT '[]';
