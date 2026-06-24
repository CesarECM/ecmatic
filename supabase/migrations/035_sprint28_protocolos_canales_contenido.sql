-- ============================================================
-- ECMatic · Sprint 28 · Protocolos, Canales y Contenido por Etapa
-- S28.1 / S28.3 / S28.5 / S28.4
-- ============================================================

-- ── Agregar metadata a lead_pipelines para culminación (S28.7) ─
ALTER TABLE lead_pipelines
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ── etapa_protocolo (S28.1) ───────────────────────────────────
-- Reglas de transición por etapa: avance, retroceso, espera.
-- origen: 'ia-propuesto' (viene de cola de aprobación) o 'manual' (César lo definió directo).
-- historial: log inmutable de cada versión anterior con autor + timestamp.
CREATE TABLE etapa_protocolo (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  etapa_id        UUID        NOT NULL REFERENCES pipeline_etapas(id) ON DELETE CASCADE,
  tipo            TEXT        NOT NULL DEFAULT 'ia-propuesto'
                              CHECK (tipo IN ('ia-propuesto', 'manual')),
  regla_avance    TEXT,
  regla_retroceso TEXT,
  regla_espera    TEXT,
  historial       JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (etapa_id)
);

ALTER TABLE etapa_protocolo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapa_protocolo_read_authenticated" ON etapa_protocolo
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "etapa_protocolo_write_admin" ON etapa_protocolo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER etapa_protocolo_updated_at BEFORE UPDATE ON etapa_protocolo
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── etapa_canales (S28.3) ─────────────────────────────────────
-- Canales habilitados por etapa: whatsapp, email, llamada, meet.
CREATE TABLE etapa_canales (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  etapa_id    UUID        NOT NULL REFERENCES pipeline_etapas(id) ON DELETE CASCADE,
  canal       TEXT        NOT NULL
              CHECK (canal IN ('whatsapp', 'email', 'llamada', 'meet')),
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (etapa_id, canal)
);

ALTER TABLE etapa_canales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapa_canales_read_authenticated" ON etapa_canales
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "etapa_canales_write_admin" ON etapa_canales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- Canales por defecto: todas las etapas de ambas rutas arrancan con WA + email.
INSERT INTO etapa_canales (etapa_id, canal)
SELECT id, unnest(ARRAY['whatsapp','email'])
FROM pipeline_etapas;

-- ── etapa_contenido (S28.5) ───────────────────────────────────
-- Brochures y leadmagnets asignados a cada etapa.
-- es_puente=true: el recurso pertenece a una etapa posterior y se usa aquí como acelerador de avance.
-- etapa_origen_id: etapa a la que pertenece originalmente cuando es_puente=true.
CREATE TABLE etapa_contenido (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  etapa_id        UUID        NOT NULL REFERENCES pipeline_etapas(id) ON DELETE CASCADE,
  recurso_tipo    TEXT        NOT NULL CHECK (recurso_tipo IN ('leadmagnet', 'brochure')),
  recurso_id      UUID        NOT NULL,
  es_puente       BOOLEAN     NOT NULL DEFAULT FALSE,
  etapa_origen_id UUID        REFERENCES pipeline_etapas(id),
  orden           INTEGER     NOT NULL DEFAULT 0,
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (etapa_id, recurso_tipo, recurso_id)
);

ALTER TABLE etapa_contenido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapa_contenido_read_authenticated" ON etapa_contenido
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "etapa_contenido_write_admin" ON etapa_contenido
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- ── llamadas_vendedor (S28.4) ─────────────────────────────────
-- Registro manual de llamadas telefónicas con objetivo y resultado.
CREATE TABLE llamadas_vendedor (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  vendedor_id UUID        NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  objetivo    TEXT        NOT NULL CHECK (objetivo IN ('cierre', 'avance')),
  resultado   TEXT        CHECK (resultado IN ('exitoso', 'no-contesta', 'seguimiento', 'perdido')),
  notas       TEXT,
  duracion_min INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE llamadas_vendedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llamadas_admin_all" ON llamadas_vendedor
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "llamadas_vendedor_own" ON llamadas_vendedor
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.profile_id = auth.uid() AND v.id = llamadas_vendedor.vendedor_id
    )
  );

CREATE INDEX llamadas_lead_idx     ON llamadas_vendedor (lead_id);
CREATE INDEX llamadas_vendedor_idx ON llamadas_vendedor (vendedor_id);
