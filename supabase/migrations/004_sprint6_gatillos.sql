-- ============================================================
-- ECMatic · Sprint 6 · Panel de Gatillos Mentales de Venta
-- ============================================================

CREATE TABLE gatillos (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo                TEXT        NOT NULL
                                  CHECK (tipo IN (
                                    'escasez_cupo', 'escasez_evaluadores',
                                    'urgencia_fecha', 'precio_vigente',
                                    'evento_proximo', 'otro'
                                  )),
  nombre              TEXT        NOT NULL,
  valor_actual        TEXT        NOT NULL DEFAULT '',
  activo              BOOLEAN     NOT NULL DEFAULT FALSE,
  fecha_expiracion    TIMESTAMPTZ,
  audiencia_objetivo  TEXT        NOT NULL DEFAULT 'all'
                                  CHECK (audiencia_objetivo IN ('all', 'tripwire', 'premium')),
  alerta_enviada      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX gatillos_activos_idx ON gatillos (activo, fecha_expiracion)
  WHERE activo = TRUE;

ALTER TABLE gatillos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gatillos_read_authenticated" ON gatillos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "gatillos_write_admin" ON gatillos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE TRIGGER gatillos_updated_at BEFORE UPDATE ON gatillos
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Gatillos por defecto (inactivos hasta que admin los configure y active)
INSERT INTO gatillos (tipo, nombre, valor_actual, audiencia_objetivo) VALUES
  ('escasez_cupo',         'Cupos disponibles',          'Quedan 5 espacios este mes',      'all'),
  ('escasez_evaluadores',  'Evaluadores disponibles',    'Solo 2 evaluadores disponibles',   'all'),
  ('urgencia_fecha',       'Fecha límite de inscripción','Cierre de inscripciones el viernes','all'),
  ('precio_vigente',       'Precio especial vigente',    'Precio actual válido hasta el lunes','tripwire'),
  ('evento_proximo',       'Próximo evento informativo', 'Webinar gratuito este jueves 7pm', 'all');
