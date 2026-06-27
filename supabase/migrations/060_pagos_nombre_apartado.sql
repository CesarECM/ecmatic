-- ECMatic · S37.1
-- Rename servicio_pagos.descripcion → nombre (NOT NULL)
-- Add 'apartado' to tipo_pago_servicio enum

UPDATE servicio_pagos SET descripcion = 'Link de pago' WHERE descripcion IS NULL;

ALTER TABLE servicio_pagos RENAME COLUMN descripcion TO nombre;
ALTER TABLE servicio_pagos ALTER COLUMN nombre SET NOT NULL;

ALTER TYPE tipo_pago_servicio ADD VALUE IF NOT EXISTS 'apartado';
