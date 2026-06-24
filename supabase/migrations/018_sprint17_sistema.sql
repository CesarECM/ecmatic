-- Sprint 17.1 — Estado global del sistema
-- ================================================================

CREATE TABLE configuracion_sistema (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  modo_operacion   TEXT        NOT NULL DEFAULT 'pruebas'
                   CHECK (modo_operacion IN ('pruebas', 'seguro', 'seguro_automatico', 'automatico')),
  umbral_confianza NUMERIC(4,2) NOT NULL DEFAULT 0.80
                   CHECK (umbral_confianza BETWEEN 0 AND 1),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID        REFERENCES profiles(id),
  -- Singleton: solo puede existir una fila
  CONSTRAINT solo_una_fila CHECK (id = id)
);

-- Fila única inicial en modo Pruebas
INSERT INTO configuracion_sistema (modo_operacion, umbral_confianza) VALUES ('pruebas', 0.80);

ALTER TABLE configuracion_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_sistema_admin" ON configuracion_sistema FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE TRIGGER configuracion_sistema_updated_at
  BEFORE UPDATE ON configuracion_sistema
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
