-- MPS-5 S40.1: Motor bayesiano de timing
-- • global_timing_prior  — prior LatAm/MX seeded (7×24×3 = 504 filas)
-- • lead_timing_posterior — distribución Beta-Binomial por lead × slot (lazy, 168 max por lead)

-- ── global_timing_prior ──────────────────────────────────────────────────────

CREATE TABLE global_timing_prior (
  day_of_week   INT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day   INT  NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  followup_type TEXT NOT NULL CHECK (followup_type IN ('nurturing', 'conversational', 'payment')),
  alpha         NUMERIC NOT NULL,
  beta          NUMERIC NOT NULL,
  PRIMARY KEY (day_of_week, hour_of_day, followup_type)
);

ALTER TABLE global_timing_prior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_global_timing_prior"
  ON global_timing_prior FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- Seed: patrones LatAm/MX de actividad en WhatsApp B2C
-- Franja horaria CDMX (UTC-6):
--   muerto    00-07: α=1,  β=19  → score≈0.05
--   calentando 07-09: α=3,  β=7   → score=0.30
--   pico mañana 09-12: α=8,  β=2   → score=0.80
--   mediodía   12-14: α=5,  β=5   → score=0.50
--   tarde      14-18: α=6,  β=4   → score=0.60
--   pico tarde 18-21: α=8,  β=2   → score=0.80
--   noche      21-22: α=4,  β=6   → score=0.40
--   fuera vent 22-23: α=1,  β=19  → score≈0.05
-- Domingo (d=0): reducir 30% en franjas activas
-- Lunes mañana (d=1, h=8-10): reducir 20%

DO $$
DECLARE
  d    INT; h INT; t TEXT;
  a    NUMERIC; b NUMERIC;
  tipos TEXT[] := ARRAY['nurturing', 'conversational', 'payment'];
BEGIN
  FOREACH t IN ARRAY tipos LOOP
    FOR d IN 0..6 LOOP
      FOR h IN 0..23 LOOP
        -- Clasificación base por hora
        IF    h BETWEEN 0  AND 6  THEN a := 1;  b := 19;
        ELSIF h BETWEEN 7  AND 8  THEN a := 3;  b := 7;
        ELSIF h BETWEEN 9  AND 11 THEN a := 8;  b := 2;
        ELSIF h BETWEEN 12 AND 13 THEN a := 5;  b := 5;
        ELSIF h BETWEEN 14 AND 17 THEN a := 6;  b := 4;
        ELSIF h BETWEEN 18 AND 20 THEN a := 8;  b := 2;
        ELSIF h = 21               THEN a := 4;  b := 6;
        ELSE                            a := 1;  b := 19;  -- 22-23 fuera de ventana
        END IF;

        -- Reducción domingo (d=0)
        IF d = 0 AND h BETWEEN 7 AND 21 THEN
          a := ROUND(a * 0.7, 2);
          b := ROUND(b * 1.3, 2);
        END IF;

        -- Reducción lunes mañana (d=1, h=8-10: saturación notificaciones fin de semana)
        IF d = 1 AND h BETWEEN 8 AND 10 THEN
          a := ROUND(a * 0.8, 2);
          b := ROUND(b * 1.2, 2);
        END IF;

        INSERT INTO global_timing_prior (day_of_week, hour_of_day, followup_type, alpha, beta)
        VALUES (d, h, t, a, b)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── lead_timing_posterior ─────────────────────────────────────────────────────

CREATE TABLE lead_timing_posterior (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID    NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  day_of_week INT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INT     NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  alpha       NUMERIC NOT NULL DEFAULT 1,
  beta        NUMERIC NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, day_of_week, hour_of_day)
);

CREATE INDEX idx_lead_timing_lead ON lead_timing_posterior(lead_id);

ALTER TABLE lead_timing_posterior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_lead_timing_posterior"
  ON lead_timing_posterior FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

CREATE OR REPLACE FUNCTION update_lead_timing_posterior_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_lead_timing_posterior_updated_at
  BEFORE UPDATE ON lead_timing_posterior
  FOR EACH ROW EXECUTE FUNCTION update_lead_timing_posterior_updated_at();
