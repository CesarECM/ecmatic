-- ============================================================
-- ECMatic · Sprint 13 · Modelo CAGC y Pipelines Multi-Embudo
-- ============================================================

-- ── S13.1: cagc_fases ───────────────────────────────────────
-- 17 fases del comprador — framework propietario CAGC de César
CREATE TABLE cagc_fases (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  numero              SMALLINT    NOT NULL UNIQUE CHECK (numero BETWEEN 0 AND 16),
  nombre              TEXT        NOT NULL,
  descripcion         TEXT        NOT NULL,
  senales_deteccion   JSONB       NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cagc_fases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cagc_fases_read_authenticated" ON cagc_fases
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cagc_fases_write_admin" ON cagc_fases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "cagc_fases_service_role" ON cagc_fases
  FOR ALL USING (auth.role() = 'service_role');

-- ── S13.1: lead_cagc_estado ──────────────────────────────────
-- Estado CAGC por lead: fase actual, confianza e historial de transiciones
CREATE TABLE lead_cagc_estado (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  fase_numero   SMALLINT      NOT NULL DEFAULT 0
                              REFERENCES cagc_fases(numero),
  confianza     DECIMAL(3,2)  NOT NULL DEFAULT 0.5
                              CHECK (confianza BETWEEN 0 AND 1),
  historial     JSONB         NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_cagc_unique UNIQUE (lead_id)
);

CREATE INDEX lead_cagc_lead_idx  ON lead_cagc_estado (lead_id);
CREATE INDEX lead_cagc_fase_idx  ON lead_cagc_estado (fase_numero);

ALTER TABLE lead_cagc_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_cagc_admin" ON lead_cagc_estado
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

CREATE POLICY "lead_cagc_service_role" ON lead_cagc_estado
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER lead_cagc_updated_at BEFORE UPDATE ON lead_cagc_estado
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ── Seed: 17 fases CAGC precargadas ─────────────────────────
INSERT INTO cagc_fases (numero, nombre, descripcion, senales_deteccion) VALUES
(0,  'Inconsciencia',
     'El prospecto no sabe que necesita o existe la certificación CONOCER.',
     '["no menciona certificación", "tema no relacionado", "pregunta genérica sobre trabajo"]'),

(1,  'Primer contacto',
     'Recibió un primer toque del servicio (anuncio, referido, búsqueda). Aún sin respuesta activa.',
     '["primer mensaje entrante", "viene de anuncio o referido", "saludo inicial sin contexto"]'),

(2,  'Curiosidad inicial',
     'Muestra interés espontáneo. Pregunta qué es la certificación o para qué sirve.',
     '["¿qué es CONOCER?", "¿para qué sirve?", "¿qué beneficios tiene?", "pregunta abierta sobre el servicio"]'),

(3,  'Investigación activa',
     'Busca detalles concretos: proceso, duración, requisitos, diferencias entre estándares.',
     '["¿cuánto tiempo tarda?", "¿qué necesito?", "¿cuáles estándares hay?", "¿cómo funciona el proceso?"]'),

(4,  'Comparación de opciones',
     'Menciona o pregunta por otras opciones, competidores o alternativas al servicio.',
     '["mencionó competidor", "¿y si lo hago por otro lado?", "comparando precios", "¿qué los diferencia?"]'),

(5,  'Duda técnica activa',
     'Tiene preguntas específicas sobre el proceso de evaluación, portafolio o EC.',
     '["¿qué es un EC?", "¿cómo es la evaluación?", "¿qué piden de portafolio?", "¿hay examen?"]'),

(6,  'Objeción de precio',
     'La barrera económica es el tema central. Evalúa si puede o quiere pagar.',
     '["¿cuánto cuesta?", "está caro", "¿hay descuento?", "no tengo presupuesto", "¿a cuántos meses?"]'),

(7,  'Evaluación consciente',
     'Pesa pros y contras. Pregunta por garantías, resultados, casos de éxito.',
     '["¿funciona realmente?", "¿qué pasa si no paso?", "¿tienen casos de éxito?", "quiero pensarlo"]'),

(8,  'Intención de compra',
     'Señales claras de querer avanzar: pregunta por formas de pago, próximos pasos.',
     '["¿cómo pago?", "¿cuándo empezamos?", "quiero inscribirme", "¿qué sigue?", "ya me convencí"]'),

(9,  'Negociación',
     'Busca condiciones especiales, ajuste de precio, plan de pagos o fecha diferida.',
     '["¿me hacen precio?", "¿puedo pagar en partes?", "¿pueden esperar?", "si me dan X, acepto"]'),

(10, 'Decisión',
     'Ha decidido comprar. Esperando solo el link de pago o instrucciones finales.',
     '["mándame el link", "ya me decidí", "voy a pagar hoy", "¿a dónde deposito?"]'),

(11, 'Compra realizada',
     'Pago confirmado vía Stripe o comprobante manual registrado en el sistema.',
     '["pago confirmado en BD", "webhook Stripe recibido", "comprobante subido por vendedor"]'),

(12, 'Onboarding',
     'Iniciando el proceso en SmartBuilderEC. Recibió acceso y primeras instrucciones.',
     '["acceso creado en SBC", "primer ingreso a plataforma", "revisando materiales iniciales"]'),

(13, 'En proceso de certificación',
     'Avanzando activamente en SmartBuilderEC. Completa módulos y evidencias.',
     '["avance > 0% en SBC", "subiendo evidencias", "preguntas sobre evaluación en curso"]'),

(14, 'Certificación completada',
     'Terminó el proceso de evaluación. Esperando o recibió ya su certificado CONOCER.',
     '["avance 100% en SBC", "evaluación entregada", "esperando resultado", "certificado emitido"]'),

(15, 'Satisfacción post-certificación',
     'Experiencia positiva confirmada. Responde encuestas o muestra satisfacción explícita.',
     '["encuesta respondida positivamente", "NPS alto implícito", "agradecimiento espontáneo"]'),

(16, 'Advocacy',
     'Refiere activamente a otros. Comparte su experiencia y recomienda el servicio.',
     '["refirió a otro candidato", "dejó reseña positiva", "comparte contenido del CE", "embajador activo"]');
