-- Sprint 18.2 — Cola de revisión de comprobantes de pago
-- ================================================================
-- Almacena comprobantes recibidos vía imagen para aprobación humana.
-- El admin aprueba → sistema mueve lead a "Comprado" automáticamente.

CREATE TABLE comprobantes_cola_revision (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono    TEXT        NOT NULL,
  wa_media_id TEXT,       -- Meta media ID para re-descargar la imagen
  aprobado    BOOLEAN,    -- NULL=pendiente, TRUE=aprobado, FALSE=rechazado
  notas_admin TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX comprobantes_pendientes_idx ON comprobantes_cola_revision (aprobado)
  WHERE aprobado IS NULL;

ALTER TABLE comprobantes_cola_revision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comprobantes_admin" ON comprobantes_cola_revision FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
