-- 051: Sistema de Protocolos de Seguimiento (5 Toques)
-- Arquitectura configurable: builder completo desde /admin/protocolos
-- ================================================================

-- Protocolo (la "plantilla" configurable)
CREATE TABLE protocolos_seguimiento (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre               TEXT        NOT NULL,
  descripcion          TEXT,
  activo               BOOLEAN     NOT NULL DEFAULT false,
  etapa_id             UUID        REFERENCES pipeline_etapas(id) ON DELETE SET NULL,
  link_agendado        TEXT,        -- reemplaza [LINK] en los guiones
  dias_duracion        SMALLINT    NOT NULL DEFAULT 7,
  notas_internas       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Toque individual (bloque configurable)
CREATE TABLE protocolo_toques (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id         UUID        NOT NULL REFERENCES protocolos_seguimiento(id) ON DELETE CASCADE,
  orden                SMALLINT    NOT NULL,
  nombre               TEXT        NOT NULL,
  canal                TEXT        NOT NULL CHECK (canal IN ('whatsapp', 'llamada', 'email')),
  dia_offset           SMALLINT    NOT NULL DEFAULT 0, -- días desde inicio del protocolo
  objetivo             TEXT,
  guion_principal      TEXT,        -- mensaje WA o guión "si contesta"
  guion_alternativo    TEXT,        -- guión "si no contesta" (canal=llamada)
  nota_interna         TEXT,
  ventana_hora_inicio  TIME,        -- hora mínima de envío (e.g. 09:00)
  ventana_hora_fin     TIME,        -- hora máxima de envío (e.g. 11:00)
  template_wa_id       UUID        REFERENCES wa_templates(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (protocolo_id, orden)
);

-- Criterios de descarte del protocolo
CREATE TABLE protocolo_criterios_descarte (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id      UUID        NOT NULL REFERENCES protocolos_seguimiento(id) ON DELETE CASCADE,
  orden             SMALLINT    NOT NULL DEFAULT 0,
  senal             TEXT        NOT NULL,
  diagnostico       TEXT        NOT NULL,
  accion            TEXT        NOT NULL,
  etiqueta_resultado TEXT,       -- etiqueta a aplicar al lead al descartar
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Etiquetas de diagnóstico (para revisión semanal)
CREATE TABLE protocolo_etiquetas_diagnostico (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id UUID        NOT NULL REFERENCES protocolos_seguimiento(id) ON DELETE CASCADE,
  etiqueta     TEXT        NOT NULL,
  que_significa TEXT,
  que_indica    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Estado de un lead dentro de un protocolo
CREATE TABLE lead_protocolo (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  protocolo_id      UUID        NOT NULL REFERENCES protocolos_seguimiento(id),
  toque_actual      SMALLINT    NOT NULL DEFAULT 1,
  proximo_toque_at  TIMESTAMPTZ,
  estado            TEXT        NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo', 'completado', 'descartado', 'pausado')),
  etiqueta_aplicada TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, protocolo_id)
);

-- Log de cada toque ejecutado
CREATE TABLE lead_toque_registro (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  protocolo_id    UUID        NOT NULL REFERENCES protocolos_seguimiento(id),
  toque_id        UUID        NOT NULL REFERENCES protocolo_toques(id),
  programado_at   TIMESTAMPTZ NOT NULL,
  ejecutado_at    TIMESTAMPTZ,
  resultado       TEXT        NOT NULL DEFAULT 'pendiente'
                  CHECK (resultado IN (
                    'pendiente', 'en_aprobacion', 'enviado',
                    'contesto', 'no_contesto',
                    'respondio_positivo', 'respondio_negativo', 'descartado'
                  )),
  notas           TEXT,
  mensaje_cola_id UUID,        -- referencia blanda a mensajes_cola_aprobacion
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX pt_protocolo_orden_idx  ON protocolo_toques (protocolo_id, orden);
CREATE INDEX lp_lead_estado_idx      ON lead_protocolo (lead_id, estado);
CREATE INDEX lp_proximo_idx          ON lead_protocolo (proximo_toque_at)
  WHERE estado = 'activo';
CREATE INDEX ltr_lead_idx            ON lead_toque_registro (lead_id);
CREATE INDEX ltr_toque_idx           ON lead_toque_registro (toque_id);

-- Triggers updated_at
CREATE TRIGGER protocolos_seguimiento_updated_at
  BEFORE UPDATE ON protocolos_seguimiento
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER lead_protocolo_updated_at
  BEFORE UPDATE ON lead_protocolo
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- RLS
ALTER TABLE protocolos_seguimiento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_toques               ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_criterios_descarte   ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_etiquetas_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_protocolo                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_toque_registro            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "protocolos_admin"   ON protocolos_seguimiento FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
CREATE POLICY "pt_admin"           ON protocolo_toques FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
CREATE POLICY "pcd_admin"          ON protocolo_criterios_descarte FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
CREATE POLICY "ped_admin"          ON protocolo_etiquetas_diagnostico FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "lp_admin"   ON lead_protocolo FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
CREATE POLICY "lp_service" ON lead_protocolo FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "ltr_admin"   ON lead_toque_registro FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));
CREATE POLICY "ltr_service" ON lead_toque_registro FOR ALL
  USING (auth.role() = 'service_role');
