-- MPS-6 S41.2 — Sistema Bayesiano de Confianza v1
-- Reemplaza la racha discreta con un Trust Score continuo Beta-Binomial
-- sobre ventana deslizante de las últimas N decisiones humanas.

ALTER TABLE ghl_approval_stats
  ADD COLUMN IF NOT EXISTS decisions_window JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS trust_score      FLOAT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_size      INT          NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS last_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_phantom_at  TIMESTAMPTZ;

COMMENT ON COLUMN ghl_approval_stats.decisions_window
  IS 'Ventana circular de las últimas window_size decisiones humanas. 1=aprobado, 0=editado, -1=phantom decay. Rechazados no entran.';

COMMENT ON COLUMN ghl_approval_stats.trust_score
  IS 'Wilson lower bound de Beta(alpha+0.5, beta+0.5) sobre decisions_window. Fuente de verdad para velocidad de campaña.';

COMMENT ON COLUMN ghl_approval_stats.window_size
  IS 'Tamaño máximo de decisions_window. Default 20. Ajustable sin deploy.';

COMMENT ON COLUMN ghl_approval_stats.last_decision_at
  IS 'Timestamp de la última decisión humana (aprobado/editado). Usado por cron de decay para calcular días de inactividad.';

COMMENT ON COLUMN ghl_approval_stats.last_phantom_at
  IS 'Timestamp de la última inyección de phantom edit por decay. Evita inyecciones dobles si el cron corre más de una vez al día.';

-- Inicializar fila activa con defaults explícitos
UPDATE ghl_approval_stats
SET
  decisions_window = '[]',
  trust_score      = 0,
  window_size      = 20,
  last_decision_at = NULL,
  last_phantom_at  = NULL
WHERE campana_key = 'sbc_jun26';
