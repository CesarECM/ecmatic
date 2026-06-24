-- Sprint Depuración — Modo depuracion: leads reales, salidas interceptadas
-- ================================================================

-- 1. Ampliar CHECK en configuracion_sistema para aceptar el nuevo modo
ALTER TABLE configuracion_sistema
  DROP CONSTRAINT IF EXISTS configuracion_sistema_modo_operacion_check;

ALTER TABLE configuracion_sistema
  ADD CONSTRAINT configuracion_sistema_modo_operacion_check
  CHECK (modo_operacion IN ('pruebas', 'depuracion', 'seguro', 'seguro_automatico', 'automatico'));

-- 2. Flag de intercepción en mensajes (WA no enviado en modo depuración)
ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS interceptado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS mensajes_interceptado_idx ON mensajes (interceptado)
  WHERE interceptado = TRUE;

-- 3. Bandeja interna de emails interceptados
CREATE TABLE IF NOT EXISTS bandeja_email_interceptado (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    UUID        REFERENCES leads(id) ON DELETE CASCADE,
  para       TEXT        NOT NULL,
  asunto     TEXT        NOT NULL,
  html       TEXT        NOT NULL,
  tipo       TEXT        NOT NULL DEFAULT 'otro'
             CHECK (tipo IN ('bienvenida', 'nurturing', 'notif_cita', 'otro')),
  leido      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bandeja_email_lead_idx ON bandeja_email_interceptado (lead_id);
CREATE INDEX IF NOT EXISTS bandeja_email_leido_idx ON bandeja_email_interceptado (leido)
  WHERE leido = FALSE;

ALTER TABLE bandeja_email_interceptado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bandeja_email_admin" ON bandeja_email_interceptado
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  );
