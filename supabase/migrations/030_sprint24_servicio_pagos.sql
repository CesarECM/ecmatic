-- ============================================================
-- ECMatic · Sprint 24 · S24.1 — Tabla servicio_pagos
-- ============================================================

CREATE TYPE tipo_pago_servicio AS ENUM ('landing', 'pasarela');

CREATE TABLE servicio_pagos (
  id          UUID               DEFAULT gen_random_uuid() PRIMARY KEY,
  recurso_id  UUID               NOT NULL REFERENCES recursos_conocimiento (id) ON DELETE CASCADE,
  tipo        tipo_pago_servicio NOT NULL,
  url         TEXT               NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN            NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX servicio_pagos_recurso_idx ON servicio_pagos (recurso_id);
CREATE INDEX servicio_pagos_activo_idx  ON servicio_pagos (activo);

ALTER TABLE servicio_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "servicio_pagos_read_authenticated" ON servicio_pagos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "servicio_pagos_write_admin" ON servicio_pagos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "servicio_pagos_service_role" ON servicio_pagos
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER servicio_pagos_updated_at BEFORE UPDATE ON servicio_pagos
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
