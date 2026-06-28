-- Persiste la página actual de GHL para que el auto-disparo avance
-- secuencialmente por todos los contactos en lugar de repetir siempre página 1.
ALTER TABLE ghl_approval_stats
  ADD COLUMN IF NOT EXISTS pagina_campana INTEGER NOT NULL DEFAULT 1;
