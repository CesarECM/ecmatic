-- Sprint 17.5 — Tarea de fondo activa por lead
-- ================================================================
-- Exactamente 1 tarea activa por lead (enforced por UNIQUE lead_id).
-- Upsert reemplaza la tarea anterior; DELETE la cierra.

CREATE TABLE lead_tarea_activa (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL
              CHECK (tipo IN ('limpieza', 'informacion', 'nutricion', 'seguimiento', 'cierre')),
  motivo      TEXT,       -- contexto para IA/admin; por qué fue asignada
  asignada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vence_at    TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- constraint central: exactamente 1 tarea activa por lead
  CONSTRAINT una_tarea_por_lead UNIQUE (lead_id)
);

CREATE INDEX lead_tarea_tipo_idx ON lead_tarea_activa (tipo);
CREATE INDEX lead_tarea_vence_idx ON lead_tarea_activa (vence_at) WHERE vence_at IS NOT NULL;

ALTER TABLE lead_tarea_activa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarea_activa_admin" ON lead_tarea_activa FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "tarea_activa_service" ON lead_tarea_activa FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER lead_tarea_activa_updated_at
  BEFORE UPDATE ON lead_tarea_activa
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
