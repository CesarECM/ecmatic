-- ============================================================
-- ECMatic · Sprint 19.6 · Señales situacionales en conversación
-- ============================================================
-- Almacena señales contextuales detectadas por IA en la conversación
-- de un lead: fechas límite, eventos, necesidades de terceros, etc.
-- Usadas por S19.7 para construir ofertas consultivas.
-- ------------------------------------------------------------

CREATE TABLE lead_senales_situacionales (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        TEXT          NOT NULL
                            CHECK (tipo IN (
                              'evento',
                              'fecha_limite',
                              'tercero',
                              'urgencia',
                              'situacion_laboral',
                              'otro'
                            )),
  descripcion TEXT          NOT NULL,
  fragmento   TEXT,                   -- extracto literal de la conversación
  confianza   DECIMAL(3,2)  NOT NULL DEFAULT 0.7
                            CHECK (confianza BETWEEN 0 AND 1),
  activa      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX lead_senales_lead_idx    ON lead_senales_situacionales (lead_id) WHERE activa = TRUE;
CREATE INDEX lead_senales_tipo_idx    ON lead_senales_situacionales (tipo, activa);
CREATE INDEX lead_senales_created_idx ON lead_senales_situacionales (lead_id, created_at DESC);

ALTER TABLE lead_senales_situacionales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "senales_admin" ON lead_senales_situacionales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "senales_service_role" ON lead_senales_situacionales
  FOR ALL USING (auth.role() = 'service_role');
