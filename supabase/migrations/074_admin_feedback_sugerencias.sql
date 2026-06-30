-- MPS-16 S57: admin_feedback y tipo_decision en sugerencias_ia
-- Reemplaza el sistema de votos (👍👎) por señal única en cola de aprobaciones.
-- admin_feedback: requerido al rechazar o editar (texto libre del admin).
-- tipo_decision: registro del tipo de acción tomada sobre la sugerencia.

ALTER TABLE sugerencias_ia
  ADD COLUMN IF NOT EXISTS admin_feedback  TEXT,
  ADD COLUMN IF NOT EXISTS tipo_decision   TEXT CHECK (tipo_decision IN ('sin_edicion','editado','rechazado'));
