-- MPS-20 S73.1 — Motor KB Inteligente: tablas base
-- kbi_senales: registro inmutable de eventos por recurso
-- kbi_sugerencias: cola de mejoras con schema estricto
-- kbi_score: columna Bayesiana en recursos_conocimiento
-- tipo 'regla': hechos autoritativos del centro (precios, plazos, requisitos)

-- ── 1. Añadir tipo 'regla' al CHECK de recursos_conocimiento ─────
ALTER TABLE recursos_conocimiento
  DROP CONSTRAINT IF EXISTS recursos_conocimiento_tipo_check;

ALTER TABLE recursos_conocimiento
  ADD CONSTRAINT recursos_conocimiento_tipo_check
  CHECK (tipo IN (
    'faq', 'objecion', 'servicio',
    'template_wa', 'template_email', 'practica_venta',
    'regla'
  ));

-- ── 2. Columna kbi_score en recursos_conocimiento ────────────────
-- Score Bayesiano calculado por el cron diario (Beta-Binomial + decaimiento).
-- Default 0.5 (prior neutral) hasta que acumule señales suficientes.
ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS kbi_score FLOAT NOT NULL DEFAULT 0.5
    CHECK (kbi_score BETWEEN 0 AND 1);

COMMENT ON COLUMN recursos_conocimiento.kbi_score IS
  'Score Bayesiano calculado diariamente por kbi/scores.ts. '
  'Fórmula: (cierres+1)/(usos+2) * exp(-días_sin_uso/180). '
  'Se activa solo cuando total_usos >= 5 en buscar_recursos_kbi().';

-- ── 3. Tabla kbi_senales ─────────────────────────────────────────
-- Log inmutable: una fila = un evento observable sobre un recurso.
-- Fuente única de verdad para el motor de scores y los detectores.
CREATE TABLE IF NOT EXISTS kbi_senales (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recurso_id  UUID        NOT NULL
                          REFERENCES recursos_conocimiento(id) ON DELETE CASCADE,
  tipo_senal  TEXT        NOT NULL
                          CHECK (tipo_senal IN (
                            'uso',           -- recurso recuperado y enviado al prompt
                            'cierre',        -- lead avanzó/compró mientras el recurso estaba activo
                            'perdida',       -- lead se perdió mientras el recurso estaba activo
                            'rechazo_admin', -- admin rechazó sugerencia originada en este recurso
                            'edicion_admin'  -- admin editó el recurso manualmente
                          )),
  lead_id     UUID        REFERENCES leads(id) ON DELETE SET NULL,
  sesion_id   UUID,       -- agrupa señales de una misma conversación (crypto.randomUUID() por sesión)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE kbi_senales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kbi_senales_service" ON kbi_senales
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "kbi_senales_admin_read" ON kbi_senales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE INDEX kbi_senales_recurso_tipo_idx ON kbi_senales (recurso_id, tipo_senal, created_at DESC);
CREATE INDEX kbi_senales_created_at_idx   ON kbi_senales (created_at DESC);

COMMENT ON TABLE kbi_senales IS
  'Log inmutable de señales de aprendizaje KBI. '
  'No modificar registros — solo insertar. '
  'Leído por kbi/scores.ts para calcular kbi_score diariamente.';

-- ── 4. Tabla kbi_sugerencias ─────────────────────────────────────
-- Cola de mejoras KB con schema estricto. Cada aprobación SIEMPRE
-- resulta en un cambio real al KB (invariante del aplicador).
CREATE TABLE IF NOT EXISTS kbi_sugerencias (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recurso_id          UUID        REFERENCES recursos_conocimiento(id) ON DELETE CASCADE,
  tipo_accion         TEXT        NOT NULL
                                  CHECK (tipo_accion IN ('crear', 'actualizar', 'desactivar')),
  tipo_recurso_nuevo  TEXT        CHECK (tipo_recurso_nuevo IN (
                                    'faq', 'regla', 'servicio',
                                    'template_wa', 'template_email', 'practica_venta', 'objecion'
                                  )),  -- solo cuando tipo_accion = 'crear'
  titulo_propuesto    TEXT        NOT NULL,
  contenido_propuesto TEXT        NOT NULL,
  razon               TEXT        NOT NULL,
  origen              TEXT        NOT NULL
                                  CHECK (origen IN (
                                    'detector_huecos',    -- búsqueda sin resultado en el flujo
                                    'detector_patron',    -- edits recurrentes de GHL
                                    'detector_confianza', -- kbi_score < umbral con usos suficientes
                                    'admin_manual'        -- admin creó la sugerencia directamente
                                  )),
  estado              TEXT        NOT NULL DEFAULT 'pendiente'
                                  CHECK (estado IN ('pendiente', 'aplicada', 'rechazada')),
  admin_feedback      TEXT,
  aplicada_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE kbi_sugerencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kbi_sugerencias_service" ON kbi_sugerencias
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "kbi_sugerencias_admin" ON kbi_sugerencias
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE INDEX kbi_sugerencias_estado_idx    ON kbi_sugerencias (estado, created_at DESC);
CREATE INDEX kbi_sugerencias_recurso_idx   ON kbi_sugerencias (recurso_id) WHERE recurso_id IS NOT NULL;

CREATE TRIGGER kbi_sugerencias_updated_at BEFORE UPDATE ON kbi_sugerencias
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON TABLE kbi_sugerencias IS
  'Cola de mejoras KB aprobadas siempre por admin. '
  'Invariante del aplicador: aprobar = cambio real en recursos_conocimiento + embedding regenerado. '
  'tipo_accion=crear requiere recurso_id=NULL y tipo_recurso_nuevo NOT NULL.';
