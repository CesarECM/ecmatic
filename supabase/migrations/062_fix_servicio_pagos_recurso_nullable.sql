-- ECMatic · Fix: recurso_id en servicio_pagos ya no es requerido.
-- Sprint 36 introdujo servicio_id como reemplazo, pero recurso_id quedó
-- con NOT NULL. Los servicios nuevos no tienen entrada en recursos_conocimiento
-- por lo que el insert falla con constraint violation.

ALTER TABLE public.servicio_pagos
  ALTER COLUMN recurso_id DROP NOT NULL;
