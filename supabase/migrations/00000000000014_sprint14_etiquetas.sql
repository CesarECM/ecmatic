-- ============================================================
-- ECMatic · Sprint 14 · Sistema de Etiquetas Auditado por IA
-- ============================================================

-- ── S14.1: etiqueta_categorias ───────────────────────────────
CREATE TABLE etiqueta_categorias (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT        NOT NULL UNIQUE,
  descripcion TEXT,
  color       TEXT        NOT NULL DEFAULT '#6B7280',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE etiqueta_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "etiqueta_cat_read" ON etiqueta_categorias
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "etiqueta_cat_write_admin" ON etiqueta_categorias
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
CREATE POLICY "etiqueta_cat_service" ON etiqueta_categorias
  FOR ALL USING (auth.role() = 'service_role');

-- ── S14.1: etiquetas ─────────────────────────────────────────
CREATE TABLE etiquetas (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id  UUID        NOT NULL REFERENCES etiqueta_categorias(id) ON DELETE CASCADE,
  nombre        TEXT        NOT NULL,
  descripcion   TEXT,
  origen        TEXT        NOT NULL DEFAULT 'manual'
                            CHECK (origen IN ('manual', 'ia_sugerido', 'automatico')),
  estado        TEXT        NOT NULL DEFAULT 'activa'
                            CHECK (estado IN ('activa', 'pendiente_revision', 'archivada')),
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (categoria_id, nombre)
);

CREATE INDEX etiquetas_estado_idx  ON etiquetas (estado) WHERE estado = 'pendiente_revision';
CREATE INDEX etiquetas_cat_idx     ON etiquetas (categoria_id, estado);

ALTER TABLE etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "etiquetas_read" ON etiquetas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "etiquetas_write_admin" ON etiquetas
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
CREATE POLICY "etiquetas_service" ON etiquetas
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER etiquetas_updated_at BEFORE UPDATE ON etiquetas
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── S14.1: lead_etiquetas (many-to-many) ─────────────────────
CREATE TABLE lead_etiquetas (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  etiqueta_id   UUID        NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  asignada_por  TEXT        NOT NULL DEFAULT 'manual'
                            CHECK (asignada_por IN ('manual', 'ia', 'automatico')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, etiqueta_id)
);

CREATE INDEX lead_etiquetas_lead_idx ON lead_etiquetas (lead_id);
CREATE INDEX lead_etiquetas_etq_idx  ON lead_etiquetas (etiqueta_id);

ALTER TABLE lead_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_etq_admin" ON lead_etiquetas
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
CREATE POLICY "lead_etq_vendedor" ON lead_etiquetas
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM leads l JOIN vendedores v ON v.id = l.vendedor_id
    WHERE l.id = lead_etiquetas.lead_id AND v.profile_id = auth.uid()
  ));
CREATE POLICY "lead_etq_service" ON lead_etiquetas
  FOR ALL USING (auth.role() = 'service_role');

-- ── Seed: 5 categorías iniciales ─────────────────────────────
INSERT INTO etiqueta_categorias (nombre, descripcion, color) VALUES
  ('Producto',      'Estándar CONOCER o servicio de interés',      '#3B82F6'),
  ('Comportamiento','Señales de comportamiento del lead',           '#10B981'),
  ('Perfil',        'Características del candidato o empresa',      '#8B5CF6'),
  ('Origen',        'Canal o campaña de procedencia',               '#F59E0B'),
  ('Gestión',       'Flags de gestión interna y estado operativo',  '#EF4444');
