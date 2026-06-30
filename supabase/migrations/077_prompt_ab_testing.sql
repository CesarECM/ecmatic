-- MPS-16 S64 — Prompt A/B testing: compara variantes de instrucciones de prompt.
-- prompt_experimentos: define las variantes A y B y el segmento de leads al que aplica.
-- prompt_asignaciones: registra qué variante recibió cada lead (1 por experimento).

CREATE TABLE prompt_experimentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  variante_a       TEXT NOT NULL,
  variante_b       TEXT NOT NULL,
  segmento         JSONB,                       -- { pipeline_stage?, temperamento? }
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  ganador          CHAR(1),                     -- 'a' | 'b'
  asignaciones_a   INT NOT NULL DEFAULT 0,
  conversiones_a   INT NOT NULL DEFAULT 0,
  asignaciones_b   INT NOT NULL DEFAULT 0,
  conversiones_b   INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prompt_asignaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  experimento_id  UUID NOT NULL REFERENCES prompt_experimentos(id) ON DELETE CASCADE,
  variante        CHAR(1) NOT NULL,
  convertido      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, experimento_id)
);

ALTER TABLE prompt_experimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_asignaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON prompt_experimentos FOR ALL USING (true);
CREATE POLICY "service_all" ON prompt_asignaciones FOR ALL USING (true);
