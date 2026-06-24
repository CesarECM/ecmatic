-- ============================================================
-- ECMatic · Sprint 22 · S22.4 — Ficha de servicio enriquecida
-- ============================================================

ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS caracteristicas   TEXT,
  ADD COLUMN IF NOT EXISTS beneficios        TEXT,
  ADD COLUMN IF NOT EXISTS ventajas          TEXT,
  ADD COLUMN IF NOT EXISTS para_quien_es     TEXT,
  ADD COLUMN IF NOT EXISTS para_quien_no_es  TEXT;

-- DROP necesario porque cambia el tipo de retorno (nuevas columnas)
DROP FUNCTION IF EXISTS buscar_recursos(vector, text, integer, float);

-- Recrear función buscar_recursos con campos de ficha de servicio
CREATE OR REPLACE FUNCTION buscar_recursos(
  query_embedding  vector(1536),
  tipo_filtro      TEXT DEFAULT NULL,
  limite           INTEGER DEFAULT 5,
  umbral           FLOAT DEFAULT 0.7
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
    r.id,
    r.tipo,
    r.titulo,
    r.contenido,
    1 - (r.embedding <=> query_embedding) AS similitud,
    r.caracteristicas,
    r.beneficios,
    r.ventajas,
    r.para_quien_es,
    r.para_quien_no_es
  FROM recursos_conocimiento r
  WHERE
    r.activo = TRUE
    AND r.aprobado = TRUE
    AND (tipo_filtro IS NULL OR r.tipo = tipo_filtro)
    AND 1 - (r.embedding <=> query_embedding) >= umbral
  ORDER BY r.embedding <=> query_embedding
  LIMIT limite;
END;
$$;
