-- 096_v2_schema.sql
-- ECMatic v2 — Schema base Fase 1
-- 8 tablas con prefijo v2_ para coexistir con v1.7 sin colisiones.
-- set_updated_at() y la extensión vector ya existen (000_initial_schema.sql).

BEGIN;

-- ============================================================
-- v2_leads
-- Réplica sincronizada de contactos GHL. Fuente: webhooks GHL.
-- ============================================================
CREATE TABLE v2_leads (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_contact_id  TEXT        UNIQUE NOT NULL,
  nombre          TEXT,
  telefono        TEXT,
  email           TEXT,
  origen          TEXT        NOT NULL DEFAULT 'whatsapp'
                              CHECK (origen IN ('whatsapp', 'ghl', 'manual')),
  estado          TEXT        NOT NULL DEFAULT 'activo'
                              CHECK (estado IN ('activo', 'GANADO', 'PERDIDO', 'INACTIVO', 'LISTA_NEGRA')),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_leads_admin_all" ON v2_leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_leads_service_role" ON v2_leads
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_leads_ghl_idx     ON v2_leads (ghl_contact_id);
CREATE INDEX v2_leads_estado_idx  ON v2_leads (estado);
CREATE INDEX v2_leads_telefono_idx ON v2_leads (telefono);

CREATE TRIGGER v2_leads_updated_at BEFORE UPDATE ON v2_leads
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- v2_opportunities
-- Una oportunidad por lead/producto-servicio. CAGC por oportunidad.
-- ============================================================
CREATE TABLE v2_opportunities (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             UUID        NOT NULL REFERENCES v2_leads(id) ON DELETE CASCADE,
  producto_servicio   TEXT,       -- inferido por IA, campo libre (no FK a catálogo)
  fase_cagc           TEXT        NOT NULL DEFAULT 'conciencia'
                                  CHECK (fase_cagc IN ('conciencia', 'atencion', 'generacion', 'cierre')),
  estado              TEXT        NOT NULL DEFAULT 'activa'
                                  CHECK (estado IN ('activa', 'GANADA', 'PERDIDA', 'INACTIVA', 'LISTA_NEGRA')),
  score_probabilidad  INTEGER     NOT NULL DEFAULT 50 CHECK (score_probabilidad BETWEEN 0 AND 100),
  score_urgencia      INTEGER     NOT NULL DEFAULT 50 CHECK (score_urgencia BETWEEN 0 AND 100),
  score_combinado     INTEGER     NOT NULL DEFAULT 50 CHECK (score_combinado BETWEEN 0 AND 100),
  fecha_reactivacion  TIMESTAMPTZ,  -- sincronizado con custom field de GHL
  metadata            JSONB       NOT NULL DEFAULT '{}',  -- señales de scoring, reasoning IA
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_opportunities_admin_all" ON v2_opportunities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_opportunities_service_role" ON v2_opportunities
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_opportunities_lead_idx    ON v2_opportunities (lead_id);
CREATE INDEX v2_opportunities_estado_idx  ON v2_opportunities (estado);
CREATE INDEX v2_opportunities_score_idx   ON v2_opportunities (score_combinado DESC);
CREATE INDEX v2_opportunities_reactiv_idx ON v2_opportunities (fecha_reactivacion)
  WHERE fecha_reactivacion IS NOT NULL;

CREATE TRIGGER v2_opportunities_updated_at BEFORE UPDATE ON v2_opportunities
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- v2_opportunity_notes
-- Notas libres sobre una oportunidad. Cada nota dispara re-análisis IA.
-- ============================================================
CREATE TABLE v2_opportunity_notes (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id  UUID        NOT NULL REFERENCES v2_opportunities(id) ON DELETE CASCADE,
  contenido       TEXT        NOT NULL,
  autor           UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_opportunity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_opportunity_notes_admin_all" ON v2_opportunity_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_opportunity_notes_service_role" ON v2_opportunity_notes
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_opp_notes_opp_idx ON v2_opportunity_notes (opportunity_id, created_at DESC);

-- ============================================================
-- v2_contact_points
-- Corazón del loop: cada acción propuesta o ejecutada hacia un lead.
-- opportunity_ids[] permite contact_points fusionados (§4 del doc).
-- ============================================================
CREATE TABLE v2_contact_points (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             UUID        NOT NULL REFERENCES v2_leads(id) ON DELETE CASCADE,
  opportunity_ids     UUID[]      NOT NULL DEFAULT '{}',
  tipo                TEXT        NOT NULL
                                  CHECK (tipo IN ('whatsapp', 'email', 'llamada', 'videollamada')),
  estado              TEXT        NOT NULL DEFAULT 'pendiente_generacion'
                                  CHECK (estado IN (
                                    'pendiente_generacion',
                                    'generado',
                                    'aprobado',
                                    'rechazado',
                                    'editado',
                                    'enviado_automatico',
                                    'enviado_manual',
                                    'enviado'
                                  )),
  contenido_propuesto TEXT,
  contenido_final     TEXT,
  confianza           DECIMAL(5,2) NOT NULL DEFAULT 0
                                  CHECK (confianza BETWEEN 0 AND 100),
  es_fusionado        BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata            JSONB       NOT NULL DEFAULT '{}',  -- reasoning IA, fuentes KB usadas
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_contact_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_contact_points_admin_all" ON v2_contact_points
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_contact_points_service_role" ON v2_contact_points
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_cp_lead_idx    ON v2_contact_points (lead_id, created_at DESC);
CREATE INDEX v2_cp_estado_idx  ON v2_contact_points (estado, created_at ASC);

CREATE TRIGGER v2_contact_points_updated_at BEFORE UPDATE ON v2_contact_points
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- v2_follow_up_notes
-- Resultado de un contact_point (hecho/no_hecho) + retroalimentación.
-- ============================================================
CREATE TABLE v2_follow_up_notes (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_point_id          UUID        NOT NULL REFERENCES v2_contact_points(id) ON DELETE CASCADE,
  resultado                 TEXT        NOT NULL CHECK (resultado IN ('hecho', 'no_hecho')),
  observaciones             TEXT,
  retroalimentacion_edicion TEXT,  -- obligatoria cuando el contact_point fue editado o rechazado
  autor                     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_follow_up_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_follow_up_notes_admin_all" ON v2_follow_up_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_follow_up_notes_service_role" ON v2_follow_up_notes
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_fun_cp_idx ON v2_follow_up_notes (contact_point_id);

-- ============================================================
-- v2_kb_items
-- Base de conocimiento: FAQs + Instrucciones de Conversación (IC).
-- Sin catálogo de productos/servicios (§4 del doc).
-- ============================================================
CREATE TABLE v2_kb_items (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('FAQ', 'IC')),
  contenido         TEXT        NOT NULL,
  estado            TEXT        NOT NULL DEFAULT 'propuesto'
                                CHECK (estado IN ('propuesto', 'aprobado', 'rechazado')),
  score_confianza   DECIMAL(5,2) NOT NULL DEFAULT 50
                                CHECK (score_confianza BETWEEN 0 AND 100),
  ultima_validacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version           INTEGER     NOT NULL DEFAULT 1,
  embedding         vector(1536),  -- OpenAI text-embedding-3-small
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_kb_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_kb_items_admin_all" ON v2_kb_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_kb_items_service_role" ON v2_kb_items
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_kb_tipo_idx      ON v2_kb_items (tipo, estado);
CREATE INDEX v2_kb_confianza_idx ON v2_kb_items (score_confianza DESC) WHERE estado = 'aprobado';

CREATE TRIGGER v2_kb_items_updated_at BEFORE UPDATE ON v2_kb_items
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- v2_conversation_rules
-- Reglas siempre inyectadas en cada prompt del loop.
-- ============================================================
CREATE TABLE v2_conversation_rules (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  contenido   TEXT        NOT NULL,
  activa      BOOLEAN     NOT NULL DEFAULT TRUE,
  orden       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_conversation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_conv_rules_admin_all" ON v2_conversation_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_conv_rules_service_role" ON v2_conversation_rules
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_conv_rules_orden_idx ON v2_conversation_rules (orden) WHERE activa = TRUE;

CREATE TRIGGER v2_conv_rules_updated_at BEFORE UPDATE ON v2_conversation_rules
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- v2_kbx_review_queue
-- Cola de mantenimiento KB generada por el cron KBX diario.
-- ============================================================
CREATE TABLE v2_kbx_review_queue (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  kb_item_ids     UUID[]      NOT NULL DEFAULT '{}',
  accion_sugerida TEXT        NOT NULL
                              CHECK (accion_sugerida IN ('eliminar', 'unir', 'separar', 'marcar_obsoleto')),
  razon           TEXT,
  estado          TEXT        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE v2_kbx_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_kbx_queue_admin_all" ON v2_kbx_review_queue
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "v2_kbx_queue_service_role" ON v2_kbx_review_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX v2_kbx_estado_idx ON v2_kbx_review_queue (estado, created_at DESC);

CREATE TRIGGER v2_kbx_queue_updated_at BEFORE UPDATE ON v2_kbx_review_queue
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- Realtime — habilitar para las dos tablas reactivas del loop
-- ============================================================
ALTER TABLE v2_contact_points REPLICA IDENTITY FULL;
ALTER TABLE v2_opportunities  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE v2_contact_points;
ALTER PUBLICATION supabase_realtime ADD TABLE v2_opportunities;

COMMIT;
