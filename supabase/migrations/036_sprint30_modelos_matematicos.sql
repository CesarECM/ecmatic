-- ============================================================
-- ECMatic · Sprint 30 · Modelos Matemáticos de Venta
-- S30.3: Contextual Bandit — contadores por contexto
-- ============================================================

-- ── Agregar metadata a configuracion_sistema para pesos S30.1 ──
-- Defensivo: crea la tabla si no existe (debería existir desde migración 18),
-- luego añade la columna si falta.
CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  modo_operacion   TEXT        NOT NULL DEFAULT 'pruebas'
                   CHECK (modo_operacion IN ('pruebas', 'seguro', 'seguro_automatico', 'automatico')),
  umbral_confianza NUMERIC(4,2) NOT NULL DEFAULT 0.80
                   CHECK (umbral_confianza BETWEEN 0 AND 1),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID
);

-- Fila única si la tabla estaba vacía
INSERT INTO configuracion_sistema (modo_operacion, umbral_confianza)
SELECT 'pruebas', 0.80
WHERE NOT EXISTS (SELECT 1 FROM configuracion_sistema);

ALTER TABLE configuracion_sistema
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ── pipeline_ab_contextos (S30.3) ────────────────────────────
-- Mantiene contadores alpha/beta por (test_id, context_key).
-- context_key codifica: fase_bucket:avatar:canal
CREATE TABLE pipeline_ab_contextos (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id         UUID        NOT NULL,
  context_key     TEXT        NOT NULL,
  asignaciones_a  INTEGER     NOT NULL DEFAULT 0,
  conversiones_a  INTEGER     NOT NULL DEFAULT 0,
  asignaciones_b  INTEGER     NOT NULL DEFAULT 0,
  conversiones_b  INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_id, context_key)
);

ALTER TABLE pipeline_ab_contextos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_ab_contextos_admin" ON pipeline_ab_contextos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER pipeline_ab_contextos_updated_at BEFORE UPDATE ON pipeline_ab_contextos
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
