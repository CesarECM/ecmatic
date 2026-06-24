-- ============================================================
-- ECMatic · Sprint 21 · S21.1 — Votos de calidad en respuestas IA
-- ============================================================

CREATE TABLE votos_respuesta (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  mensaje_id  UUID         NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  voto        TEXT         NOT NULL CHECK (voto IN ('bueno', 'malo')),
  comentario  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT votos_por_mensaje UNIQUE (mensaje_id)
);

CREATE INDEX votos_voto_idx ON votos_respuesta (voto);
CREATE INDEX votos_created_idx ON votos_respuesta (created_at);

ALTER TABLE votos_respuesta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votos_admin" ON votos_respuesta FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

CREATE POLICY "votos_service_role" ON votos_respuesta FOR ALL
  USING (auth.role() = 'service_role');
