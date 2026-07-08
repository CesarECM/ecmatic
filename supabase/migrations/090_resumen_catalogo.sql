-- MPS-32 S115.1 — Resumen de catálogo IA en configuracion_sistema
ALTER TABLE configuracion_sistema
  ADD COLUMN IF NOT EXISTS resumen_catalogo TEXT,
  ADD COLUMN IF NOT EXISTS resumen_catalogo_at TIMESTAMPTZ;
