-- Sprint 18.3 — Identidad de marca (singleton)
-- ================================================================
-- Una sola fila para Centro ECM. Alimenta el branding automático
-- en templates IA (S18.4).

CREATE TABLE identidad_marca (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_empresa    TEXT        NOT NULL DEFAULT 'Centro ECM',
  slogan            TEXT,
  -- Logos (URLs públicas — Supabase Storage o CDN externo)
  logo_url          TEXT,
  logo_dark_url     TEXT,
  -- Paleta de colores (hex)
  color_primario    TEXT        NOT NULL DEFAULT '#1E40AF',
  color_secundario  TEXT        NOT NULL DEFAULT '#F59E0B',
  color_acento      TEXT        NOT NULL DEFAULT '#10B981',
  color_texto       TEXT        NOT NULL DEFAULT '#111827',
  color_fondo       TEXT        NOT NULL DEFAULT '#FFFFFF',
  -- Tipografía
  fuente_principal  TEXT        NOT NULL DEFAULT 'Inter',
  fuente_secundaria TEXT,
  -- Firmas por canal
  firma_whatsapp    TEXT,
  firma_email       TEXT,
  -- Meta
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID        REFERENCES profiles(id)
);

INSERT INTO identidad_marca (nombre_empresa) VALUES ('Centro ECM');

ALTER TABLE identidad_marca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identidad_admin" ON identidad_marca FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE TRIGGER identidad_marca_updated_at
  BEFORE UPDATE ON identidad_marca
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
