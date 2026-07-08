-- MPS-34 S119.1 — Panel de Oportunidades de Cierre
-- Almacena los 10 leads que César gestiona activamente hacia el cierre.
-- La IA puntúa, resume y sugiere acciones; César decide y reordena via DnD.

CREATE TABLE oportunidades_panel (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  posicion        INTEGER     NOT NULL DEFAULT 0,
  notas_admin     TEXT        NOT NULL DEFAULT '',
  resumen_ia      TEXT,
  siguiente_accion_ia TEXT,
  score_cierre    INTEGER     NOT NULL DEFAULT 0 CHECK (score_cierre BETWEEN 0 AND 100),
  razon_score     TEXT,
  ia_sugiere      TEXT        NOT NULL DEFAULT 'ninguna'
                              CHECK (ia_sugiere IN ('ninguna','cerrar_ganado','cerrar_perdido','upsell')),
  ia_razon        TEXT,
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  ultima_ia_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id)
);

ALTER TABLE oportunidades_panel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "op_admin_all" ON oportunidades_panel
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE INDEX op_activo_posicion_idx ON oportunidades_panel (activo, posicion);
CREATE INDEX op_lead_id_idx ON oportunidades_panel (lead_id);

CREATE TRIGGER oportunidades_panel_updated_at
  BEFORE UPDATE ON oportunidades_panel
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
