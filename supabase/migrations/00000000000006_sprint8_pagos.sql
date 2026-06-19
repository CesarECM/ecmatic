-- ============================================================
-- ECMatic · Sprint 8 · Pagos, Stripe y Módulo Financiero
-- ============================================================

-- ── pagos ────────────────────────────────────────────────────
CREATE TABLE pagos (
  id                         UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id                    UUID          NOT NULL REFERENCES leads(id),
  vendedor_id                UUID          REFERENCES vendedores(id),
  monto                      DECIMAL(10,2) NOT NULL,
  moneda                     TEXT          NOT NULL DEFAULT 'MXN',
  metodo                     TEXT          NOT NULL CHECK (metodo IN ('stripe', 'manual')),
  stripe_payment_intent_id   TEXT,
  stripe_session_id          TEXT,
  comprobante_url            TEXT,
  estado                     TEXT          NOT NULL DEFAULT 'completado'
                                           CHECK (estado IN ('pendiente', 'completado', 'reembolsado')),
  notas                      TEXT,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX pagos_lead_idx     ON pagos (lead_id);
CREATE INDEX pagos_vendedor_idx ON pagos (vendedor_id);
CREATE INDEX pagos_fecha_idx    ON pagos (created_at DESC);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagos_admin_all" ON pagos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'admin_financiero'))
);
CREATE POLICY "pagos_vendedor_read" ON pagos FOR SELECT USING (
  EXISTS (SELECT 1 FROM vendedores v WHERE v.profile_id = auth.uid() AND v.id = pagos.vendedor_id)
);

-- ── comisiones ───────────────────────────────────────────────
CREATE TABLE comisiones (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id        UUID          NOT NULL REFERENCES pagos(id),
  vendedor_id    UUID          NOT NULL REFERENCES vendedores(id),
  monto_comision DECIMAL(10,2) NOT NULL,
  porcentaje     DECIMAL(4,2)  NOT NULL DEFAULT 10.00,
  estado         TEXT          NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente', 'pagada')),
  fecha_pago     TIMESTAMPTZ,
  metodo_pago    TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX comisiones_vendedor_idx ON comisiones (vendedor_id, estado);
CREATE INDEX comisiones_pago_idx     ON comisiones (pago_id);

ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comisiones_admin_all" ON comisiones FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'admin_financiero'))
);
CREATE POLICY "comisiones_vendedor_own" ON comisiones FOR SELECT USING (
  EXISTS (SELECT 1 FROM vendedores v WHERE v.profile_id = auth.uid() AND v.id = comisiones.vendedor_id)
);

CREATE TRIGGER comisiones_updated_at BEFORE UPDATE ON comisiones
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── uso_ia (S8.8) ────────────────────────────────────────────
CREATE TABLE uso_ia (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor        TEXT          NOT NULL CHECK (proveedor IN ('anthropic', 'openai')),
  tokens_entrada   INTEGER       NOT NULL DEFAULT 0,
  tokens_salida    INTEGER       NOT NULL DEFAULT 0,
  costo_estimado   DECIMAL(8,6)  NOT NULL DEFAULT 0,
  fecha            DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX uso_ia_fecha_idx ON uso_ia (proveedor, fecha DESC);

ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_ia_admin" ON uso_ia FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'admin_financiero'))
);
