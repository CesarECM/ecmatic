-- Sprint 54 — Búsqueda semántica de leads con pgvector
-- Añade embedding vector(1536) a leads y función RPC buscar_leads.
-- El embedding se genera desde: nombre + pipeline_stage + canal_origen + contexto + metadata B2B.
-- Usa el mismo operador coseno (<=> ) que ya usan servicios y conocimiento.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS embedding          vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_hash     TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

-- Índice HNSW para búsqueda coseno eficiente (mismo tipo que los otros índices del proyecto)
CREATE INDEX IF NOT EXISTS leads_embedding_cosine_idx
  ON public.leads USING hnsw (embedding vector_cosine_ops);

-- RPC de búsqueda semántica de leads
DROP FUNCTION IF EXISTS public.buscar_leads(vector, integer, float);
CREATE FUNCTION public.buscar_leads(
  query_embedding  vector(1536),
  limite           INTEGER DEFAULT 10,
  umbral           FLOAT   DEFAULT 0.30
)
RETURNS TABLE (
  id             UUID,
  nombre         TEXT,
  telefono       TEXT,
  email          TEXT,
  pipeline_stage TEXT,
  pipeline_ruta  TEXT,
  canal_origen   TEXT,
  vendedor_id    UUID,
  score_salud    FLOAT,
  activo         BOOLEAN,
  archivado      BOOLEAN,
  similitud      FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.nombre,
    l.telefono,
    l.email,
    l.pipeline_stage,
    l.pipeline_ruta::TEXT,
    l.canal_origen,
    l.vendedor_id,
    l.score_salud::FLOAT,
    l.activo,
    l.archivado,
    (1 - (l.embedding <=> query_embedding))::FLOAT AS similitud
  FROM public.leads l
  WHERE
    l.embedding IS NOT NULL
    AND 1 - (l.embedding <=> query_embedding) >= umbral
  ORDER BY l.embedding <=> query_embedding
  LIMIT limite;
END;
$$;
