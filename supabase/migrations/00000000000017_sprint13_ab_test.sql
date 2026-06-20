-- Sprint 13.8 — Motor de Test A/B perpetuo para etapas de pipeline
-- ================================================================

-- Tabla principal de pruebas A/B
CREATE TABLE pipeline_ab_tests (
  id                     UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                 TEXT        NOT NULL,
  ruta                   TEXT        NOT NULL,          -- 'tripwire' | 'premium'
  etapa_nombre           TEXT        NOT NULL,          -- nombre de la etapa bajo prueba
  -- Recursos opcionales que se comparan (templates de recursos_conocimiento)
  variante_a_recurso_id  UUID        REFERENCES recursos_conocimiento(id),
  variante_b_recurso_id  UUID        REFERENCES recursos_conocimiento(id),
  -- Contadores
  asignaciones_a         INTEGER     NOT NULL DEFAULT 0,
  asignaciones_b         INTEGER     NOT NULL DEFAULT 0,
  conversiones_a         INTEGER     NOT NULL DEFAULT 0,
  conversiones_b         INTEGER     NOT NULL DEFAULT 0,
  -- Estado
  activo                 BOOLEAN     NOT NULL DEFAULT TRUE,
  ganador                TEXT        CHECK (ganador IN ('a', 'b', 'benchmark')),
  benchmark_tasa         NUMERIC(5,4),                 -- tasa de industria aplicada si no hay volumen
  min_muestra            INTEGER     NOT NULL DEFAULT 20,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracking de asignaciones individuales por lead
CREATE TABLE pipeline_ab_asignaciones (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id     UUID        NOT NULL REFERENCES pipeline_ab_tests(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  variante    TEXT        NOT NULL CHECK (variante IN ('a', 'b')),
  convirtio   BOOLEAN,    -- NULL = pendiente, TRUE = avanzó a siguiente etapa
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_id, lead_id)
);

-- RLS
ALTER TABLE pipeline_ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_ab_tests_admin" ON pipeline_ab_tests FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

ALTER TABLE pipeline_ab_asignaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_ab_asignaciones_admin" ON pipeline_ab_asignaciones FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

-- Índices
CREATE INDEX pipeline_ab_asignaciones_test_lead ON pipeline_ab_asignaciones(test_id, lead_id);
CREATE INDEX pipeline_ab_asignaciones_lead      ON pipeline_ab_asignaciones(lead_id);
CREATE INDEX pipeline_ab_tests_activo           ON pipeline_ab_tests(activo) WHERE activo = TRUE;

-- Trigger updated_at
CREATE TRIGGER pipeline_ab_tests_updated_at
  BEFORE UPDATE ON pipeline_ab_tests
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
