-- ============================================================
-- ECMatic · Sprint 20 · S20.1 — Tabla leadmagnets
-- ============================================================

CREATE TYPE tipo_leadmagnet AS ENUM (
  'pre-creado',
  'generable-ia',
  'requiere-humano'
);

CREATE TABLE leadmagnets (
  id                   UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo               TEXT         NOT NULL,
  descripcion          TEXT         NOT NULL DEFAULT '',
  tipo                 tipo_leadmagnet NOT NULL,
  fases_cagc_objetivo  SMALLINT[]   NOT NULL DEFAULT '{}',
  contenido            TEXT,        -- NULL para generable-ia y requiere-humano
  score_efectividad    NUMERIC(3,2) NOT NULL DEFAULT 0.50
                                    CHECK (score_efectividad BETWEEN 0 AND 1),
  activo               BOOLEAN      NOT NULL DEFAULT TRUE,
  veces_ofrecido       INTEGER      NOT NULL DEFAULT 0,
  veces_aceptado       INTEGER      NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX leadmagnets_tipo_idx    ON leadmagnets (tipo);
CREATE INDEX leadmagnets_activo_idx  ON leadmagnets (activo);
CREATE INDEX leadmagnets_fases_idx   ON leadmagnets USING GIN (fases_cagc_objetivo);

ALTER TABLE leadmagnets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leadmagnets_read_authenticated" ON leadmagnets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leadmagnets_write_admin" ON leadmagnets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "leadmagnets_service_role" ON leadmagnets
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER leadmagnets_updated_at BEFORE UPDATE ON leadmagnets
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
