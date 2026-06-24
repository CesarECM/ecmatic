-- ============================================================
-- ECMatic · Sprint 4 · Nurturing automático
-- ============================================================

-- nurturing_secuencias
-- Reglas de seguimiento: cuándo y cómo contactar leads inactivos
CREATE TABLE nurturing_secuencias (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre             TEXT        NOT NULL,
  canal              TEXT        NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  etapa_pipeline     TEXT,       -- NULL = aplica a todas las etapas activas
  ruta               TEXT        CHECK (ruta IN ('tripwire', 'premium')), -- NULL = ambas rutas
  dias_sin_respuesta INTEGER     NOT NULL DEFAULT 3 CHECK (dias_sin_respuesta > 0),
  plantilla_id       UUID        REFERENCES recursos_conocimiento(id),
  mensaje_fallback   TEXT,
  orden              INTEGER     NOT NULL DEFAULT 0,
  activo             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE nurturing_secuencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nurturing_secuencias_read_authenticated" ON nurturing_secuencias
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "nurturing_secuencias_write_admin" ON nurturing_secuencias
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER nurturing_secuencias_updated_at BEFORE UPDATE ON nurturing_secuencias
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- nurturing_envios
-- Historial de contactos automáticos por lead
CREATE TABLE nurturing_envios (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  secuencia_id    UUID        NOT NULL REFERENCES nurturing_secuencias(id),
  canal           TEXT        NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  estado          TEXT        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'omitido')),
  error_detalle   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE nurturing_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nurturing_envios_admin_all" ON nurturing_envios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "nurturing_envios_service_role" ON nurturing_envios
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX nurturing_envios_lead_idx ON nurturing_envios (lead_id, created_at DESC);
CREATE INDEX nurturing_envios_estado_idx ON nurturing_envios (estado);

-- Secuencias por defecto
INSERT INTO nurturing_secuencias
  (nombre, canal, etapa_pipeline, ruta, dias_sin_respuesta, mensaje_fallback, orden)
VALUES
  (
    'Seguimiento 3 días — Nuevo tripwire',
    'whatsapp', 'Nuevo', 'tripwire', 3,
    'Hola {nombre}! Te escribimos desde Centro ECM ¿Tienes alguna duda sobre nuestras certificaciones CONOCER? Estamos para ayudarte.',
    1
  ),
  (
    'Seguimiento 7 días — Contactado tripwire',
    'whatsapp', 'Contactado', 'tripwire', 7,
    'Hola {nombre}, ¿cómo estás? Queremos asegurarnos de que tengas toda la información sobre tu proceso de certificación. ¿En qué te podemos apoyar?',
    2
  ),
  (
    'Re-engagement 14 días — Interesado tripwire',
    'whatsapp', 'Interesado', 'tripwire', 14,
    'Hola {nombre}! Tenemos disponibilidad esta semana para tu certificación CONOCER. ¿Quieres que agendemos una llamada informativa gratuita?',
    3
  ),
  (
    'Seguimiento 5 días — Nuevo premium',
    'whatsapp', 'Nuevo', 'premium', 5,
    'Hola {nombre}, desde Centro ECM queremos darte seguimiento personalizado. ¿Podemos agendar un diagnóstico gratuito de tu proceso de certificación?',
    1
  ),
  (
    'Re-engagement 21 días — General',
    'whatsapp', NULL, NULL, 21,
    'Hola {nombre}! Si en algún momento retomas tu interés en certificarte con CONOCER, aquí estaremos. ¿Hay algo en que podamos ayudarte hoy?',
    99
  );
