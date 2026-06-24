-- ============================================================
-- ECMatic · Sprint 9 · Post-Venta, SmartBuilderEC y Retención
-- ============================================================

-- Etapa "Certificado" en ambas rutas de pipeline
INSERT INTO pipeline_etapas (nombre, orden, ruta) VALUES
  ('Certificado', 8, 'tripwire'),
  ('Certificado', 9, 'premium')
ON CONFLICT DO NOTHING;

-- ── smartbuilder_accesos ─────────────────────────────────────
CREATE TABLE smartbuilder_accesos (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  candidato_id     TEXT,
  estandares       TEXT[]      NOT NULL DEFAULT '{}',
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente', 'activo', 'completado')),
  alta_confirmada  BOOLEAN     NOT NULL DEFAULT FALSE,
  ultimo_avance    INTEGER     NOT NULL DEFAULT 0,
  alerta_enviada   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sba_estado_idx ON smartbuilder_accesos (estado) WHERE estado = 'activo';

ALTER TABLE smartbuilder_accesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sba_admin" ON smartbuilder_accesos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

CREATE TRIGGER sba_updated_at BEFORE UPDATE ON smartbuilder_accesos
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── smartbuilder_progreso (histórico diario) ──────────────────
CREATE TABLE smartbuilder_progreso (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  porcentaje   INTEGER     NOT NULL DEFAULT 0 CHECK (porcentaje BETWEEN 0 AND 100),
  datos_raw    JSONB,
  fecha        DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, fecha)
);

CREATE INDEX sbp_lead_fecha_idx ON smartbuilder_progreso (lead_id, fecha DESC);

ALTER TABLE smartbuilder_progreso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sbp_admin" ON smartbuilder_progreso FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

-- ── encuestas ────────────────────────────────────────────────
CREATE TABLE encuestas (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  preguntas     JSONB       NOT NULL DEFAULT '[]',
  respuestas    JSONB,
  estado        TEXT        NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'enviada', 'respondida')),
  procesada_ia  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE encuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "encuestas_admin" ON encuestas FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

CREATE TRIGGER encuestas_updated_at BEFORE UPDATE ON encuestas
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── referidos ────────────────────────────────────────────────
CREATE TABLE referidos (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  codigo            TEXT        NOT NULL UNIQUE,
  lead_referido_id  UUID        REFERENCES leads(id),
  convertido        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE referidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referidos_admin" ON referidos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);
