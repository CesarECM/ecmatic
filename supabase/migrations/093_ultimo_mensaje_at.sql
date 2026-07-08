-- MPS leads: columna ultimo_mensaje_at + trigger automático

ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultimo_mensaje_at TIMESTAMPTZ;

-- Backfill con el mensaje más reciente por lead
UPDATE leads SET ultimo_mensaje_at = (
  SELECT MAX(created_at) FROM mensajes WHERE mensajes.lead_id = leads.id
);

-- Trigger: actualiza la columna en cada INSERT de mensajes
CREATE OR REPLACE FUNCTION fn_actualizar_ultimo_mensaje_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leads SET ultimo_mensaje_at = NEW.created_at
  WHERE id = NEW.lead_id
    AND (ultimo_mensaje_at IS NULL OR NEW.created_at > ultimo_mensaje_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mensajes_ultimo_at
AFTER INSERT ON mensajes
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_ultimo_mensaje_at();

-- Índice para sort eficiente
CREATE INDEX IF NOT EXISTS leads_ultimo_mensaje_at_idx ON leads (ultimo_mensaje_at DESC NULLS LAST);
