-- ============================================================
-- ECMatic · Sprint 35 · cron_log + score_salud_historial
-- ============================================================
SET search_path TO public;

-- ── S35.1 · Registro de ejecuciones de CRONs ────────────────

CREATE TABLE IF NOT EXISTS public.cron_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name    TEXT        NOT NULL,
  ejecutado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado    JSONB,
  detalle      TEXT
);

CREATE INDEX IF NOT EXISTS cron_log_name_time_idx
  ON public.cron_log (cron_name, ejecutado_at DESC);

ALTER TABLE public.cron_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cron_log_service_role" ON public.cron_log
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cron_log_admin_read" ON public.cron_log
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S35.5 · Historial de score_salud por lead ───────────────
-- Array JSONB: [{ score, timestamp, motivo }] últimas 90 entradas

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score_salud_historial JSONB NOT NULL DEFAULT '[]';
