-- MPS-36 S123.1 — Smart Panel v2: scoring compuesto, pool ilimitado, momentum, ancla, fecha_compromiso, pregunta_clave.

ALTER TABLE oportunidades_panel
  ADD COLUMN IF NOT EXISTS valor_ticket     NUMERIC(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fecha_compromiso TIMESTAMPTZ    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pregunta_clave   TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fijado           BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS momentum_score   NUMERIC(6,2)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS momentum_at      TIMESTAMPTZ    DEFAULT NULL;

COMMENT ON COLUMN oportunidades_panel.valor_ticket
  IS 'Valor estimado del ticket en pesos MXN. Extraído por IA de la conversación; editable por el admin.';
COMMENT ON COLUMN oportunidades_panel.fecha_compromiso
  IS 'Fecha/hora que el lead comprometió para pagar o responder. Si es futura, el lead sale del top-10 hasta esa fecha.';
COMMENT ON COLUMN oportunidades_panel.pregunta_clave
  IS 'Pregunta guía generada por IA según el estado actual del lead. Se muestra encima del input de notas.';
COMMENT ON COLUMN oportunidades_panel.fijado
  IS 'Si true, el algoritmo de prioridad no mueve este lead. César lo ancló manualmente.';
COMMENT ON COLUMN oportunidades_panel.momentum_score
  IS 'Score acumulado por acciones manuales (DnD, agregar, notas). Decae exponencialmente con half-life de 24h.';
COMMENT ON COLUMN oportunidades_panel.momentum_at
  IS 'Timestamp de la última acción manual que generó momentum. Necesario para calcular el decaimiento.';

CREATE INDEX IF NOT EXISTS op_fecha_compromiso_idx ON oportunidades_panel (fecha_compromiso)
  WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS op_fijado_idx ON oportunidades_panel (fijado)
  WHERE activo = TRUE;
