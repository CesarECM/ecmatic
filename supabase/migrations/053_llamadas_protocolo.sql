-- Sprint 28 fix: conecta llamadas_vendedor con el sistema de protocolos.
-- Añade estado (pendiente/completada) y las FK necesarias para que el vendedor
-- pueda ver llamadas que el protocolo ordena y avanzar el toque al completarlas.

ALTER TABLE llamadas_vendedor
  ADD COLUMN estado            TEXT    NOT NULL DEFAULT 'completada'
    CHECK (estado IN ('pendiente', 'completada')),
  ADD COLUMN toque_id          UUID    REFERENCES protocolo_toques(id)      ON DELETE SET NULL,
  ADD COLUMN lead_protocolo_id UUID    REFERENCES lead_protocolo(id)        ON DELETE CASCADE,
  ADD COLUMN toque_registro_id UUID    REFERENCES lead_toque_registro(id)   ON DELETE SET NULL,
  ADD COLUMN protocolo_id      UUID    REFERENCES protocolos_seguimiento(id) ON DELETE SET NULL,
  ADD COLUMN toque_orden       INTEGER;

-- Para que el panel del vendedor consulte pendientes rápido
CREATE INDEX llamadas_pendientes_idx     ON llamadas_vendedor (vendedor_id, estado)
  WHERE estado = 'pendiente';
CREATE INDEX llamadas_lead_protocolo_idx ON llamadas_vendedor (lead_protocolo_id);

-- Los registros existentes son llamadas manuales ya completadas: estado='completada' por DEFAULT.
