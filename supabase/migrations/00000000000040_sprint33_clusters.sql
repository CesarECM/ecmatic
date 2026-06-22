-- ============================================================
-- ECMatic · Sprint 33 · Clustering de sugerencias
-- S33.8: tabla clusters_sugerencias + cluster_id en sugerencias_ia
-- ============================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.clusters_sugerencias (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_generado TEXT        NOT NULL,
  conteo          INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sugerencias_ia
  ADD COLUMN IF NOT EXISTS cluster_id UUID
    REFERENCES public.clusters_sugerencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sugerencias_cluster_idx
  ON public.sugerencias_ia (cluster_id)
  WHERE aprobado IS NULL;

ALTER TABLE public.clusters_sugerencias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "clusters_admin" ON public.clusters_sugerencias FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
