-- MPS-20 S73.2 — RPC buscar_recursos_kbi
-- Combina similitud coseno (70%) + kbi_score Bayesiano (30%).
-- Scope: faq y regla desde recursos_conocimiento.
-- Servicios tienen su propia búsqueda (buscar_servicios) — se extenderá en Sprint 74.
--
-- Invariante: cuando kbi_score = 0.5 (valor por defecto, sin señales),
-- la fórmula añade una constante uniforme → el ranking es idéntico al coseno puro.
-- El boost solo diferencia recursos una vez que el cron diario diverge los scores.

CREATE OR REPLACE FUNCTION buscar_recursos_kbi(
  query_embedding   vector(1536),
  limite            INTEGER DEFAULT 5,
  umbral            FLOAT   DEFAULT 0.60
)
RETURNS TABLE (
  id          UUID,
  tipo        TEXT,
  titulo      TEXT,
  contenido   TEXT,
  similitud   FLOAT,
  kbi_score   FLOAT,
  relevancia  FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.tipo,
    r.titulo,
    r.contenido,
    (1 - (r.embedding <=> query_embedding))::FLOAT           AS similitud,
    r.kbi_score::FLOAT                                        AS kbi_score,
    (0.70 * (1 - (r.embedding <=> query_embedding))
     + 0.30 * r.kbi_score)::FLOAT                            AS relevancia
  FROM recursos_conocimiento r
  WHERE
    r.activo   = TRUE
    AND r.aprobado = TRUE
    AND r.tipo IN ('faq', 'regla')
    AND r.embedding IS NOT NULL
    AND (1 - (r.embedding <=> query_embedding)) >= umbral
  ORDER BY relevancia DESC
  LIMIT limite;
END;
$$;

COMMENT ON FUNCTION buscar_recursos_kbi IS
  'Búsqueda semántica KBI: 70% coseno + 30% kbi_score Bayesiano. '
  'Scope: faq + regla. Servicios mantienen buscar_servicios(). '
  'umbral default 0.60 (más permisivo que 0.65 de buscar_recursos '
  'porque el boost de kbi_score reordena los resultados extra).';

-- ── Función auxiliar para el cron de scores ──────────────────────
-- Agrega señales por recurso en una sola query.
-- Usada por kbi/scores.ts en el cron diario calcularScoresBatch().
CREATE OR REPLACE FUNCTION kbi_agregar_senales()
RETURNS TABLE (
  recurso_id    UUID,
  total_usos    BIGINT,
  total_cierres BIGINT,
  ultimo_uso_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    recurso_id,
    COUNT(*) FILTER (WHERE tipo_senal = 'uso')              AS total_usos,
    COUNT(*) FILTER (WHERE tipo_senal = 'cierre')           AS total_cierres,
    MAX(created_at) FILTER (WHERE tipo_senal = 'uso')       AS ultimo_uso_at
  FROM kbi_senales
  GROUP BY recurso_id
  HAVING COUNT(*) FILTER (WHERE tipo_senal = 'uso') > 0;
$$;

COMMENT ON FUNCTION kbi_agregar_senales IS
  'Agrega señales kbi_senales por recurso. '
  'Llamada una vez por día por el cron /api/admin/kbi/calcular-scores.';

