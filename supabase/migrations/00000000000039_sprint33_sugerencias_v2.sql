-- ============================================================
-- ECMatic · Sprint 33 · Sugerencias 2.0 — Campos contextuales + embeddings
-- S33.1: servicio_id, fase_cagc, tipo_brief, embedding en sugerencias_ia
-- ============================================================

SET search_path TO public;

ALTER TABLE public.sugerencias_ia
  ADD COLUMN IF NOT EXISTS servicio_id UUID
    REFERENCES public.recursos_conocimiento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fase_cagc   SMALLINT
    CHECK (fase_cagc BETWEEN 0 AND 16),
  ADD COLUMN IF NOT EXISTS tipo_brief  TEXT
    CHECK (tipo_brief IN ('diseno')),
  ADD COLUMN IF NOT EXISTS embedding   vector(1536);

CREATE INDEX IF NOT EXISTS sugerencias_servicio_fase_idx
  ON public.sugerencias_ia (servicio_id, fase_cagc)
  WHERE aprobado IS NULL;

CREATE INDEX IF NOT EXISTS sugerencias_tipo_brief_idx
  ON public.sugerencias_ia (tipo_brief)
  WHERE aprobado IS NULL;
