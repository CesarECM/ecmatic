-- Sprint 38 — Usuarios Reales de Prueba
-- Registro de números reales para pruebas del flujo completo (ECMatic + GHL)

CREATE TABLE IF NOT EXISTS usuarios_prueba (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono       TEXT        NOT NULL UNIQUE,
  nombre         TEXT        NOT NULL,
  perfil_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  notas          TEXT,
  activo         BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usuarios_prueba ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_usuarios_prueba" ON usuarios_prueba
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'
    )
  );
