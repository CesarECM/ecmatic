-- 098_v2_kbx_similarity.sql
-- Función pgvector para detectar pares de KB items semánticamente similares (S150.4)
-- Complejidad O(n²) — aceptable con <1 000 items en KB.

BEGIN;

CREATE OR REPLACE FUNCTION v2_kb_duplicados(umbral float DEFAULT 0.90)
RETURNS TABLE (id_a uuid, id_b uuid, similitud float)
LANGUAGE sql STABLE AS $$
  SELECT
    a.id  AS id_a,
    b.id  AS id_b,
    ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4)::float AS similitud
  FROM v2_kb_items a
  JOIN v2_kb_items b ON a.id < b.id
  WHERE a.estado = 'aprobado' AND a.embedding IS NOT NULL
    AND b.estado = 'aprobado' AND b.embedding IS NOT NULL
    AND 1 - (a.embedding <=> b.embedding) > umbral
  ORDER BY similitud DESC;
$$;

COMMIT;
