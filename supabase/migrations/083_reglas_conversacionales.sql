-- MPS-21 S77 — Sistema KB Unificado con Reglas Conversacionales
-- Tabla: reglas_conversacionales (reemplaza lógica de matriz_nd)
-- Columnas leads: ghl_contact_id, tags_ghl, tags_ghl_at
-- Deprecaciones: matriz_nd.deprecada, etiquetas.deprecada

-- ── 1. Tabla reglas_conversacionales ─────────────────────────────

CREATE TABLE reglas_conversacionales (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT         NOT NULL,
  descripcion  TEXT,
  tipo         TEXT         NOT NULL
               CHECK (tipo IN ('tactica', 'urgencia', 'restriccion', 'producto', 'rebate')),
  condiciones  JSONB        NOT NULL DEFAULT '{}',
  -- { "tags_ghl": ["svc-smec","int-caliente"], "temperamento": "D", "pipeline_stage": "propuesta" }
  instruccion  TEXT         NOT NULL,
  prioridad    INTEGER      NOT NULL DEFAULT 50 CHECK (prioridad BETWEEN 0 AND 100),
  activa       BOOLEAN      NOT NULL DEFAULT TRUE,
  aprobada     BOOLEAN      NOT NULL DEFAULT FALSE,
  usos         INTEGER      NOT NULL DEFAULT 0,
  cierres      INTEGER      NOT NULL DEFAULT 0,
  score        DECIMAL(4,3) NOT NULL DEFAULT 0.500
               CHECK (score BETWEEN 0 AND 1),
  origen       TEXT         NOT NULL DEFAULT 'manual'
               CHECK (origen IN ('manual', 'kbi_aprendida', 'automatico')),
  aprobada_por UUID         REFERENCES auth.users(id),
  aprobada_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX reglas_condiciones_gin ON reglas_conversacionales USING GIN (condiciones);
CREATE INDEX reglas_tipo_activa_idx ON reglas_conversacionales (tipo, activa, aprobada)
  WHERE activa = TRUE AND aprobada = TRUE;
CREATE INDEX reglas_prioridad_idx   ON reglas_conversacionales (prioridad DESC)
  WHERE activa = TRUE AND aprobada = TRUE;

ALTER TABLE reglas_conversacionales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reglas_read_authenticated" ON reglas_conversacionales
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "reglas_write_admin" ON reglas_conversacionales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "reglas_service" ON reglas_conversacionales
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER reglas_conversacionales_updated_at
  BEFORE UPDATE ON reglas_conversacionales
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── 2. Columnas GHL en leads ──────────────────────────────────────
-- ghl_contact_id: ID del contacto en GHL (ya se usa en varias partes del código)
-- tags_ghl:       Cache local de los tags GHL del lead (TEXT[])
-- tags_ghl_at:    Timestamp del último sync de tags

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS tags_ghl       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags_ghl_at    TIMESTAMPTZ;

CREATE INDEX leads_ghl_contact_id_idx ON leads (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
CREATE INDEX leads_tags_ghl_idx       ON leads USING GIN (tags_ghl);

-- ── 3. Deprecar matriz_nd (datos históricos conservados) ──────────

ALTER TABLE matriz_nd
  ADD COLUMN IF NOT EXISTS deprecada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN matriz_nd.deprecada IS
  'TRUE = entrada reemplazada por reglas_conversacionales (MPS-21). '
  'No se elimina para conservar historial de efectividad.';

-- ── 4. Deprecar etiquetas internas (reemplazadas por tags_ghl) ────
-- Nota: etiqueta_categorias, etiquetas y lead_etiquetas se mantienen
-- pero se marcan como deprecadas. Se eliminarán en un sprint futuro
-- cuando el código de etiquetas ECMatic esté completamente removido.

ALTER TABLE etiquetas
  ADD COLUMN IF NOT EXISTS deprecada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN etiquetas.deprecada IS
  'TRUE = etiqueta obsoleta. El sistema usa únicamente tags GHL (MPS-21). '
  'Se eliminarán en un sprint futuro junto con lead_etiquetas.';

COMMENT ON TABLE reglas_conversacionales IS
  'Sistema KB Unificado MPS-21. '
  'Una regla = SI [condiciones AND] → instrucción para Claude. '
  'Condiciones: tags_ghl, temperamento DISC, pipeline_stage. '
  'Reemplaza la lógica de matriz_nd con instrucciones en lenguaje natural.';
