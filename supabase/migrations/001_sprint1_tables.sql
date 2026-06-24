-- ============================================================
-- ECMatic · Sprint 1 · Tablas adicionales
-- ============================================================

-- ============================================================
-- mensajes_buffer
-- Acumula fragmentos de mensajes antes del procesamiento (8s)
-- ============================================================
CREATE TABLE mensajes_buffer (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono     TEXT        NOT NULL,
  contenido    TEXT        NOT NULL,
  wa_message_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mensajes_buffer ENABLE ROW LEVEL SECURITY;

-- Solo service_role accede (webhook usa service role)
CREATE POLICY "buffer_service_role_only" ON mensajes_buffer
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX buffer_telefono_idx ON mensajes_buffer (telefono, created_at DESC);

-- ============================================================
-- tickets
-- Handoff humano — generados cuando la IA no puede continuar
-- ============================================================
CREATE TABLE tickets (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  motivo       TEXT        NOT NULL,
  estado       TEXT        NOT NULL DEFAULT 'abierto'
                           CHECK (estado IN ('abierto', 'en_atencion', 'cerrado')),
  vendedor_id  UUID        REFERENCES vendedores(id),
  resolucion   TEXT,
  sugerencia_kb JSONB,     -- sugerencia post-cierre para base de conocimiento
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets_admin_all" ON tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "tickets_vendedor_own" ON tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = tickets.vendedor_id
    )
  );

CREATE POLICY "tickets_service_role" ON tickets
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX tickets_estado_idx ON tickets (estado, created_at DESC);
CREATE INDEX tickets_lead_idx ON tickets (lead_id);

CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
