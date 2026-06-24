-- Sprint 31 — Arquitectura de Objeciones de 3 Capas + Protocolo Setter

-- 1. setter_fases: las 6 fases del protocolo pre-cita
CREATE TABLE setter_fases (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden        smallint    NOT NULL UNIQUE CHECK (orden BETWEEN 1 AND 6),
  nombre       text        NOT NULL,
  descripcion  text        NOT NULL,
  regla_avance text        NOT NULL,
  preguntas_guia text[]   NOT NULL DEFAULT '{}',
  activo       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

INSERT INTO setter_fases (orden, nombre, descripcion, regla_avance, preguntas_guia) VALUES
(1,
 'Apertura elegante',
 'Saludo cálido y establecimiento de rapport. El lead se siente escuchado y cómodo para conversar.',
 'El lead ha respondido positivamente y muestra apertura a continuar la conversación.',
 ARRAY[
   '¿Cómo llegaste a conocer el tema de las certificaciones CONOCER?',
   '¿Qué te motivó a contactarnos hoy?'
 ]),
(2,
 'Diagnóstico de situación',
 'Explorar contexto laboral: área, rol, industria, experiencia previa con certificaciones.',
 'El lead ha compartido contexto claro sobre su situación laboral actual.',
 ARRAY[
   '¿En qué área trabajas actualmente?',
   '¿Has tenido alguna experiencia previa con procesos de certificación?'
 ]),
(3,
 'Identificación del dolor',
 'Descubrir qué problema quiere resolver: empleo, ascenso, requisito legal, reconocimiento profesional.',
 'El lead ha expresado al menos un dolor o necesidad real y tangible.',
 ARRAY[
   '¿Qué te impide avanzar en tu carrera sin esta certificación?',
   '¿Hubo algún momento en que la falta de certificación te cerró puertas?'
 ]),
(4,
 'Definición de situación deseada',
 'Que el lead visualice y verbalice su estado futuro tras obtener la certificación.',
 'El lead ha descrito su estado deseado y muestra motivación genuina hacia él.',
 ARRAY[
   '¿Cómo te imaginas en 6 meses con la certificación en mano?',
   '¿Qué puertas se abrirían para ti al obtenerla?'
 ]),
(5,
 'Cualificación',
 'Validar tres ejes: capacidad de inversión, compromiso de tiempo y fit real del servicio. Si no califica en alguno: despedida amable con leadmagnet y nurturing.',
 'El lead ha confirmado positivamente los tres ejes de cualificación.',
 ARRAY[
   '¿Tienes alguna restricción de tiempo o presupuesto que debamos considerar?',
   '¿Qué tan pronto te gustaría iniciar tu proceso de certificación?'
 ]),
(6,
 'Transición y agendamiento',
 'Presentar la sesión estratégica como el siguiente paso natural — nunca como "reunión de ventas".',
 'El lead ha aceptado agendar la sesión estratégica.',
 ARRAY[
   '¿Te gustaría que agendemos una sesión estratégica para identificar exactamente qué certificación es la ideal para tu perfil?',
   '¿Qué día de la semana suele ser mejor para ti para una videollamada de 30 minutos?'
 ]);

-- 2. Agregar estado del protocolo setter al lead
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS setter_fase_actual        smallint DEFAULT 1 CHECK (setter_fase_actual BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS setter_calificado         boolean  DEFAULT null,
  ADD COLUMN IF NOT EXISTS setter_razon_descalificacion text;

-- RLS
ALTER TABLE setter_fases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setter_fases_select_all"
  ON setter_fases FOR SELECT USING (true);

CREATE POLICY "setter_fases_admin_all"
  ON setter_fases FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'
  ));
