-- MPS-21 S81 — KBI ampliado: sugerencias de reglas_conversacionales
-- Extiende kbi_sugerencias para soportar tipo_recurso_nuevo='regla_conversacional'
-- y añade columna metadata JSONB para condiciones y tipo de regla sugerida.

-- ── 1. Ampliar CHECK de tipo_recurso_nuevo en kbi_sugerencias ────────

ALTER TABLE kbi_sugerencias
  DROP CONSTRAINT IF EXISTS kbi_sugerencias_tipo_recurso_nuevo_check;

ALTER TABLE kbi_sugerencias
  ADD CONSTRAINT kbi_sugerencias_tipo_recurso_nuevo_check
  CHECK (tipo_recurso_nuevo IN (
    'faq', 'regla', 'servicio',
    'template_wa', 'template_email', 'practica_venta', 'objecion',
    'regla_conversacional'
  ));

-- ── 2. Columna metadata para datos adicionales ────────────────────────
-- Usada por regla_conversacional para guardar: condiciones, tipo (tactica/urgencia/...)
-- Para otros tipos existentes: null o {}.

ALTER TABLE kbi_sugerencias
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN kbi_sugerencias.metadata IS
  'Datos adicionales por tipo de sugerencia. '
  'Para regla_conversacional: {"tipo": "urgencia", "condiciones": {...}}. '
  'Para otros tipos: {}.';

COMMENT ON TABLE kbi_sugerencias IS
  'Cola de mejoras KB aprobadas siempre por admin. '
  'tipo_recurso_nuevo=regla_conversacional crea en reglas_conversacionales, no en recursos_conocimiento.';
