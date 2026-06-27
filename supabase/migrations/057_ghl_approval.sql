-- Sprint GHL-5: cola de aprobación progresiva para mensajes GHL SBC

-- Cola de mensajes pendientes de revisión humana
CREATE TABLE ghl_approval_queue (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campana                 TEXT        NOT NULL DEFAULT 'sbc_jun26',
  ghl_contact_id          TEXT        NOT NULL,
  conv_id                 TEXT        NOT NULL,
  lead_ecmatic_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  nombre                  TEXT,
  mensaje_lead            TEXT        NOT NULL,
  mensaje_ia              TEXT        NOT NULL,
  mensaje_final           TEXT,
  razon_edicion           TEXT,
  contexto                JSONB,
  estado                  TEXT        NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','aprobado','editado','rechazado')),
  score_ia                FLOAT       CHECK (score_ia BETWEEN 0 AND 1),
  razon_score             TEXT,
  conteo_notificaciones   INT         NOT NULL DEFAULT 0,
  ultima_notificacion_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_at             TIMESTAMPTZ,
  enviado_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ghl_approval_estado      ON ghl_approval_queue (estado);
CREATE INDEX idx_ghl_approval_lead        ON ghl_approval_queue (lead_ecmatic_id);
CREATE INDEX idx_ghl_approval_contact     ON ghl_approval_queue (ghl_contact_id);
CREATE INDEX idx_ghl_approval_created     ON ghl_approval_queue (created_at);
CREATE INDEX idx_ghl_approval_campana     ON ghl_approval_queue (campana, estado);

ALTER TABLE ghl_approval_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ghl_approval_queue"
  ON ghl_approval_queue FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE OR REPLACE FUNCTION update_ghl_approval_queue_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ghl_approval_queue_updated_at
  BEFORE UPDATE ON ghl_approval_queue
  FOR EACH ROW EXECUTE FUNCTION update_ghl_approval_queue_updated_at();

-- Estadísticas globales por campaña para decidir automatización
CREATE TABLE ghl_approval_stats (
  campana_key   TEXT        PRIMARY KEY,
  total         INT         NOT NULL DEFAULT 0,
  aprobados     INT         NOT NULL DEFAULT 0,
  editados      INT         NOT NULL DEFAULT 0,
  rechazados    INT         NOT NULL DEFAULT 0,
  tasa_limpia   FLOAT       GENERATED ALWAYS AS (
    CASE WHEN total > 0 THEN aprobados::float / total ELSE 0 END
  ) STORED,
  automatizado  BOOLEAN     NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ghl_approval_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ghl_approval_stats"
  ON ghl_approval_stats FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- Fila inicial para la campaña activa
INSERT INTO ghl_approval_stats (campana_key) VALUES ('sbc_jun26');
