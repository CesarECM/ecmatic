-- ============================================================
-- ECMatic · Sprint 19.4 · Pipelines como ramas no-lineales
-- ============================================================
-- es_tronco   : la etapa pertenece al recorrido base compartido por todos los leads
-- etapas_siguientes : lista explícita de etapas destino posibles (no-lineal)
-- ------------------------------------------------------------

ALTER TABLE pipeline_etapas
  ADD COLUMN IF NOT EXISTS es_tronco          BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS etapas_siguientes  TEXT[]   NOT NULL DEFAULT '{}';

-- ── Tronco común tripwire ─────────────────────────────────────
-- Las dos primeras etapas son universales; el resto es rama

UPDATE pipeline_etapas
  SET es_tronco = TRUE, etapas_siguientes = ARRAY['Contactado']
  WHERE nombre = 'Nuevo' AND ruta = 'tripwire';

UPDATE pipeline_etapas
  SET es_tronco = TRUE, etapas_siguientes = ARRAY['Interesado', 'Perdido']
  WHERE nombre = 'Contactado' AND ruta = 'tripwire';

-- ── Ramas tripwire ────────────────────────────────────────────
-- Desde Interesado: ruta normal (Propuesta) o cierre rápido (Comprado) si F8-9

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Propuesta', 'Comprado', 'Perdido']
  WHERE nombre = 'Interesado' AND ruta = 'tripwire';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Negociación', 'Comprado', 'Perdido']
  WHERE nombre = 'Propuesta' AND ruta = 'tripwire';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Comprado', 'Perdido']
  WHERE nombre = 'Negociación' AND ruta = 'tripwire';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Certificado']
  WHERE nombre = 'Comprado' AND ruta = 'tripwire';

-- ── Tronco común premium ──────────────────────────────────────

UPDATE pipeline_etapas
  SET es_tronco = TRUE, etapas_siguientes = ARRAY['Primer contacto']
  WHERE nombre = 'Nuevo' AND ruta = 'premium';

UPDATE pipeline_etapas
  SET es_tronco = TRUE, etapas_siguientes = ARRAY['Diagnóstico']
  WHERE nombre = 'Primer contacto' AND ruta = 'premium';

-- ── Ramas premium ─────────────────────────────────────────────
-- Desde Diagnóstico: ruta larga (Propuesta→Seguimiento→Decisión)
-- o acortada (→Decisión directo) si lead ya está en fase 8-9

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Propuesta', 'Decisión', 'Perdido']
  WHERE nombre = 'Diagnóstico' AND ruta = 'premium';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Seguimiento', 'Decisión', 'Perdido']
  WHERE nombre = 'Propuesta' AND ruta = 'premium';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Decisión', 'Perdido']
  WHERE nombre = 'Seguimiento' AND ruta = 'premium';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Comprado', 'Perdido']
  WHERE nombre = 'Decisión' AND ruta = 'premium';

UPDATE pipeline_etapas
  SET etapas_siguientes = ARRAY['Certificado']
  WHERE nombre = 'Comprado' AND ruta = 'premium';

-- ── Índice para búsqueda de ramas ─────────────────────────────
CREATE INDEX IF NOT EXISTS pipeline_etapas_siguientes_gin
  ON pipeline_etapas USING GIN (etapas_siguientes);

CREATE INDEX IF NOT EXISTS pipeline_etapas_tronco_idx
  ON pipeline_etapas (ruta, es_tronco) WHERE activo = TRUE;
