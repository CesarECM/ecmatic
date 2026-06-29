-- MPS-5 S41.2: Agregar estado 'escalado' a seguimiento_lead (para cola payment)
ALTER TABLE seguimiento_lead DROP CONSTRAINT seguimiento_lead_estado_check;

ALTER TABLE seguimiento_lead
  ADD CONSTRAINT seguimiento_lead_estado_check
  CHECK (estado IN ('activo', 'completado', 'cancelado', 'escalado'));
