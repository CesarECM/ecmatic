-- Log unificado del sistema: reemplaza log_ia como destino de todos los tipos de evento.
-- /admin/log muestra esta tabla; /admin/log-ia queda como historial estático en DB.

CREATE TABLE IF NOT EXISTS log_sistema (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  categoria   TEXT        NOT NULL
              CHECK (categoria IN ('ia', 'cron', 'webhook', 'servicio', 'ui', 'auth')),
  tipo_accion TEXT        NOT NULL,
  fase        TEXT
              CHECK (fase IN ('inicio','ok','error','warn','debug','llamado','peticion','respuesta','timeout')),
  trace_id    TEXT,
  lead_id     UUID        REFERENCES leads(id) ON DELETE SET NULL,
  resultado   TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_log_sistema_created_at
  ON log_sistema (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_sistema_categoria
  ON log_sistema (categoria, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_sistema_trace_id
  ON log_sistema (trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_log_sistema_lead_id
  ON log_sistema (lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE log_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "log_sistema_admin" ON log_sistema
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  );
