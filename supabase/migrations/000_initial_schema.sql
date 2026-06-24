-- ============================================================
-- ECMatic · Sprint 0 · Esquema base
-- ============================================================

-- Extensión vectorial para búsqueda semántica (Sprint 2)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- profiles
-- Extiende auth.users con rol y datos de contacto del usuario
-- ============================================================
CREATE TABLE profiles (
  id            UUID        REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email         TEXT        NOT NULL,
  nombre        TEXT,
  rol           TEXT        NOT NULL DEFAULT 'vendedor'
                            CHECK (rol IN ('admin', 'vendedor', 'admin_financiero')),
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  whatsapp_personal TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve solo su propio perfil; admin ve todos
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger: sincronizar nuevo usuario de Auth → profiles
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- avatares
-- Arquetipos de cliente: B2C-1, B2C-2, B2B-1, etc.
-- ============================================================
CREATE TABLE avatares (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo          TEXT        NOT NULL UNIQUE,
  nombre          TEXT        NOT NULL,
  tipo            TEXT        NOT NULL CHECK (tipo IN ('B2C', 'B2B')),
  descripcion     TEXT,
  caracteristicas JSONB       NOT NULL DEFAULT '{}',
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE avatares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avatares_read_authenticated" ON avatares
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "avatares_write_admin" ON avatares
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER avatares_updated_at BEFORE UPDATE ON avatares
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- vendedores
-- Un vendedor es un usuario con rol='vendedor' en profiles
-- ============================================================
CREATE TABLE vendedores (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id  UUID        REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  nombre      TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  telefono    TEXT,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedores_read_authenticated" ON vendedores
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vendedores_write_admin" ON vendedores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER vendedores_updated_at BEFORE UPDATE ON vendedores
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- leads
-- ============================================================
CREATE TABLE leads (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                  TEXT,
  telefono                TEXT        UNIQUE,   -- número WhatsApp
  email                   TEXT,
  canal_origen            TEXT        NOT NULL DEFAULT 'whatsapp',
  pipeline_stage          TEXT        NOT NULL DEFAULT 'nuevo',
  pipeline_ruta           TEXT        NOT NULL DEFAULT 'tripwire'
                                      CHECK (pipeline_ruta IN ('tripwire', 'premium')),
  temperamento_inferido   TEXT        CHECK (temperamento_inferido IN ('D','I','S','C')),
  temperamento_confianza  DECIMAL(3,2) NOT NULL DEFAULT 0,
  avatar_id               UUID        REFERENCES avatares(id),
  vendedor_id             UUID        REFERENCES vendedores(id),
  score_salud             INTEGER     NOT NULL DEFAULT 50 CHECK (score_salud BETWEEN 0 AND 100),
  compra_previa           BOOLEAN     NOT NULL DEFAULT FALSE,
  activo                  BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Admin ve todos los leads
CREATE POLICY "leads_admin_all" ON leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- Vendedor ve solo sus leads asignados
CREATE POLICY "leads_vendedor_own" ON leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = leads.vendedor_id
    )
  );

CREATE POLICY "leads_vendedor_update_own" ON leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = leads.vendedor_id
    )
  );

CREATE INDEX leads_telefono_idx ON leads (telefono);
CREATE INDEX leads_vendedor_idx ON leads (vendedor_id);
CREATE INDEX leads_pipeline_idx ON leads (pipeline_stage, pipeline_ruta);

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- mensajes
-- Canal unificado: WhatsApp, email, Meet, interno
-- ============================================================
CREATE TABLE mensajes (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  canal               TEXT        NOT NULL CHECK (canal IN ('whatsapp', 'email', 'meet', 'interno')),
  direccion           TEXT        NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  contenido           TEXT        NOT NULL,
  intencion_clasificada TEXT,
  procesado_por_ia    BOOLEAN     NOT NULL DEFAULT FALSE,
  wa_message_id       TEXT        UNIQUE,  -- deduplicación Meta
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensajes_admin_all" ON mensajes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "mensajes_vendedor_own_leads" ON mensajes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN vendedores v ON v.id = l.vendedor_id
      WHERE l.id = mensajes.lead_id AND v.profile_id = auth.uid()
    )
  );

CREATE INDEX mensajes_lead_idx ON mensajes (lead_id, created_at DESC);
CREATE INDEX mensajes_wa_idx ON mensajes (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- ============================================================
-- pipeline_etapas
-- Etapas configurables por ruta de producto
-- ============================================================
CREATE TABLE pipeline_etapas (
  id       UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre   TEXT    NOT NULL,
  orden    INTEGER NOT NULL,
  ruta     TEXT    NOT NULL CHECK (ruta IN ('tripwire', 'premium')),
  activo   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orden, ruta)
);

ALTER TABLE pipeline_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_etapas_read_authenticated" ON pipeline_etapas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "pipeline_etapas_write_admin" ON pipeline_etapas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- Etapas por defecto — tripwire ($1,799)
INSERT INTO pipeline_etapas (nombre, orden, ruta) VALUES
  ('Nuevo',          1, 'tripwire'),
  ('Contactado',     2, 'tripwire'),
  ('Interesado',     3, 'tripwire'),
  ('Propuesta',      4, 'tripwire'),
  ('Negociación',    5, 'tripwire'),
  ('Comprado',       6, 'tripwire'),
  ('Perdido',        7, 'tripwire');

-- Etapas por defecto — premium ($10,000+)
INSERT INTO pipeline_etapas (nombre, orden, ruta) VALUES
  ('Nuevo',          1, 'premium'),
  ('Primer contacto', 2, 'premium'),
  ('Diagnóstico',    3, 'premium'),
  ('Propuesta',      4, 'premium'),
  ('Seguimiento',    5, 'premium'),
  ('Decisión',       6, 'premium'),
  ('Comprado',       7, 'premium'),
  ('Perdido',        8, 'premium');

-- ============================================================
-- pipeline_movimientos
-- Historial de cambios de etapa por lead
-- ============================================================
CREATE TABLE pipeline_movimientos (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  etapa_anterior  TEXT,
  etapa_nueva     TEXT        NOT NULL,
  motivo          TEXT,
  movido_por      TEXT        NOT NULL DEFAULT 'ia'
                              CHECK (movido_por IN ('ia', 'admin', 'vendedor', 'webhook')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pipeline_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_movimientos_admin_all" ON pipeline_movimientos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "pipeline_movimientos_vendedor_read" ON pipeline_movimientos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN vendedores v ON v.id = l.vendedor_id
      WHERE l.id = pipeline_movimientos.lead_id AND v.profile_id = auth.uid()
    )
  );

CREATE INDEX pipeline_mov_lead_idx ON pipeline_movimientos (lead_id, created_at DESC);

-- ============================================================
-- recursos_conocimiento
-- Base de conocimiento viva: FAQs, objeciones, servicios, templates
-- ============================================================
CREATE TABLE recursos_conocimiento (
  id                        UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo                      TEXT          NOT NULL
                                          CHECK (tipo IN (
                                            'faq', 'objecion', 'servicio',
                                            'template_wa', 'template_email', 'practica_venta'
                                          )),
  titulo                    TEXT          NOT NULL,
  contenido                 TEXT          NOT NULL,
  embedding                 vector(1536),
  score_confianza           DECIMAL(3,2)  NOT NULL DEFAULT 0.5,
  score_uso                 INTEGER       NOT NULL DEFAULT 0,
  score_cierre              DECIMAL(3,2)  NOT NULL DEFAULT 0,
  activo                    BOOLEAN       NOT NULL DEFAULT TRUE,
  aprobado                  BOOLEAN       NOT NULL DEFAULT FALSE,
  origen                    TEXT          NOT NULL DEFAULT 'interno'
                                          CHECK (origen IN ('interno', 'ia_sugerido', 'externo')),
  versiones_previas         JSONB         NOT NULL DEFAULT '[]',
  fecha_ultima_actualizacion TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE recursos_conocimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recursos_read_authenticated" ON recursos_conocimiento
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "recursos_write_admin" ON recursos_conocimiento
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- Índice HNSW para búsqueda semántica eficiente (pgvector)
CREATE INDEX recursos_embedding_idx ON recursos_conocimiento
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX recursos_tipo_idx ON recursos_conocimiento (tipo, activo, aprobado);

CREATE TRIGGER recursos_updated_at BEFORE UPDATE ON recursos_conocimiento
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- Función de búsqueda semántica (usada desde Sprint 1)
-- ============================================================
CREATE OR REPLACE FUNCTION buscar_recursos(
  query_embedding vector(1536),
  tipo_filtro     TEXT DEFAULT NULL,
  limite          INTEGER DEFAULT 5,
  umbral          FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id          UUID,
  tipo        TEXT,
  titulo      TEXT,
  contenido   TEXT,
  similitud   FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.tipo,
    r.titulo,
    r.contenido,
    1 - (r.embedding <=> query_embedding) AS similitud
  FROM recursos_conocimiento r
  WHERE
    r.activo = TRUE
    AND r.aprobado = TRUE
    AND (tipo_filtro IS NULL OR r.tipo = tipo_filtro)
    AND 1 - (r.embedding <=> query_embedding) >= umbral
  ORDER BY r.embedding <=> query_embedding
  LIMIT limite;
END;
$$;
