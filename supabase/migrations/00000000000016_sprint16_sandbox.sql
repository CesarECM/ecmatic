-- Sprint 16.1: Modelo de datos sandbox
-- Añade flag is_test a leads para aislar conversaciones de prueba

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_is_test ON leads (is_test) WHERE is_test = TRUE;

COMMENT ON COLUMN leads.is_test IS 'TRUE = lead creado desde el Widget de Pruebas; no genera envíos reales de WhatsApp';
