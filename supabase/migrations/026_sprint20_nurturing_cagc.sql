-- ============================================================
-- ECMatic · Sprint 20 · S20.7 — Nurturing multi-canal por fase CAGC
-- ============================================================

-- Añade filtro de fase CAGC a las secuencias de nurturing.
-- NULL en ambos campos = aplica a cualquier fase (comportamiento previo preservado).
ALTER TABLE nurturing_secuencias
  ADD COLUMN IF NOT EXISTS fase_cagc_min SMALLINT CHECK (fase_cagc_min BETWEEN 0 AND 16),
  ADD COLUMN IF NOT EXISTS fase_cagc_max SMALLINT CHECK (fase_cagc_max BETWEEN 0 AND 16);
