-- GHL-9: tabla de seguimientos automáticos (pago pendiente + silencio de conversación)

CREATE TABLE seguimiento_lead (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('pago_pendiente', 'silencio_ghl', 'silencio_funnel')),
  ghl_contact_id    TEXT,       -- ID de contacto en GHL (NULL hasta resolver para leads orgánicos)
  conv_id           TEXT,       -- ID de conversación GHL activa
  campana           TEXT,       -- ej. 'sbc_jun26' — para correlacionar con ghl_campana_logs
  estado            TEXT        NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'completado', 'cancelado')),
  nivel             INT         NOT NULL DEFAULT 0,
                                -- 0=pendiente inicial  1=primer recordatorio
                                -- 2=empático (mañana)  3=social proof (solo pago_pendiente)
  proximo_at        TIMESTAMPTZ NOT NULL,
  horario_prometido TIMESTAMPTZ,  -- hora que el lead prometió pagar (solo pago_pendiente)
  gatillo_snapshot  TEXT,         -- valor del gatillo activo al crear el registro (para urgencia)
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo un seguimiento activo por lead a la vez
CREATE UNIQUE INDEX idx_seguimiento_lead_activo
  ON seguimiento_lead(lead_id) WHERE estado = 'activo';

-- Índice principal del cron: obtener vencidos activos
CREATE INDEX idx_seguimiento_lead_cron
  ON seguimiento_lead(proximo_at, estado)
  WHERE estado = 'activo';

CREATE INDEX idx_seguimiento_lead_lead
  ON seguimiento_lead(lead_id);

ALTER TABLE seguimiento_lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_seguimiento_lead"
  ON seguimiento_lead FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE OR REPLACE FUNCTION update_seguimiento_lead_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seguimiento_lead_updated_at
  BEFORE UPDATE ON seguimiento_lead
  FOR EACH ROW EXECUTE FUNCTION update_seguimiento_lead_updated_at();
