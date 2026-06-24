-- log_agendamiento: traza de depuración del flujo de agendamiento con Google Calendar
-- Cubre: slots consultados → token refresh → Calendar API → Meet link → notificaciones WA/email

CREATE TABLE IF NOT EXISTS log_agendamiento (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id      UUID        REFERENCES citas(id) ON DELETE SET NULL,
  lead_id      UUID        REFERENCES leads(id) ON DELETE SET NULL,
  vendedor_id  UUID        REFERENCES vendedores(id) ON DELETE SET NULL,
  paso         TEXT        NOT NULL,
  nivel        TEXT        NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'warn', 'error')),
  detalle      TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS log_agendamiento_cita_idx       ON log_agendamiento(cita_id);
CREATE INDEX IF NOT EXISTS log_agendamiento_lead_idx       ON log_agendamiento(lead_id);
CREATE INDEX IF NOT EXISTS log_agendamiento_created_at_idx ON log_agendamiento(created_at DESC);

ALTER TABLE log_agendamiento ENABLE ROW LEVEL SECURITY;

-- Solo el service role puede leer/escribir (no hay acceso desde el cliente)
CREATE POLICY "service_role_full" ON log_agendamiento FOR ALL USING (true);
