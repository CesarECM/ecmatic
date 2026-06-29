-- MPS-9 S45.1 — Columnas para rastrear el procesamiento de retroalimentación de ediciones GHL.
-- feedback_procesado: indica si la edición ya generó una sugerencia_ia en la KB.
-- El índice compuesto permite al cron diario leer solo edits pendientes eficientemente.

ALTER TABLE ghl_approval_queue
  ADD COLUMN IF NOT EXISTS feedback_procesado     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_procesado_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ghl_approval_feedback
  ON ghl_approval_queue (estado, feedback_procesado)
  WHERE estado = 'editado';
