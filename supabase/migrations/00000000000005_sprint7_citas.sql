-- ============================================================
-- ECMatic · Sprint 7 · Agendamiento, Vendedores y Google Meet
-- ============================================================

-- ── citas ────────────────────────────────────────────────────
CREATE TABLE citas (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id                   UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  vendedor_id               UUID        REFERENCES vendedores(id) ON DELETE SET NULL,
  fecha_inicio              TIMESTAMPTZ NOT NULL,
  fecha_fin                 TIMESTAMPTZ NOT NULL,
  estado                    TEXT        NOT NULL DEFAULT 'pendiente'
                                        CHECK (estado IN ('pendiente','confirmada','show','noshow','cancelada')),
  google_event_id           TEXT,
  google_meet_link          TEXT,
  notas_previas             TEXT,
  notas_vendedor            TEXT,
  resultado                 TEXT        CHECK (resultado IN ('show','noshow','seguimiento')),
  compromisos               TEXT,
  recordatorio_24h          BOOLEAN     NOT NULL DEFAULT FALSE,
  recordatorio_2h           BOOLEAN     NOT NULL DEFAULT FALSE,
  recordatorio_vendedor_30m BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX citas_lead_idx     ON citas (lead_id);
CREATE INDEX citas_vendedor_idx ON citas (vendedor_id);
CREATE INDEX citas_fecha_idx    ON citas (fecha_inicio, estado);

ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "citas_admin_all" ON citas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "citas_vendedor_own" ON citas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = citas.vendedor_id
    )
  );

CREATE POLICY "citas_vendedor_update" ON citas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = citas.vendedor_id
    )
  );

CREATE TRIGGER citas_updated_at BEFORE UPDATE ON citas
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── vendedor_tokens (Google OAuth) ───────────────────────────
CREATE TABLE vendedor_tokens (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id   UUID        NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE UNIQUE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendedor_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_tokens_admin" ON vendedor_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "vendedor_tokens_own" ON vendedor_tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = vendedor_tokens.vendedor_id
    )
  );

CREATE TRIGGER vendedor_tokens_updated_at BEFORE UPDATE ON vendedor_tokens
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── transcriptos_meet ────────────────────────────────────────
CREATE TABLE transcriptos_meet (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cita_id               UUID        REFERENCES citas(id) ON DELETE SET NULL,
  lead_id               UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contenido             TEXT        NOT NULL,
  objeciones_detectadas JSONB       NOT NULL DEFAULT '[]',
  compromisos_detectados JSONB      NOT NULL DEFAULT '[]',
  temperatura_cierre    TEXT        CHECK (temperatura_cierre IN ('fria','tibia','caliente')),
  analisis_completo     JSONB,
  procesado_por_ia      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transcriptos_lead_idx ON transcriptos_meet (lead_id);
CREATE INDEX transcriptos_cita_idx ON transcriptos_meet (cita_id) WHERE cita_id IS NOT NULL;

ALTER TABLE transcriptos_meet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcriptos_admin_all" ON transcriptos_meet
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "transcriptos_vendedor_read" ON transcriptos_meet
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM citas c
      JOIN vendedores v ON v.id = c.vendedor_id
      WHERE c.id = transcriptos_meet.cita_id AND v.profile_id = auth.uid()
    )
  );
