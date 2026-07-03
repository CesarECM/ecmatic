-- MPS-27 S101 — Palanca A: auto-aprobaciones de IA alimentan el momentum de velocidad.
-- Cuando la IA auto-aprueba (score ≥ 0.92), el registro se inserta en ghl_approval_queue
-- con estado='aprobado', revisado_at=now() y autoaprobada=true.
-- contarAutoAprobacionesRecientes() las cuenta aparte; auto-disparo las suma con peso 0.5.

ALTER TABLE ghl_approval_queue
  ADD COLUMN IF NOT EXISTS autoaprobada BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: solo filas auto-aprobadas para que contarAutoAprobacionesRecientes sea O(1)
CREATE INDEX IF NOT EXISTS idx_ghl_approval_queue_auto
  ON ghl_approval_queue (campana, revisado_at)
  WHERE autoaprobada = TRUE;
