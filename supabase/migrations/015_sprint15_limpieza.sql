-- ============================================================
-- ECMatic · Sprint 15 · Limpieza de Datos: Leads y KB
-- ============================================================

-- ── S15.3: blacklist ─────────────────────────────────────────
CREATE TABLE blacklist (
  id        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono  TEXT,
  email     TEXT,
  motivo    TEXT        NOT NULL DEFAULT 'solicitud_eliminacion'
                        CHECK (motivo IN ('solicitud_eliminacion', 'invalido', 'spam')),
  creado_por TEXT       NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blacklist_al_menos_uno CHECK (telefono IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX blacklist_telefono_idx ON blacklist (telefono) WHERE telefono IS NOT NULL;
CREATE UNIQUE INDEX blacklist_email_idx    ON blacklist (email)    WHERE email    IS NOT NULL;

ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blacklist_admin" ON blacklist
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
CREATE POLICY "blacklist_service" ON blacklist FOR ALL USING (auth.role() = 'service_role');

-- ── S15.4: archivado de leads por inactividad ────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archivado        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archivado_razon  TEXT;

CREATE INDEX leads_archivado_idx ON leads (archivado, updated_at) WHERE archivado = TRUE;

-- ── S15.5: 5 scores independientes en recursos_conocimiento ──
ALTER TABLE recursos_conocimiento
  ADD COLUMN IF NOT EXISTS score_efectividad DECIMAL(3,2) NOT NULL DEFAULT 0.5
    CHECK (score_efectividad BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS score_vigencia    DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (score_vigencia    BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS score_consenso    DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (score_consenso    BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS score_cobertura   DECIMAL(3,2) NOT NULL DEFAULT 0.5
    CHECK (score_cobertura   BETWEEN 0 AND 1);

-- ── S15.13: categorías de suciedad dinámicas de KB ───────────
CREATE TABLE categorias_suciedad_kb (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre            TEXT        NOT NULL UNIQUE,
  descripcion       TEXT        NOT NULL,
  regla_deteccion   TEXT        NOT NULL,
  origen            TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (origen IN ('manual', 'ia_sugerido')),
  estado            TEXT        NOT NULL DEFAULT 'activa'
                                CHECK (estado IN ('activa', 'pendiente_revision', 'archivada')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE categorias_suciedad_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suciedad_admin" ON categorias_suciedad_kb
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
CREATE POLICY "suciedad_service" ON categorias_suciedad_kb FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER suciedad_updated_at BEFORE UPDATE ON categorias_suciedad_kb
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Seed: 12 categorías de suciedad conocidas (S15.6-S15.12)
INSERT INTO categorias_suciedad_kb (nombre, descripcion, regla_deteccion) VALUES
  ('Duplicado semántico',     'Mismo significado con redacción distinta',               'embedding similarity > 0.92 entre dos recursos activos'),
  ('Contenido contradictorio','Afirmaciones opuestas sobre el mismo tema',              'dos recursos con embeddings similares y contenido que se contradice'),
  ('Recurso sin uso',         'Nunca utilizado en conversaciones reales',               'score_uso = 0 y antigüedad > 30 días'),
  ('Obsolescencia parcial',   'Dato puntual desactualizado en recurso mayormente útil', 'precio, fecha o proceso específico contradice catálogo actual'),
  ('Huérfano de cobertura',   'Pregunta frecuente sin recurso asociado',                'consulta repetida sin match semántico suficiente en KB'),
  ('Objeción resuelta',       'Objeción histórica que ya no aplica en el negocio',      'recurso tipo objecion con score_uso alto pero score_efectividad bajo'),
  ('Template degradado',      'Conversión cayendo sostenidamente',                      'score_efectividad decayendo en ventana móvil de 30 días'),
  ('Inconsistencia de canal', 'Respuesta distinta a la misma pregunta en WA vs email',  'recursos de tipo template_wa y template_email con embedding similar pero contenido divergente'),
  ('Sesgo de origen único',   'Creado desde una sola conversación o vendedor',          'metadata.origen_conversacion es un único ID'),
  ('Deriva de tono',          'Desalineado con la voz de marca actual',                 'antigüedad > 180 días sin revisión + análisis de tono vs recursos recientes'),
  ('Canibalización',          'Recurso nuevo mejor coexiste con uno viejo inferior',    'par de recursos: uno más reciente con score > antiguo activo sobre mismo tema'),
  ('Loop circular',           'Cadena de referencias que regresa a sí misma',           'recurso A referencia a B que referencia de regreso a A sin resolver la duda');

-- ── Extender tipo en sugerencias_ia para KB calidad ──────────
ALTER TABLE sugerencias_ia
  DROP CONSTRAINT IF EXISTS sugerencias_ia_tipo_check;

ALTER TABLE sugerencias_ia
  ADD CONSTRAINT sugerencias_ia_tipo_check
  CHECK (tipo IN ('pipeline', 'flujo', 'avatar', 'gatillo', 'kb_calidad', 'general'));

-- ── RPC: duplicados semánticos dentro del KB ─────────────────
CREATE OR REPLACE FUNCTION buscar_duplicados_kb(umbral FLOAT DEFAULT 0.92)
RETURNS TABLE (id_a UUID, id_b UUID, similitud FLOAT) AS $$
  SELECT a.id, b.id, 1 - (a.embedding <=> b.embedding) AS similitud
  FROM recursos_conocimiento a
  JOIN recursos_conocimiento b ON a.id < b.id
  WHERE a.activo AND b.activo
    AND a.aprobado AND b.aprobado
    AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    AND 1 - (a.embedding <=> b.embedding) > umbral
  ORDER BY similitud DESC
  LIMIT 50;
$$ LANGUAGE sql STABLE;
