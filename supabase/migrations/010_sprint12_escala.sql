-- ============================================================
-- ECMatic · Sprint 12 · Integraciones Pendientes y Escala
-- ============================================================

-- ── utm_sources — atribución de leads a fuentes de Ads (S12.4) ─
CREATE TABLE utm_sources (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID        REFERENCES leads(id) ON DELETE CASCADE,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,
  utm_term      TEXT,
  referrer      TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX utm_lead_idx      ON utm_sources (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX utm_campaign_idx  ON utm_sources (utm_campaign, utm_source);

ALTER TABLE utm_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "utm_admin" ON utm_sources FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

-- ── mensajes_cola — cola DB para envíos WA resilientes (S12.2) ─
CREATE TABLE mensajes_cola (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono      TEXT        NOT NULL,
  contenido     TEXT        NOT NULL,
  intentos      INTEGER     NOT NULL DEFAULT 0,
  estado        TEXT        NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
  error_detalle TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cola_pendientes_idx ON mensajes_cola (estado, created_at)
  WHERE estado = 'pendiente';

ALTER TABLE mensajes_cola ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cola_admin" ON mensajes_cola FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);

CREATE TRIGGER mensajes_cola_updated_at BEFORE UPDATE ON mensajes_cola
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── Campos de privacidad LFPDPPP en leads (S12.9) ────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS privacidad_aceptada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS privacidad_fecha     TIMESTAMPTZ;

-- ── Campos B2B en leads (S12.5) — se almacenan también en metadata
-- RFC para Facturama (S12.6) — en metadata del lead
-- Índice de performance (S12.7)
CREATE INDEX IF NOT EXISTS leads_stage_activo_idx ON leads (pipeline_stage, pipeline_ruta, activo)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS mensajes_canal_fecha_idx ON mensajes (lead_id, canal, created_at DESC);
