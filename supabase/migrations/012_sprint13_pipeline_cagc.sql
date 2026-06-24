-- ============================================================
-- ECMatic · Sprint 13.4 · Pipelines remapeados sobre CAGC
-- ============================================================

-- ── Agregar columna fases_cagc a pipeline_etapas ─────────────
-- Almacena los números de fase CAGC (0-16) que corresponden
-- a esta etapa del pipeline. Permite cross-pipeline visibility.
ALTER TABLE pipeline_etapas
  ADD COLUMN IF NOT EXISTS fases_cagc JSONB NOT NULL DEFAULT '[]';

-- ── Remapeo tripwire ($1,799) ─────────────────────────────────
-- Lead llega como prospecto frío y avanza hasta certificarse

UPDATE pipeline_etapas SET fases_cagc = '[1,2,3]'
  WHERE nombre = 'Nuevo'        AND ruta = 'tripwire';
-- Activación (1) · Definición del problema (2) · Exploración inicial (3)

UPDATE pipeline_etapas SET fases_cagc = '[3,4]'
  WHERE nombre = 'Contactado'   AND ruta = 'tripwire';
-- Exploración inicial (3) · Consciencia de soluciones (4)

UPDATE pipeline_etapas SET fases_cagc = '[4,5,6]'
  WHERE nombre = 'Interesado'   AND ruta = 'tripwire';
-- Consciencia de soluciones (4) · Construcción de criterios (5) · Evaluación de opciones (6)

UPDATE pipeline_etapas SET fases_cagc = '[6,7]'
  WHERE nombre = 'Propuesta'    AND ruta = 'tripwire';
-- Evaluación de opciones (6) · Validación social (7)

UPDATE pipeline_etapas SET fases_cagc = '[7,8]'
  WHERE nombre = 'Negociación'  AND ruta = 'tripwire';
-- Validación social (7) · Ansiedad pre-decisión (8)

UPDATE pipeline_etapas SET fases_cagc = '[9,10]'
  WHERE nombre = 'Comprado'     AND ruta = 'tripwire';
-- Decisión de compra (9) · Acto de compra (10)

UPDATE pipeline_etapas SET fases_cagc = '[]'
  WHERE nombre = 'Perdido'      AND ruta = 'tripwire';
-- Sin fase fija: el lead abandonó en cualquier punto del recorrido

UPDATE pipeline_etapas SET fases_cagc = '[12,13,14,15]'
  WHERE nombre = 'Certificado'  AND ruta = 'tripwire';
-- Evaluación de experiencia (12) · Satisfacción (13) · Retención (14) · Lealtad (15)

-- ── Remapeo premium ($10,000+) ────────────────────────────────
-- Ciclo más largo: diagnóstico profundo, propuesta, decisión consultiva

UPDATE pipeline_etapas SET fases_cagc = '[1,2,3]'
  WHERE nombre = 'Nuevo'           AND ruta = 'premium';

UPDATE pipeline_etapas SET fases_cagc = '[2,3,4]'
  WHERE nombre = 'Primer contacto' AND ruta = 'premium';
-- Definición del problema (2) · Exploración inicial (3) · Consciencia de soluciones (4)

UPDATE pipeline_etapas SET fases_cagc = '[3,4,5]'
  WHERE nombre = 'Diagnóstico'     AND ruta = 'premium';
-- Exploración inicial (3) · Consciencia de soluciones (4) · Construcción de criterios (5)

UPDATE pipeline_etapas SET fases_cagc = '[5,6,7]'
  WHERE nombre = 'Propuesta'       AND ruta = 'premium';
-- Construcción de criterios (5) · Evaluación de opciones (6) · Validación social (7)

UPDATE pipeline_etapas SET fases_cagc = '[7,8]'
  WHERE nombre = 'Seguimiento'     AND ruta = 'premium';
-- Validación social (7) · Ansiedad pre-decisión (8)

UPDATE pipeline_etapas SET fases_cagc = '[8,9]'
  WHERE nombre = 'Decisión'        AND ruta = 'premium';
-- Ansiedad pre-decisión (8) · Decisión de compra (9)

UPDATE pipeline_etapas SET fases_cagc = '[9,10]'
  WHERE nombre = 'Comprado'        AND ruta = 'premium';

UPDATE pipeline_etapas SET fases_cagc = '[]'
  WHERE nombre = 'Perdido'         AND ruta = 'premium';

UPDATE pipeline_etapas SET fases_cagc = '[12,13,14,15]'
  WHERE nombre = 'Certificado'     AND ruta = 'premium';

-- ── Índice para búsqueda por fase CAGC ───────────────────────
-- Permite: "dame todas las etapas que contienen la fase 8"
CREATE INDEX IF NOT EXISTS pipeline_etapas_fases_cagc_gin
  ON pipeline_etapas USING GIN (fases_cagc);
