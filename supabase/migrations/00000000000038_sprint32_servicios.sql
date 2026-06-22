-- ============================================================
-- ECMatic · Sprint 32 · Motor Comercial de Servicios
-- ============================================================

-- Forzar search_path a public para evitar errores de relación no encontrada
SET search_path TO public;

-- S32.1a — Precio de descuento en servicios
ALTER TABLE public.recursos_conocimiento
  ADD COLUMN IF NOT EXISTS precio_descuento_centavos INTEGER;

-- S32.1b — Bundle rules: relaciones explícitas entre servicios
DO $$ BEGIN
  CREATE TYPE public.tipo_bundle AS ENUM ('complementa', 'leadmagnet');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.bundle_reglas (
  id                  UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_origen_id  UUID             NOT NULL REFERENCES public.recursos_conocimiento(id) ON DELETE CASCADE,
  servicio_destino_id UUID             NOT NULL REFERENCES public.recursos_conocimiento(id) ON DELETE CASCADE,
  tipo                public.tipo_bundle NOT NULL,
  activo              BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT bundle_reglas_unique UNIQUE (servicio_origen_id, servicio_destino_id, tipo)
);

CREATE INDEX IF NOT EXISTS bundle_reglas_origen_idx  ON public.bundle_reglas (servicio_origen_id);
CREATE INDEX IF NOT EXISTS bundle_reglas_destino_idx ON public.bundle_reglas (servicio_destino_id);

ALTER TABLE public.bundle_reglas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "bundle_reglas_read_authenticated" ON public.bundle_reglas
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "bundle_reglas_write_admin" ON public.bundle_reglas
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "bundle_reglas_service_role" ON public.bundle_reglas
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- S32.1c — Repositorio de imágenes por servicio (Supabase Storage)
DO $$ BEGIN
  CREATE TYPE public.canal_imagen_servicio AS ENUM ('whatsapp', 'email', 'landing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.imagenes_servicio (
  id               UUID                        DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_id      UUID                        NOT NULL REFERENCES public.recursos_conocimiento(id) ON DELETE CASCADE,
  storage_path     TEXT                        NOT NULL,
  canal_uso        public.canal_imagen_servicio NOT NULL,
  etiqueta         TEXT,
  score_conversion DECIMAL(4,3)                NOT NULL DEFAULT 0,
  veces_mostrada   INTEGER                     NOT NULL DEFAULT 0,
  veces_respondida INTEGER                     NOT NULL DEFAULT 0,
  activa           BOOLEAN                     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS imagenes_servicio_servicio_idx ON public.imagenes_servicio (servicio_id);
CREATE INDEX IF NOT EXISTS imagenes_servicio_canal_idx    ON public.imagenes_servicio (canal_uso, activa);

ALTER TABLE public.imagenes_servicio ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicio_read_authenticated" ON public.imagenes_servicio
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicio_write_admin" ON public.imagenes_servicio
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicio_service_role" ON public.imagenes_servicio
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- S32.1d — Storage bucket público para imágenes (5 MB, solo formatos imagen)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imagenes-servicios',
  'imagenes-servicios',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicios_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'imagenes-servicios');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicios_service_write" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'imagenes-servicios' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "imagenes_servicios_service_delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'imagenes-servicios' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
