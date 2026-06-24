-- ============================================================
-- ECMatic · Sprint 5 · Matriz nD, Avatares y Personalización
-- ============================================================

-- ── S5.1: matriz_nd ─────────────────────────────────────────
-- dimensiones: {temperamento, objecion, servicio, tipo_cliente,
--               canal_origen, etapa_atasco, temperatura}
CREATE TABLE matriz_nd (
  id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  dimensiones         JSONB         NOT NULL DEFAULT '{}',
  respuesta_sugerida  TEXT          NOT NULL,
  score_efectividad   DECIMAL(3,2)  NOT NULL DEFAULT 0.5
                                    CHECK (score_efectividad BETWEEN 0 AND 1),
  usos                INTEGER       NOT NULL DEFAULT 0,
  cierres             INTEGER       NOT NULL DEFAULT 0,
  aprobado            BOOLEAN       NOT NULL DEFAULT FALSE,
  origen              TEXT          NOT NULL DEFAULT 'ia_sugerido'
                                    CHECK (origen IN ('manual', 'ia_sugerido', 'automatico')),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX matriz_nd_dimensiones_gin ON matriz_nd USING GIN (dimensiones);
CREATE INDEX matriz_nd_score_idx ON matriz_nd (score_efectividad DESC) WHERE aprobado = TRUE;

ALTER TABLE matriz_nd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matriz_read_authenticated" ON matriz_nd
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "matriz_write_admin" ON matriz_nd
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER matriz_nd_updated_at BEFORE UPDATE ON matriz_nd
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── S5.8: competidores ───────────────────────────────────────
CREATE TABLE competidores (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre          TEXT        NOT NULL UNIQUE,
  menciones       INTEGER     NOT NULL DEFAULT 0,
  ultima_mencion  TIMESTAMPTZ,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE competidores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competidores_read_authenticated" ON competidores
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "competidores_write_admin" ON competidores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER competidores_updated_at BEFORE UPDATE ON competidores
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── S5.9: momentos_cierre ────────────────────────────────────
CREATE TABLE momentos_cierre (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mensaje_id      UUID        REFERENCES mensajes(id) ON DELETE SET NULL,
  objecion_tipo   TEXT,
  descripcion     TEXT        NOT NULL,
  se_cerro        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX momentos_cierre_lead_idx ON momentos_cierre (lead_id);
CREATE INDEX momentos_cierre_objecion_idx ON momentos_cierre (objecion_tipo)
  WHERE objecion_tipo IS NOT NULL;

ALTER TABLE momentos_cierre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "momentos_admin_all" ON momentos_cierre
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- ── S5.10: promesas_conversacion ─────────────────────────────
CREATE TABLE promesas_conversacion (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mensaje_id      UUID        REFERENCES mensajes(id) ON DELETE SET NULL,
  actor           TEXT        NOT NULL CHECK (actor IN ('vendedor', 'lead', 'ia')),
  promesa         TEXT        NOT NULL,
  fecha_prometida TIMESTAMPTZ,
  cumplida        BOOLEAN,
  alerta_enviada  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX promesas_lead_idx ON promesas_conversacion (lead_id);
CREATE INDEX promesas_vencidas_idx ON promesas_conversacion (fecha_prometida)
  WHERE cumplida IS NULL AND fecha_prometida IS NOT NULL;

ALTER TABLE promesas_conversacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promesas_admin_all" ON promesas_conversacion
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "promesas_vendedor_read" ON promesas_conversacion
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN vendedores v ON v.id = l.vendedor_id
      WHERE l.id = promesas_conversacion.lead_id AND v.profile_id = auth.uid()
    )
  );

CREATE TRIGGER promesas_updated_at BEFORE UPDATE ON promesas_conversacion
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
