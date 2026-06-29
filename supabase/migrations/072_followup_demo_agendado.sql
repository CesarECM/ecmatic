-- MPS-12 S47: Agregar tipo demo_agendado al motor de seguimiento.
-- Leads que confirmaron demo pero aún no han pagado reciben mensajes
-- preguntando por el resultado de la reunión, no exigiendo comprobante.

-- 1. Extender constraint de tipo en seguimiento_lead
ALTER TABLE seguimiento_lead DROP CONSTRAINT seguimiento_lead_tipo_check;
ALTER TABLE seguimiento_lead
  ADD CONSTRAINT seguimiento_lead_tipo_check
  CHECK (tipo IN ('nurturing', 'conversational', 'payment', 'demo_agendado'));

-- 2. Extender constraint de tipo en followup_config
ALTER TABLE followup_config DROP CONSTRAINT IF EXISTS followup_config_tipo_check;
ALTER TABLE followup_config
  ADD CONSTRAINT followup_config_tipo_check
  CHECK (tipo IN ('nurturing', 'conversational', 'payment', 'demo_agendado'));

-- 3. Config de backoff: primer intento 2h, espaciado moderado, 3 intentos máx.
--    Después del intento 3 sin respuesta → escalado (notificación a César).
INSERT INTO followup_config (tipo, base_hours, growth, cap_hours, max_intentos, window_start, window_end, search_hours)
VALUES ('demo_agendado', 2, 1.5, 48, 3, 9, 22, 12)
ON CONFLICT (tipo) DO NOTHING;

-- 4. Extender constraint de followup_type en global_timing_prior
--    (columna con CHECK inline — nombre auto-generado por PG)
ALTER TABLE global_timing_prior DROP CONSTRAINT IF EXISTS global_timing_prior_followup_type_check;
ALTER TABLE global_timing_prior
  ADD CONSTRAINT global_timing_prior_followup_type_check
  CHECK (followup_type IN ('nurturing', 'conversational', 'payment', 'demo_agendado'));

-- 5. Seed prior global: copia el patrón horario de conversational como punto de partida.
--    El posterior por-lead divergirá a medida que se acumulen datos reales.
INSERT INTO global_timing_prior (day_of_week, hour_of_day, alpha, beta, followup_type)
SELECT day_of_week, hour_of_day, alpha, beta, 'demo_agendado'
FROM global_timing_prior
WHERE followup_type = 'conversational'
ON CONFLICT DO NOTHING;
