-- GHL-8: campaña automática adaptativa con umbral de auto-aprobación por score IA

ALTER TABLE ghl_approval_stats
  ADD COLUMN activa               BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN umbral_auto          FLOAT      NOT NULL DEFAULT 0.92,
  ADD COLUMN ultimo_lote_at       TIMESTAMPTZ,
  ADD COLUMN ultima_notif_pausa_at TIMESTAMPTZ;

COMMENT ON COLUMN ghl_approval_stats.activa               IS 'Toggle ON/OFF de la campaña automática';
COMMENT ON COLUMN ghl_approval_stats.umbral_auto          IS 'Score mínimo para auto-aprobar sin revisión humana (0–1)';
COMMENT ON COLUMN ghl_approval_stats.ultimo_lote_at       IS 'Timestamp del último lote disparado por el cron';
COMMENT ON COLUMN ghl_approval_stats.ultima_notif_pausa_at IS 'Última vez que se notificó al admin sobre pausa por pendientes';
