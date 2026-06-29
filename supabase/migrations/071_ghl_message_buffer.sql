-- MPS-10 S46.1 — Buffer de mensajes GHL con debounce de 15 segundos.
-- Agrupa mensajes enviados en ráfaga por el mismo contacto antes de procesarlos
-- con la IA, evitando múltiples respuestas al estilo "Hola" / "Como" / "Estas?".
-- La función ghl_buffer_upsert() garantiza el append atómico sin race conditions.

CREATE TABLE IF NOT EXISTS ghl_message_buffer (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        TEXT        NOT NULL,
  conversation_id   TEXT,
  campana           TEXT        NOT NULL,
  mensajes_json     JSONB       NOT NULL DEFAULT '[]'::JSONB,
  ultimo_mensaje_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado         BOOLEAN     NOT NULL DEFAULT FALSE,
  procesado_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo buffer activo por contacto a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_ghl_message_buffer_contact_activo
  ON ghl_message_buffer (contact_id)
  WHERE NOT procesado;

-- Índice para el cron: busca filas pendientes con último mensaje viejo
CREATE INDEX IF NOT EXISTS idx_ghl_message_buffer_pendientes
  ON ghl_message_buffer (ultimo_mensaje_at)
  WHERE NOT procesado;

-- RLS: solo service_role accede (sin políticas = bloqueado para anon/authenticated)
ALTER TABLE ghl_message_buffer ENABLE ROW LEVEL SECURITY;

-- Append atómico: si ya existe buffer activo para el contacto, concatena el nuevo
-- mensaje al array y actualiza ultimo_mensaje_at; si no, crea fila nueva.
CREATE OR REPLACE FUNCTION ghl_buffer_upsert(
  p_contact_id      TEXT,
  p_conversation_id TEXT,
  p_campana         TEXT,
  p_mensaje         JSONB
) RETURNS VOID LANGUAGE PLPGSQL AS $$
BEGIN
  UPDATE ghl_message_buffer
  SET
    mensajes_json     = mensajes_json || jsonb_build_array(p_mensaje),
    ultimo_mensaje_at = NOW(),
    conversation_id   = COALESCE(conversation_id, p_conversation_id)
  WHERE contact_id = p_contact_id AND NOT procesado;

  IF NOT FOUND THEN
    INSERT INTO ghl_message_buffer (contact_id, conversation_id, campana, mensajes_json)
    VALUES (p_contact_id, p_conversation_id, p_campana, jsonb_build_array(p_mensaje));
  END IF;
END;
$$;
