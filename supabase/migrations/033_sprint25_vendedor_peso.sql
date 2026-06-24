-- S25.2 — Peso de vendedor para distribución proporcional de citas
-- Rango 0–100; 0 = excluido de asignación automática; default 50

ALTER TABLE vendedores
  ADD COLUMN IF NOT EXISTS peso SMALLINT NOT NULL DEFAULT 50
    CHECK (peso >= 0 AND peso <= 100);
