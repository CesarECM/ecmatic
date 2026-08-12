-- 097_v2_kb_search.sql
-- Índice IVFFlat + RPC para búsqueda semántica en v2_kb_items (S150.2)
-- lists=10 adecuado para <1 000 filas; aumentar a 100 cuando supere 10 000.

BEGIN;

CREATE INDEX v2_kb_embedding_idx ON v2_kb_items
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10)
  WHERE estado = 'aprobado' AND embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION buscar_v2_kb_items(
  query_embedding vector(1536),
  limite          int     DEFAULT 8,
  umbral          float   DEFAULT 0.50
)
RETURNS TABLE (
  id              uuid,
  tipo            text,
  contenido       text,
  score_confianza decimal
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    tipo,
    contenido,
    score_confianza
  FROM v2_kb_items
  WHERE
    estado    = 'aprobado'
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= umbral
  ORDER BY embedding <=> query_embedding
  LIMIT limite;
$$;

COMMIT;
