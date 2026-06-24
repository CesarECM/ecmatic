-- S23.1 — Campo Contexto: capa interpretativa viva del lead, con historial versionado.
-- Convive con el Timeline (registro crudo). La IA lo mantiene; el humano puede anotarlo.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contexto            TEXT,
  ADD COLUMN IF NOT EXISTS contexto_historial  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contexto_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.contexto            IS 'Capa interpretativa viva: situación actual, intención, objeción dominante y próxima oportunidad.';
COMMENT ON COLUMN leads.contexto_historial  IS 'Versiones anteriores: [{id, contenido, origen, autor?, accion?, timestamp}]';
COMMENT ON COLUMN leads.contexto_updated_at IS 'Última vez que la IA o un humano actualizaron el Contexto.';
