-- MPS-26 S93: Schema completo — ángulos adaptativos + biblioteca de templates de seguimiento
-- Tablas nuevas: followup_angulos, global_angle_prior, lead_angle_posterior,
--                followup_templates, followup_template_uso_lead
-- Columna nueva en ghl_approval_queue: template_id

-- ── 1. followup_angulos — biblioteca de ángulos de reactivación ───────────────

CREATE TABLE followup_angulos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT        NOT NULL UNIQUE,
  nombre      TEXT        NOT NULL,
  descripcion TEXT        NOT NULL,
  tipo        TEXT        CHECK (tipo IN ('nurturing', 'conversational', 'payment', 'demo_agendado')),
  nivel_min   INT         NOT NULL DEFAULT 1,
  nivel_max   INT         NOT NULL DEFAULT 99,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE followup_angulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_followup_angulos"
  ON followup_angulos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

CREATE OR REPLACE FUNCTION update_followup_angulos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_followup_angulos_updated_at
  BEFORE UPDATE ON followup_angulos
  FOR EACH ROW EXECUTE FUNCTION update_followup_angulos_updated_at();

-- Seed: 12 ángulos base (migrados de INSTRUCCIONES hardcodeadas en generar-followup-ghl.ts)
-- tipo NULL = universal (aplica a todos los tipos de seguimiento)

INSERT INTO followup_angulos (codigo, nombre, descripcion, tipo, nivel_min, nivel_max) VALUES

('pregunta_apertura', 'Pregunta de apertura',
 'Escribe un mensaje cálido y breve que retome la conversación o pregunte cómo estuvo la reunión o la situación. Muestra interés genuino. Hazle una pregunta abierta que invite a responder. NO menciones pago ni inscripción todavía.',
 NULL, 1, 2),

('empatia', 'Empatía y comprensión',
 'Escribe un mensaje empático y muy corto. Reconoce que la decisión toma tiempo o que probablemente está ocupado. Ofrece resolver dudas sin presionar. Cierra con una pregunta simple de sí/no para reducir fricción.',
 NULL, 1, 3),

('urgencia_suave', 'Urgencia suave con gatillo',
 'Escribe un mensaje que incorpora de forma natural el gatillo de urgencia activo (si existe). Tono de acompañamiento, no de presión. Recuerda el beneficio concreto y el tiempo disponible. Máximo 3 oraciones.',
 NULL, 2, 5),

('social_proof', 'Prueba social',
 'Menciona de forma general a alguien en una situación similar que ya se certificó y el resultado concreto que obtuvo (ingresos, reconocimiento, ascenso). Sin nombres reales. Cierra con una pregunta relacionada con su situación personal. Máximo 2-3 oraciones.',
 NULL, 2, 5),

('dato_util', 'Dato útil sobre certificación',
 'Comparte un dato concreto y útil sobre el proceso de certificación CONOCER (duración, documentos necesarios, beneficios laborales, costo-beneficio) que pueda interesarle. Tono informativo y genuinamente útil, sin referencia a mensajes anteriores. Cierra con una pregunta relacionada con su situación.',
 'nurturing', 2, 4),

('alternativa_canal', 'Canal alternativo',
 'Ofrece una alternativa diferente a seguir por chat: una llamada rápida de 5 minutos. Reconoce que quizás el chat no es el mejor formato para sus dudas. Tono: sin expectativa, dejando que él/ella decida. Sin referencia a mensajes previos. Máximo 2 oraciones.',
 NULL, 3, 5),

('cierre_respetuoso', 'Cierre respetuoso',
 'Escribe el mensaje más corto y humano posible. Máximo dos oraciones. Reconoce que quizás el momento no es el adecuado. Deja la puerta completamente abierta para cuando decida retomar el contacto. No menciones cuántas veces has escrito. Sin presión.',
 NULL, 4, 99),

('historia_exito', 'Historia de éxito inspiradora',
 'Escribe un mensaje breve que menciona en términos generales a alguien en una situación similar que ya completó el proceso y el resultado concreto que obtuvo (ingresos adicionales, reconocimiento laboral, ascenso). Sin nombres reales. Tono: inspirador, sin sonar a anuncio. Cierra con una pregunta directa sobre su situación.',
 NULL, 3, 5),

('scarcity_cupos', 'Escasez de cupos',
 'Menciona naturalmente la disponibilidad limitada de cupos en el siguiente grupo o periodo. Si hay gatillo de urgencia activo, incorpóralo. Sin sonar a presión de ventas. Recuerda el beneficio concreto. Máximo 2 oraciones más una pregunta al final.',
 NULL, 2, 4),

('momento_cambiado', 'Verificar si cambió el momento',
 'Escribe un mensaje muy breve que solo pregunta si el momento ha cambiado para él/ella. Nada de información nueva. Solo abre la puerta de forma simple y sin rodeos. Máximo 1-2 oraciones. Enfoque: preguntar si sigue interesado o si prefiere que lo contacten en otro momento.',
 NULL, 3, 99),

('recordatorio_pago', 'Recordatorio de pago cálido',
 'Escribe un recordatorio cálido y breve. Menciona que estás esperando el comprobante o que el proceso puede completarse en cualquier momento. Si hay gatillo de urgencia (precio o fecha límite), incorpóralo naturalmente. NO presiones. Tono de acompañamiento, no de cobrador.',
 'payment', 1, 2),

('consistencia', 'Principio de consistencia',
 'Usa la técnica de compromiso y consistencia de Cialdini. Menciona que el proceso está pendiente de su confirmación final, generando sensación de que ya comenzó. Si hay gatillo de urgencia, este es el momento de usarlo. Máximo 3 oraciones.',
 'payment', 2, 4);

-- ── 2. global_angle_prior — prior bayesiano de ángulos por tipo ───────────────
-- Mismo schema que global_timing_prior — reutiliza Thompson Sampling del timing motor.
-- alpha/(alpha+beta) ≈ tasa esperada de efectividad del ángulo para ese tipo.
-- Ángulos irrelevantes para un tipo tienen beta=19 (prácticamente excluidos).

CREATE TABLE global_angle_prior (
  tipo      TEXT    NOT NULL
            CHECK (tipo IN ('nurturing', 'conversational', 'payment', 'demo_agendado')),
  angulo_id UUID    NOT NULL REFERENCES followup_angulos(id) ON DELETE CASCADE,
  alpha     NUMERIC NOT NULL DEFAULT 2,
  beta      NUMERIC NOT NULL DEFAULT 2,
  PRIMARY KEY (tipo, angulo_id)
);

ALTER TABLE global_angle_prior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_global_angle_prior"
  ON global_angle_prior FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- Seed: priors iniciales calibrados por tipo × ángulo
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT fa.id AS angulo_id, fa.codigo, t.tipo
    FROM   followup_angulos fa
    CROSS JOIN (VALUES
      ('nurturing'), ('conversational'), ('payment'), ('demo_agendado')
    ) AS t(tipo)
  LOOP
    INSERT INTO global_angle_prior (tipo, angulo_id, alpha, beta)
    VALUES (
      rec.tipo,
      rec.angulo_id,
      -- alpha: mayor = más probable de ser útil en ese tipo
      CASE rec.tipo || ':' || rec.codigo
        WHEN 'nurturing:pregunta_apertura'      THEN 6
        WHEN 'nurturing:empatia'                THEN 5
        WHEN 'nurturing:dato_util'              THEN 7
        WHEN 'nurturing:social_proof'           THEN 5
        WHEN 'nurturing:scarcity_cupos'         THEN 5
        WHEN 'nurturing:historia_exito'         THEN 5
        WHEN 'nurturing:momento_cambiado'       THEN 4
        WHEN 'nurturing:alternativa_canal'      THEN 4
        WHEN 'nurturing:urgencia_suave'         THEN 4
        WHEN 'nurturing:cierre_respetuoso'      THEN 3
        WHEN 'nurturing:recordatorio_pago'      THEN 1
        WHEN 'nurturing:consistencia'           THEN 1
        WHEN 'conversational:pregunta_apertura' THEN 7
        WHEN 'conversational:empatia'           THEN 6
        WHEN 'conversational:dato_util'         THEN 5
        WHEN 'conversational:alternativa_canal' THEN 5
        WHEN 'conversational:social_proof'      THEN 4
        WHEN 'conversational:urgencia_suave'    THEN 4
        WHEN 'conversational:momento_cambiado'  THEN 4
        WHEN 'conversational:scarcity_cupos'    THEN 4
        WHEN 'conversational:historia_exito'    THEN 3
        WHEN 'conversational:cierre_respetuoso' THEN 3
        WHEN 'conversational:recordatorio_pago' THEN 1
        WHEN 'conversational:consistencia'      THEN 1
        WHEN 'payment:recordatorio_pago'        THEN 8
        WHEN 'payment:empatia'                  THEN 5
        WHEN 'payment:urgencia_suave'           THEN 5
        WHEN 'payment:consistencia'             THEN 5
        WHEN 'payment:social_proof'             THEN 4
        WHEN 'payment:pregunta_apertura'        THEN 4
        WHEN 'payment:cierre_respetuoso'        THEN 3
        WHEN 'payment:momento_cambiado'         THEN 3
        WHEN 'payment:alternativa_canal'        THEN 3
        WHEN 'payment:historia_exito'           THEN 2
        WHEN 'payment:scarcity_cupos'           THEN 2
        WHEN 'payment:dato_util'                THEN 1
        WHEN 'demo_agendado:pregunta_apertura'  THEN 8
        WHEN 'demo_agendado:empatia'            THEN 7
        WHEN 'demo_agendado:urgencia_suave'     THEN 5
        WHEN 'demo_agendado:cierre_respetuoso'  THEN 4
        WHEN 'demo_agendado:social_proof'       THEN 3
        WHEN 'demo_agendado:momento_cambiado'   THEN 3
        WHEN 'demo_agendado:alternativa_canal'  THEN 3
        WHEN 'demo_agendado:historia_exito'     THEN 2
        WHEN 'demo_agendado:dato_util'          THEN 2
        WHEN 'demo_agendado:scarcity_cupos'     THEN 2
        WHEN 'demo_agendado:recordatorio_pago'  THEN 1
        WHEN 'demo_agendado:consistencia'       THEN 1
        ELSE 2
      END,
      -- beta: mayor = menos probable; 19 ≈ score 0.05 (virtualmente excluido)
      CASE rec.tipo || ':' || rec.codigo
        WHEN 'nurturing:pregunta_apertura'      THEN 2
        WHEN 'nurturing:empatia'                THEN 3
        WHEN 'nurturing:dato_util'              THEN 2
        WHEN 'nurturing:social_proof'           THEN 4
        WHEN 'nurturing:scarcity_cupos'         THEN 4
        WHEN 'nurturing:historia_exito'         THEN 4
        WHEN 'nurturing:momento_cambiado'       THEN 5
        WHEN 'nurturing:alternativa_canal'      THEN 5
        WHEN 'nurturing:urgencia_suave'         THEN 5
        WHEN 'nurturing:cierre_respetuoso'      THEN 7
        WHEN 'nurturing:recordatorio_pago'      THEN 19
        WHEN 'nurturing:consistencia'           THEN 19
        WHEN 'conversational:pregunta_apertura' THEN 2
        WHEN 'conversational:empatia'           THEN 2
        WHEN 'conversational:dato_util'         THEN 3
        WHEN 'conversational:alternativa_canal' THEN 4
        WHEN 'conversational:social_proof'      THEN 4
        WHEN 'conversational:urgencia_suave'    THEN 5
        WHEN 'conversational:momento_cambiado'  THEN 5
        WHEN 'conversational:scarcity_cupos'    THEN 4
        WHEN 'conversational:historia_exito'    THEN 5
        WHEN 'conversational:cierre_respetuoso' THEN 7
        WHEN 'conversational:recordatorio_pago' THEN 19
        WHEN 'conversational:consistencia'      THEN 19
        WHEN 'payment:recordatorio_pago'        THEN 2
        WHEN 'payment:empatia'                  THEN 3
        WHEN 'payment:urgencia_suave'           THEN 3
        WHEN 'payment:consistencia'             THEN 3
        WHEN 'payment:social_proof'             THEN 4
        WHEN 'payment:pregunta_apertura'        THEN 4
        WHEN 'payment:cierre_respetuoso'        THEN 6
        WHEN 'payment:momento_cambiado'         THEN 6
        WHEN 'payment:alternativa_canal'        THEN 6
        WHEN 'payment:historia_exito'           THEN 8
        WHEN 'payment:scarcity_cupos'           THEN 8
        WHEN 'payment:dato_util'                THEN 19
        WHEN 'demo_agendado:pregunta_apertura'  THEN 1
        WHEN 'demo_agendado:empatia'            THEN 2
        WHEN 'demo_agendado:urgencia_suave'     THEN 3
        WHEN 'demo_agendado:cierre_respetuoso'  THEN 4
        WHEN 'demo_agendado:social_proof'       THEN 5
        WHEN 'demo_agendado:momento_cambiado'   THEN 6
        WHEN 'demo_agendado:alternativa_canal'  THEN 6
        WHEN 'demo_agendado:historia_exito'     THEN 8
        WHEN 'demo_agendado:dato_util'          THEN 9
        WHEN 'demo_agendado:scarcity_cupos'     THEN 9
        WHEN 'demo_agendado:recordatorio_pago'  THEN 19
        WHEN 'demo_agendado:consistencia'       THEN 19
        ELSE 4
      END
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── 3. lead_angle_posterior — posterior bayesiano por lead (lazy) ─────────────
-- Se crea al primer intento con un ángulo; igual que lead_timing_posterior.

CREATE TABLE lead_angle_posterior (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  angulo_id  UUID        NOT NULL REFERENCES followup_angulos(id) ON DELETE CASCADE,
  alpha      NUMERIC     NOT NULL DEFAULT 1,
  beta       NUMERIC     NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, angulo_id)
);

CREATE INDEX idx_lead_angle_posterior_lead ON lead_angle_posterior(lead_id);

ALTER TABLE lead_angle_posterior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_lead_angle_posterior"
  ON lead_angle_posterior FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

CREATE OR REPLACE FUNCTION update_lead_angle_posterior_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_lead_angle_posterior_updated_at
  BEFORE UPDATE ON lead_angle_posterior
  FOR EACH ROW EXECUTE FUNCTION update_lead_angle_posterior_updated_at();

-- ── 4. followup_templates — biblioteca de templates reutilizables ──────────────

CREATE TABLE followup_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT        NOT NULL
                               CHECK (tipo IN ('nurturing', 'conversational', 'payment', 'demo_agendado')),
  angulo_id        UUID        REFERENCES followup_angulos(id) ON DELETE SET NULL,
  texto            TEXT        NOT NULL,
  embedding        vector(1536),
  estado           TEXT        NOT NULL DEFAULT 'sugerido'
                               CHECK (estado IN ('sugerido', 'aprobado', 'conectado')),
  ghl_workflow_id  TEXT,
  uso_count        INT         NOT NULL DEFAULT 0,
  respuesta_count  INT         NOT NULL DEFAULT 0,
  conversion_count INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice principal del cascade: tipo + estado
CREATE INDEX idx_followup_templates_cascade ON followup_templates(tipo, estado);
-- Índice para listar por estado en el panel admin
CREATE INDEX idx_followup_templates_estado  ON followup_templates(estado);

ALTER TABLE followup_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_followup_templates"
  ON followup_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

CREATE OR REPLACE FUNCTION update_followup_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_followup_templates_updated_at
  BEFORE UPDATE ON followup_templates
  FOR EACH ROW EXECUTE FUNCTION update_followup_templates_updated_at();

-- ── 5. followup_template_uso_lead — tracking de uso por lead ──────────────────
-- PK compuesto evita enviar el mismo template dos veces al mismo lead.

CREATE TABLE followup_template_uso_lead (
  template_id    UUID        NOT NULL REFERENCES followup_templates(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  seguimiento_id UUID        REFERENCES seguimiento_lead(id) ON DELETE SET NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, lead_id)
);

CREATE INDEX idx_template_uso_lead_lead     ON followup_template_uso_lead(lead_id);
CREATE INDEX idx_template_uso_template      ON followup_template_uso_lead(template_id);

ALTER TABLE followup_template_uso_lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_template_uso_lead"
  ON followup_template_uso_lead FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- ── 6. ghl_approval_queue: columna template_id ────────────────────────────────
-- Vincula el item de aprobación con el template generado (si existe).
-- Permite promover Sugerido → Aprobado al resolver el item.

ALTER TABLE ghl_approval_queue
  ADD COLUMN template_id UUID REFERENCES followup_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_ghl_approval_template
  ON ghl_approval_queue(template_id)
  WHERE template_id IS NOT NULL;

-- ── 7. RPCs de incremento atómico ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_template_uso(p_template_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE followup_templates SET uso_count = uso_count + 1 WHERE id = p_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_template_respuesta(p_template_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE followup_templates SET respuesta_count = respuesta_count + 1 WHERE id = p_template_id;
END;
$$;
