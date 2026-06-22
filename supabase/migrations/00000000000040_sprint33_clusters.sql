-- ============================================================
-- ECMatic · Sprint 33 · Clustering de sugerencias
-- S33.8: tabla clusters_sugerencias + cluster_id en sugerencias_ia
-- ============================================================

CREATE TABLE clusters_sugerencias (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_generado TEXT        NOT NULL,
  conteo          INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sugerencias_ia
  ADD COLUMN IF NOT EXISTS cluster_id UUID
    REFERENCES clusters_sugerencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sugerencias_cluster_idx
  ON sugerencias_ia (cluster_id)
  WHERE aprobado IS NULL;

ALTER TABLE clusters_sugerencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clusters_admin" ON clusters_sugerencias FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
);
