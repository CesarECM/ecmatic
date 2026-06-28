-- Racha de aprobaciones consecutivas para progresión de niveles de confianza.
-- Se incrementa en +1 con cada "aprobado" y vuelve a 0 con cada "editado".
-- El historial total (aprobados, tasa_limpia) se preserva para métricas de calidad.

ALTER TABLE ghl_approval_stats
  ADD COLUMN aprobados_consecutivos INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ghl_approval_stats.aprobados_consecutivos
  IS 'Racha actual: mensajes aprobados sin interrupciones. Se resetea a 0 cuando hay una edición.';

-- Limpiar el estado de pruebas: partir de 0
UPDATE ghl_approval_stats SET aprobados_consecutivos = 0;
