-- MPS-15 S55.1: Agrega historial_limite a followup_config.
-- Define cuántos mensajes recientes del lead se inyectan como contexto
-- al generar el copy del follow-up. Diferenciado por tipo de cola.

ALTER TABLE followup_config
  ADD COLUMN historial_limite INT NOT NULL DEFAULT 10;

UPDATE followup_config SET historial_limite = 5  WHERE tipo = 'nurturing';
UPDATE followup_config SET historial_limite = 10 WHERE tipo = 'conversational';
UPDATE followup_config SET historial_limite = 15 WHERE tipo = 'payment';
UPDATE followup_config SET historial_limite = 10 WHERE tipo = 'demo_agendado';
