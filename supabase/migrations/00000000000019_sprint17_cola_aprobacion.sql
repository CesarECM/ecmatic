-- Sprint 17.3 — Cola de aprobación de mensajes (Modo Seguro)
-- ================================================================

CREATE TABLE mensajes_cola_aprobacion (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  telefono    TEXT        NOT NULL,
  respuesta   TEXT        NOT NULL,
  bloques     JSONB       NOT NULL DEFAULT '[]',  -- array de strings para envío
  aprobado    BOOLEAN,    -- NULL = pendiente, TRUE = enviado, FALSE = rechazado
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mensajes_cola_pendientes ON mensajes_cola_aprobacion(aprobado)
  WHERE aprobado IS NULL;

ALTER TABLE mensajes_cola_aprobacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensajes_cola_admin" ON mensajes_cola_aprobacion FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
