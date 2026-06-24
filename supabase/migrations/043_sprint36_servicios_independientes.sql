-- ============================================================
-- ECMatic · Sprint 36 · Servicios independientes de la KB
-- ============================================================
SET search_path TO public;

-- ── 1. ENUMs nuevos ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.modalidad_servicio AS ENUM ('presencial', 'en_linea', 'hibrido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_relacion_servicio AS ENUM (
    'complementa', 'es_leadmagnet_de', 'prerequisito_de',
    'version_avanzada_de', 'incluye_a', 'compite_con'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Tabla servicios (entidad propia) ─────────────────────
CREATE TABLE IF NOT EXISTS public.servicios (
  id                          UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo                      TEXT             NOT NULL,
  contenido                   TEXT             NOT NULL,
  activo                      BOOLEAN          NOT NULL DEFAULT TRUE,
  aprobado                    BOOLEAN          NOT NULL DEFAULT TRUE,
  origen                      TEXT             NOT NULL DEFAULT 'interno',
  score_uso                   INTEGER          NOT NULL DEFAULT 0,
  score_cierre                INTEGER          NOT NULL DEFAULT 0,
  score_confianza             DECIMAL(4,3)     NOT NULL DEFAULT 0,
  versiones_previas           JSONB            NOT NULL DEFAULT '[]',
  embedding                   vector(1536),

  -- Ficha enriquecida (S22)
  caracteristicas             TEXT,
  beneficios                  TEXT,
  ventajas                    TEXT,
  para_quien_es               TEXT,
  para_quien_no_es            TEXT,

  -- Precios
  precio_centavos             INTEGER,
  precio_descuento_centavos   INTEGER,

  -- CONOCER
  estandar_conocer            TEXT,
  nivel_estandar              SMALLINT         CHECK (nivel_estandar BETWEEN 1 AND 5),
  conocer_habilitado          BOOLEAN          NOT NULL DEFAULT TRUE,

  -- Características de venta
  modalidad                   public.modalidad_servicio,
  duracion_horas              SMALLINT,
  requisitos_previos          TEXT,
  entregables                 TEXT[],
  garantia                    TEXT,
  tiempo_promedio_cierre_dias SMALLINT,

  -- Público objetivo
  sector_industria            TEXT[],
  ocupacion_objetivo          TEXT,

  -- Catálogo y branding
  orden_catalogo              SMALLINT,
  color_marca                 TEXT,
  icono                       TEXT,
  slug                        TEXT             UNIQUE,
  url_landing_propia          TEXT,

  -- SEO / marketing
  meta_title                  TEXT,
  meta_descripcion            TEXT,

  created_at                  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── 3. Migrar datos desde recursos_conocimiento (mismos UUIDs) ─
INSERT INTO public.servicios (
  id, titulo, contenido, activo, aprobado, origen,
  score_uso, score_cierre, score_confianza, versiones_previas, embedding,
  caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es,
  precio_centavos, precio_descuento_centavos,
  created_at, updated_at
)
SELECT
  id, titulo, contenido, activo, aprobado, origen,
  score_uso, score_cierre, score_confianza, versiones_previas, embedding,
  caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es,
  precio_centavos, precio_descuento_centavos,
  created_at, updated_at
FROM public.recursos_conocimiento
WHERE tipo = 'servicio'
ON CONFLICT (id) DO NOTHING;

-- Desactivar filas antiguas para evitar duplicados en búsqueda KB
UPDATE public.recursos_conocimiento
  SET activo = FALSE
  WHERE tipo = 'servicio';

-- ── 4. FK: imagenes_servicio → servicios ────────────────────
ALTER TABLE public.imagenes_servicio
  DROP CONSTRAINT IF EXISTS imagenes_servicio_servicio_id_fkey;
ALTER TABLE public.imagenes_servicio
  ADD CONSTRAINT imagenes_servicio_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;

-- ── 5. servicio_pagos: agregar servicio_id ──────────────────
ALTER TABLE public.servicio_pagos
  ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES public.servicios(id) ON DELETE CASCADE;
UPDATE public.servicio_pagos SET servicio_id = recurso_id WHERE servicio_id IS NULL;

-- ── 6. brochures: agregar servicio_id ──────────────────────
ALTER TABLE public.brochures
  ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES public.servicios(id) ON DELETE SET NULL;
UPDATE public.brochures
  SET servicio_id = recurso_id
  WHERE recurso_id IN (SELECT id FROM public.servicios)
    AND servicio_id IS NULL;

-- ── 7. Tabla servicio_relaciones ────────────────────────────
CREATE TABLE IF NOT EXISTS public.servicio_relaciones (
  id                  UUID                          DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_origen_id  UUID                          NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  servicio_destino_id UUID                          NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  tipo                public.tipo_relacion_servicio NOT NULL,
  descripcion         TEXT,
  activa              BOOLEAN                       NOT NULL DEFAULT TRUE,
  creado_por          TEXT                          NOT NULL DEFAULT 'usuario',
  created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  CONSTRAINT servicio_relaciones_unique UNIQUE (servicio_origen_id, servicio_destino_id, tipo)
);

-- Migrar bundle_reglas → servicio_relaciones
INSERT INTO public.servicio_relaciones (servicio_origen_id, servicio_destino_id, tipo, activa, created_at)
SELECT
  servicio_origen_id,
  servicio_destino_id,
  (CASE tipo::text
    WHEN 'complementa' THEN 'complementa'
    WHEN 'leadmagnet'  THEN 'es_leadmagnet_de'
  END)::public.tipo_relacion_servicio,
  activo,
  created_at
FROM public.bundle_reglas
WHERE servicio_origen_id IN (SELECT id FROM public.servicios)
  AND servicio_destino_id IN (SELECT id FROM public.servicios)
ON CONFLICT DO NOTHING;

-- ── 8. FK: sugerencias_ia.servicio_id → servicios ───────────
ALTER TABLE public.sugerencias_ia
  DROP CONSTRAINT IF EXISTS sugerencias_ia_servicio_id_fkey;
ALTER TABLE public.sugerencias_ia
  ADD CONSTRAINT sugerencias_ia_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE SET NULL;

-- ── 9. Función RPC para búsqueda semántica en servicios ─────
DROP FUNCTION IF EXISTS public.buscar_servicios(vector, integer, float);
CREATE FUNCTION public.buscar_servicios(
  query_embedding  vector(1536),
  limite           INTEGER DEFAULT 5,
  umbral           FLOAT   DEFAULT 0.65
)
RETURNS TABLE (
  id               UUID,
  tipo             TEXT,
  titulo           TEXT,
  contenido        TEXT,
  similitud        FLOAT,
  caracteristicas  TEXT,
  beneficios       TEXT,
  ventajas         TEXT,
  para_quien_es    TEXT,
  para_quien_no_es TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    'servicio'::TEXT                                     AS tipo,
    s.titulo,
    s.contenido,
    (1 - (s.embedding <=> query_embedding))::FLOAT       AS similitud,
    s.caracteristicas,
    s.beneficios,
    s.ventajas,
    s.para_quien_es,
    s.para_quien_no_es
  FROM public.servicios s
  WHERE
    s.activo    = TRUE
    AND s.aprobado = TRUE
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) >= umbral
  ORDER BY s.embedding <=> query_embedding
  LIMIT limite;
END;
$$;

-- ── 10. Índices ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS servicios_activo_idx           ON public.servicios (activo);
CREATE INDEX IF NOT EXISTS servicios_updated_idx          ON public.servicios (updated_at DESC);
CREATE INDEX IF NOT EXISTS servicio_relaciones_origen_idx  ON public.servicio_relaciones (servicio_origen_id);
CREATE INDEX IF NOT EXISTS servicio_relaciones_destino_idx ON public.servicio_relaciones (servicio_destino_id);

-- ── 11. RLS: servicios ───────────────────────────────────────
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "servicios_read_all" ON public.servicios FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "servicios_write_admin" ON public.servicios FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "servicios_service_role" ON public.servicios
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 12. RLS: servicio_relaciones ─────────────────────────────
ALTER TABLE public.servicio_relaciones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "servicio_relaciones_read_auth" ON public.servicio_relaciones
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "servicio_relaciones_write_admin" ON public.servicio_relaciones FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "servicio_relaciones_service_role" ON public.servicio_relaciones
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 13. Trigger updated_at ───────────────────────────────────
DROP TRIGGER IF EXISTS servicios_updated_at ON public.servicios;
CREATE TRIGGER servicios_updated_at
  BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
