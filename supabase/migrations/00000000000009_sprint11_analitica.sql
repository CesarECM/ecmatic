-- ============================================================
-- ECMatic · Sprint 11 · Analítica Avanzada y Optimización
-- ============================================================

-- ── calidad_conversacional (S11.2) ───────────────────────────
CREATE TABLE calidad_conversacional (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  vendedor_id           UUID          REFERENCES vendedores(id) ON DELETE SET NULL,
  score_total           INTEGER       NOT NULL DEFAULT 0 CHECK (score_total BETWEEN 0 AND 100),
  coherencia            INTEGER       NOT NULL DEFAULT 0 CHECK (coherencia BETWEEN 0 AND 25),
  velocidad             INTEGER       NOT NULL DEFAULT 0 CHECK (velocidad BETWEEN 0 AND 25),
  cobertura_objeciones  INTEGER       NOT NULL DEFAULT 0 CHECK (cobertura_objeciones BETWEEN 0 AND 25),
  personalizacion       INTEGER       NOT NULL DEFAULT 0 CHECK (personalizacion BETWEEN 0 AND 25),
  ganada                BOOLEAN       NOT NULL DEFAULT FALSE,
  analisis_ia           TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX calidad_vendedor_idx ON calidad_conversacional (vendedor_id, created_at DESC);
CREATE INDEX calidad_lead_idx     ON calidad_conversacional (lead_id);

ALTER TABLE calidad_conversacional ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calidad_admin" ON calidad_conversacional FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

-- ── experimentos_precios (S11.4) ─────────────────────────────
CREATE TABLE experimentos_precios (
  id                 UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre             TEXT          NOT NULL,
  descripcion        TEXT,
  precio_a_centavos  INTEGER       NOT NULL,
  precio_b_centavos  INTEGER       NOT NULL,
  segmento_a         TEXT          NOT NULL DEFAULT 'todos',
  segmento_b         TEXT          NOT NULL DEFAULT 'todos',
  activo             BOOLEAN       NOT NULL DEFAULT TRUE,
  ganador            TEXT          CHECK (ganador IN ('a', 'b')),
  conversiones_a     INTEGER       NOT NULL DEFAULT 0,
  conversiones_b     INTEGER       NOT NULL DEFAULT 0,
  asignaciones_a     INTEGER       NOT NULL DEFAULT 0,
  asignaciones_b     INTEGER       NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE experimentos_precios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "experimentos_admin" ON experimentos_precios FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

CREATE TRIGGER experimentos_updated_at BEFORE UPDATE ON experimentos_precios
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
