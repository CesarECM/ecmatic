-- MPS-17 S66: arco emocional del lead durante conversación activa
-- Detecta hot_urgente y frustrado_acumulado → ticket + cola de aprobación

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS arco_emocional        TEXT,
  ADD COLUMN IF NOT EXISTS arco_emocional_score  INT,
  ADD COLUMN IF NOT EXISTS arco_emocional_at     TIMESTAMPTZ;
