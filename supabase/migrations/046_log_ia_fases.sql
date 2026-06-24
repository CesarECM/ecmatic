-- ECMatic · Log IA · Fases de llamada (request tracing)
-- Agrega fase (llamado/peticion/respuesta/timeout/error) y request_id para
-- agrupar los 3 logs de cada llamada a Claude en un solo trace.

ALTER TABLE log_ia
  ADD COLUMN IF NOT EXISTS fase       TEXT DEFAULT 'respuesta',
  ADD COLUMN IF NOT EXISTS request_id UUID;

ALTER TABLE log_ia
  ADD CONSTRAINT log_ia_fase_check
  CHECK (fase IN ('llamado', 'peticion', 'respuesta', 'timeout', 'error'));

CREATE INDEX IF NOT EXISTS idx_log_ia_request_id
  ON log_ia (request_id)
  WHERE request_id IS NOT NULL;
