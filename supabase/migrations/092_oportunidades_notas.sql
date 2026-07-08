-- MPS-35 S122.1 — Historial de notas por lead en el panel de oportunidades.
-- Reemplaza el campo notas_admin (texto plano) por entradas individuales
-- con soporte CRUD y contexto temporal para la IA.

CREATE TABLE oportunidades_notas (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  oportunidad_id UUID        NOT NULL REFERENCES oportunidades_panel(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contenido      TEXT        NOT NULL CHECK (char_length(contenido) > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oportunidades_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_admin_all" ON oportunidades_notas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE INDEX oportunidades_notas_oportunidad_idx ON oportunidades_notas (oportunidad_id);
CREATE INDEX oportunidades_notas_lead_idx        ON oportunidades_notas (lead_id);

CREATE TRIGGER oportunidades_notas_updated_at
  BEFORE UPDATE ON oportunidades_notas
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
