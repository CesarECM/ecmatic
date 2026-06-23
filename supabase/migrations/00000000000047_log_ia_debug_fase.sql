-- ECMatic · Log IA · Fases de depuración
-- Extiende el CHECK de fase para permitir 'debug' y 'warn',
-- necesarios para trazar el pipeline completo post-Claude
-- (parse, cooldown, INSERT sugerencias_ia, errores de flujo).

ALTER TABLE log_ia DROP CONSTRAINT IF EXISTS log_ia_fase_check;

ALTER TABLE log_ia ADD CONSTRAINT log_ia_fase_check
  CHECK (fase IN ('llamado', 'peticion', 'respuesta', 'timeout', 'error', 'debug', 'warn'));
