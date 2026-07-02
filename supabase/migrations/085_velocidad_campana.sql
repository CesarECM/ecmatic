-- S82: Agrega token accumulator para velocidad continua de campaña.
-- El acumulador persiste la fracción de leads entre runs del cron (token bucket pattern).
ALTER TABLE ghl_approval_stats
  ADD COLUMN IF NOT EXISTS leads_acumulados float8 NOT NULL DEFAULT 0;
