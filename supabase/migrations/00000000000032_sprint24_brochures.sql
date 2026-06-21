-- ============================================================
-- ECMatic · Sprint 24 · S24.3 — Tabla brochures
-- ============================================================

CREATE TABLE brochures (
  id                   UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo               TEXT         NOT NULL,
  descripcion          TEXT         NOT NULL DEFAULT '',
  recurso_id           UUID         REFERENCES recursos_conocimiento (id) ON DELETE SET NULL,
  url                  TEXT         NOT NULL,
  fases_cagc_objetivo  SMALLINT[]   NOT NULL DEFAULT '{}',
  score_efectividad    NUMERIC(3,2) NOT NULL DEFAULT 0.50
                                    CHECK (score_efectividad BETWEEN 0 AND 1),
  activo               BOOLEAN      NOT NULL DEFAULT TRUE,
  veces_ofrecido       INTEGER      NOT NULL DEFAULT 0,
  veces_aceptado       INTEGER      NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX brochures_recurso_idx  ON brochures (recurso_id);
CREATE INDEX brochures_activo_idx   ON brochures (activo);
CREATE INDEX brochures_fases_idx    ON brochures USING GIN (fases_cagc_objetivo);

ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brochures_read_authenticated" ON brochures
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "brochures_write_admin" ON brochures
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "brochures_service_role" ON brochures
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER brochures_updated_at BEFORE UPDATE ON brochures
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
