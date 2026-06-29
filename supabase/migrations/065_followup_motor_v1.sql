-- MPS-5 S39.1: Motor de Seguimiento Adaptativo v1
-- • Renombra tipos en seguimiento_lead (pago_pendiente→payment, etc.)
-- • Crea followup_config (parámetros de backoff configurable)
-- • Crea followup_attempts_log (auditoría + aprendizaje)
-- • Agrega seguimiento_id a ghl_approval_queue (para avanzarNivel al aprobar)

-- ── 1. Renombrar tipo en seguimiento_lead ────────────────────────────────────

ALTER TABLE seguimiento_lead DROP CONSTRAINT seguimiento_lead_tipo_check;

UPDATE seguimiento_lead SET tipo = 'payment'       WHERE tipo = 'pago_pendiente';
UPDATE seguimiento_lead SET tipo = 'conversational' WHERE tipo = 'silencio_ghl';
UPDATE seguimiento_lead SET tipo = 'nurturing'      WHERE tipo = 'silencio_funnel';

ALTER TABLE seguimiento_lead
  ADD CONSTRAINT seguimiento_lead_tipo_check
  CHECK (tipo IN ('nurturing', 'conversational', 'payment'));

-- ── 2. followup_config — parámetros de backoff por tipo ─────────────────────

CREATE TABLE followup_config (
  tipo         TEXT    PRIMARY KEY CHECK (tipo IN ('nurturing', 'conversational', 'payment')),
  base_hours   NUMERIC NOT NULL DEFAULT 4,    -- delay(1) = base_hours
  growth       NUMERIC NOT NULL DEFAULT 1.5,  -- delay(n) = base × growth^(n-1)
  cap_hours    NUMERIC NOT NULL DEFAULT 48,   -- límite máximo de delay
  max_intentos INT     NOT NULL DEFAULT 5,    -- intentos antes de cancelar/escalar
  window_start INT     NOT NULL DEFAULT 9,    -- hora inicio ventana CDMX (inclusivo)
  window_end   INT     NOT NULL DEFAULT 22,   -- hora fin ventana CDMX (exclusivo)
  search_hours INT     NOT NULL DEFAULT 12,   -- horas post-floor para buscar slot óptimo
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO followup_config (tipo, base_hours, growth, cap_hours, max_intentos, window_start, window_end, search_hours) VALUES
  ('nurturing',      4, 1.7, 96, 6, 9, 22, 12),
  ('conversational', 3, 1.5, 48, 5, 9, 22, 12),
  ('payment',        1, 1.4, 24, 4, 9, 22,  8);

ALTER TABLE followup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_followup_config"
  ON followup_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- ── 3. followup_attempts_log — auditoría + aprendizaje bayesiano ─────────────

CREATE TABLE followup_attempts_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_id   UUID        NOT NULL REFERENCES seguimiento_lead(id) ON DELETE CASCADE,
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  day_of_week      INT         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day      INT         NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  got_response     BOOLEAN,               -- NULL hasta que cierra la ventana de 24h
  response_at      TIMESTAMPTZ,
  window_closes_at TIMESTAMPTZ NOT NULL,  -- sent_at + 24h; el job de aprendizaje lo lee
  channel          TEXT        NOT NULL DEFAULT 'whatsapp'
);

CREATE INDEX idx_followup_attempts_seg    ON followup_attempts_log(seguimiento_id);
CREATE INDEX idx_followup_attempts_lead   ON followup_attempts_log(lead_id);
CREATE INDEX idx_followup_attempts_pending
  ON followup_attempts_log(window_closes_at)
  WHERE got_response IS NULL;

ALTER TABLE followup_attempts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_followup_attempts"
  ON followup_attempts_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- ── 4. seguimiento_id en ghl_approval_queue ──────────────────────────────────

ALTER TABLE ghl_approval_queue
  ADD COLUMN seguimiento_id UUID REFERENCES seguimiento_lead(id) ON DELETE SET NULL;

CREATE INDEX idx_ghl_approval_seguimiento
  ON ghl_approval_queue(seguimiento_id)
  WHERE seguimiento_id IS NOT NULL;
