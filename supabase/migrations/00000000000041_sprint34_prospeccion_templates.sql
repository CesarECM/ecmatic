-- ============================================================
-- ECMatic · Sprint 34 · Prospección Omnicanal + Templates Meta
-- ============================================================
SET search_path TO public;

-- ── Tipos ENUM ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.canal_prospeccion AS ENUM ('email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.condicion_trigger_prosp AS ENUM ('siempre', 'sin_respuesta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_wa_template AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.categoria_wa_template AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_contacto_sec AS ENUM ('activo', 'completado', 'pausado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S34.4 · Templates de WhatsApp ───────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_templates (
  id                    UUID                        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                TEXT                        NOT NULL,
  categoria             public.categoria_wa_template NOT NULL DEFAULT 'MARKETING',
  idioma                TEXT                        NOT NULL DEFAULT 'es_MX',
  componentes           JSONB                       NOT NULL DEFAULT '[]',
  estado_meta           public.estado_wa_template   NOT NULL DEFAULT 'DRAFT',
  imagen_servicio_id    UUID                        REFERENCES public.imagenes_servicio(id) ON DELETE SET NULL,
  meta_template_id      TEXT,
  enviado_a_meta_at     TIMESTAMPTZ,
  aprobado_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "wa_templates_service_role" ON public.wa_templates
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "wa_templates_admin" ON public.wa_templates
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S34.1 · Secuencias de prospección ───────────────────────

CREATE TABLE IF NOT EXISTS public.prospeccion_secuencias (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT        NOT NULL,
  activa     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prospeccion_secuencias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "prospeccion_secuencias_service_role" ON public.prospeccion_secuencias
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "prospeccion_secuencias_admin" ON public.prospeccion_secuencias
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S34.1 · Pasos de cada secuencia ─────────────────────────

CREATE TABLE IF NOT EXISTS public.prospeccion_secuencia_pasos (
  id                UUID                            DEFAULT gen_random_uuid() PRIMARY KEY,
  secuencia_id      UUID                            NOT NULL REFERENCES public.prospeccion_secuencias(id) ON DELETE CASCADE,
  orden             SMALLINT                        NOT NULL,
  canal             public.canal_prospeccion        NOT NULL,
  delay_dias        SMALLINT                        NOT NULL DEFAULT 0,
  condicion_trigger public.condicion_trigger_prosp  NOT NULL DEFAULT 'siempre',
  template_wa_id    UUID                            REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  asunto_email      TEXT,
  cuerpo_email      TEXT,
  created_at        TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  UNIQUE (secuencia_id, orden)
);

ALTER TABLE public.prospeccion_secuencia_pasos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "prospeccion_pasos_service_role" ON public.prospeccion_secuencia_pasos
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "prospeccion_pasos_admin" ON public.prospeccion_secuencia_pasos
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S34.3 · Estado de cada lead en cada secuencia ───────────

CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_secuencia (
  id               UUID                       DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id          UUID                       NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  secuencia_id     UUID                       NOT NULL REFERENCES public.prospeccion_secuencias(id) ON DELETE CASCADE,
  paso_actual_orden SMALLINT                  NOT NULL DEFAULT 0,
  estado           public.estado_contacto_sec NOT NULL DEFAULT 'activo',
  iniciado_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  ultimo_paso_at   TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, secuencia_id)
);

CREATE INDEX IF NOT EXISTS prosp_contacto_sec_estado_idx
  ON public.prospeccion_contacto_secuencia (estado, secuencia_id);

ALTER TABLE public.prospeccion_contacto_secuencia ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "prosp_contacto_sec_service_role" ON public.prospeccion_contacto_secuencia
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S34.7 · A/B de imágenes por template ────────────────────

CREATE TABLE IF NOT EXISTS public.pipeline_ab_imagenes (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id        UUID        NOT NULL REFERENCES public.wa_templates(id) ON DELETE CASCADE,
  imagen_servicio_id UUID        NOT NULL REFERENCES public.imagenes_servicio(id) ON DELETE CASCADE,
  asignaciones       INT         NOT NULL DEFAULT 0,
  respuestas         INT         NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, imagen_servicio_id)
);

ALTER TABLE public.pipeline_ab_imagenes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "pipeline_ab_imagenes_service_role" ON public.pipeline_ab_imagenes
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
