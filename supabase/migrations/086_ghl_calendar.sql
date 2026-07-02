-- 086 — GHL Calendar integration
-- Agrega ghl_calendar_id a vendedores (para consultar disponibilidad vía GHL)
-- Agrega ghl_appointment_id a citas (para guardar el ID del appointment creado en GHL)

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS ghl_calendar_id TEXT;
ALTER TABLE citas     ADD COLUMN IF NOT EXISTS ghl_appointment_id TEXT;
