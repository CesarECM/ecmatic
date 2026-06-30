-- MPS-16 S60: contextos_aplica en recursos_conocimiento para prácticas de venta.
-- Permite filtrar qué práctica sirve según temperamento y etapa del lead.
-- Estructura: { "temperamento": ["D", "I"], "pipeline_stage": ["Propuesta"] }
-- NULL = práctica universal (aplica a todos los contextos).

ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS contextos_aplica JSONB;

COMMENT ON COLUMN recursos_conocimiento.contextos_aplica IS
  'Solo para tipo=practica_venta. JSON con arrays de temperamento y/o pipeline_stage donde aplica. NULL = universal.';
