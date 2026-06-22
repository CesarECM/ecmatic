-- ============================================================
-- ECMatic · Sprint 32 · Motor Comercial de Servicios
-- ============================================================

-- S32.1a — Precio de descuento en servicios
ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS precio_descuento_centavos INTEGER;

-- S32.1b — Bundle rules: relaciones explícitas entre servicios
CREATE TYPE tipo_bundle AS ENUM ('complementa', 'leadmagnet');

CREATE TABLE bundle_reglas (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_origen_id  UUID        NOT NULL REFERENCES recursos_conocimiento(id) ON DELETE CASCADE,
  servicio_destino_id UUID        NOT NULL REFERENCES recursos_conocimiento(id) ON DELETE CASCADE,
  tipo                tipo_bundle NOT NULL,
  activo              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bundle_reglas_unique UNIQUE (servicio_origen_id, servicio_destino_id, tipo)
);

CREATE INDEX bundle_reglas_origen_idx  ON bundle_reglas (servicio_origen_id);
CREATE INDEX bundle_reglas_destino_idx ON bundle_reglas (servicio_destino_id);

ALTER TABLE bundle_reglas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bundle_reglas_read_authenticated" ON bundle_reglas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "bundle_reglas_write_admin" ON bundle_reglas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "bundle_reglas_service_role" ON bundle_reglas
  FOR ALL USING (auth.role() = 'service_role');

-- S32.1c — Repositorio de imágenes por servicio (Supabase Storage)
CREATE TYPE canal_imagen_servicio AS ENUM ('whatsapp', 'email', 'landing');

CREATE TABLE imagenes_servicio (
  id               UUID                  DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_id      UUID                  NOT NULL REFERENCES recursos_conocimiento(id) ON DELETE CASCADE,
  storage_path     TEXT                  NOT NULL,
  canal_uso        canal_imagen_servicio NOT NULL,
  etiqueta         TEXT,
  score_conversion DECIMAL(4,3)          NOT NULL DEFAULT 0,
  veces_mostrada   INTEGER               NOT NULL DEFAULT 0,
  veces_respondida INTEGER               NOT NULL DEFAULT 0,
  activa           BOOLEAN               NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX imagenes_servicio_servicio_idx ON imagenes_servicio (servicio_id);
CREATE INDEX imagenes_servicio_canal_idx    ON imagenes_servicio (canal_uso, activa);

ALTER TABLE imagenes_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imagenes_servicio_read_authenticated" ON imagenes_servicio
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "imagenes_servicio_write_admin" ON imagenes_servicio
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "imagenes_servicio_service_role" ON imagenes_servicio
  FOR ALL USING (auth.role() = 'service_role');

-- S32.1d — Storage bucket público para imágenes (5 MB, solo formatos imagen)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imagenes-servicios',
  'imagenes-servicios',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "imagenes_servicios_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'imagenes-servicios');

CREATE POLICY "imagenes_servicios_service_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'imagenes-servicios' AND auth.role() = 'service_role');

CREATE POLICY "imagenes_servicios_service_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'imagenes-servicios' AND auth.role() = 'service_role');
