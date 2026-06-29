-- ECMatic · Migration 069 · Ampliar RPC buscar_servicios con ficha completa para IA
-- Agrega 12 campos nuevos al retorno: estándar, modalidad, duración, entregables,
-- garantía, público objetivo, URL landing y modo_venta.

SET search_path TO public;

DROP FUNCTION IF EXISTS public.buscar_servicios(vector, integer, float);

CREATE FUNCTION public.buscar_servicios(
  query_embedding    vector(1536),
  limite             INTEGER DEFAULT 5,
  umbral             FLOAT   DEFAULT 0.65
)
RETURNS TABLE (
  id                 UUID,
  tipo               TEXT,
  titulo             TEXT,
  contenido          TEXT,
  similitud          FLOAT,
  caracteristicas    TEXT,
  beneficios         TEXT,
  ventajas           TEXT,
  para_quien_es      TEXT,
  para_quien_no_es   TEXT,
  estandar_conocer   TEXT,
  nivel_estandar     SMALLINT,
  modalidad          TEXT,
  duracion_horas     SMALLINT,
  requisitos_previos TEXT,
  entregables        TEXT[],
  garantia           TEXT,
  sector_industria   TEXT[],
  ocupacion_objetivo TEXT,
  url_landing_propia TEXT,
  slug               TEXT,
  modo_venta         TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    'servicio'::TEXT                              AS tipo,
    s.titulo,
    s.contenido,
    (1 - (s.embedding <=> query_embedding))::FLOAT AS similitud,
    s.caracteristicas,
    s.beneficios,
    s.ventajas,
    s.para_quien_es,
    s.para_quien_no_es,
    s.estandar_conocer,
    s.nivel_estandar,
    s.modalidad::TEXT,
    s.duracion_horas,
    s.requisitos_previos,
    s.entregables,
    s.garantia,
    s.sector_industria,
    s.ocupacion_objetivo,
    s.url_landing_propia,
    s.slug,
    s.modo_venta::TEXT
  FROM public.servicios s
  WHERE
    s.activo     = TRUE
    AND s.aprobado = TRUE
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) >= umbral
  ORDER BY s.embedding <=> query_embedding
  LIMIT limite;
END;
$$;
