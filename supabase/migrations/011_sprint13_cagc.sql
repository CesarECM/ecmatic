-- ============================================================
-- ECMatic · Sprint 13 · Modelo CAGC y Pipelines Multi-Embudo
-- ============================================================

-- ── S13.1: cagc_fases ───────────────────────────────────────
-- 17 fases del comprador — framework propietario CAGC de César
CREATE TABLE cagc_fases (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  numero              SMALLINT    NOT NULL UNIQUE CHECK (numero BETWEEN 0 AND 16),
  nombre              TEXT        NOT NULL,
  nombre_tecnico      TEXT        NOT NULL,
  descripcion         TEXT        NOT NULL,
  senales_deteccion   JSONB       NOT NULL DEFAULT '[]',
  acciones_empresa    JSONB       NOT NULL DEFAULT '[]',
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
INSERT INTO cagc_fases (numero, nombre, nombre_tecnico, descripcion, senales_deteccion, acciones_empresa) VALUES

(0, 'Inconsciencia', 'Pre-Awareness',
 'El comprador ni siquiera sabe que tiene un problema. Está en estado de equilibrio aparente. El dolor existe pero no está articulado; la ineficiencia está normalizada. El cerebro filtra activamente información que no encaja con su mundo actual (sesgo de confirmación).',
 '["sin búsqueda activa de certificación", "tema no relacionado con CONOCER", "menciona ineficiencias como algo normal", "no verbaliza necesidad de certificarse", "incomodidad difusa sin articular"]',
 '["publicar contenido que nombre dolores que el candidato aún no articuló", "usar storytelling de situaciones reconocibles, no de productos", "estar en canales de consumo pasivo (Reels, LinkedIn orgánico)", "campañas de awareness sin CTA de venta — sembrar la semilla", "usar datos del sector para provocar reflexión", "construir audiencias frías para remarketing futuro"]'),

(1, 'Activación', 'Trigger / Problema Reconocido',
 'Momento de quiebre: algo externo o interno detona la consciencia del problema. Puede ser un trigger interno (dolor acumulado, algo se rompió), externo (anuncio, post, competidor), social (alguien del entorno lo resolvió) o temporal (deadline, fecha límite). Estado emocional: inquietud, urgencia naciente.',
 '["primer mensaje entrante sin contexto claro", "menciona que necesita certificarse sin saber cómo", "viene de anuncio o referido", "expresa frustración reciente sobre su situación laboral", "pregunta vaga sobre qué es CONOCER", "alguien le recomendó certificarse"]',
 '["tener contenido optimizado para búsquedas de síntomas, no de soluciones", "publicar anuncios que nombren el dolor específico", "retargeting de usuarios que visitaron contenido relacionado", "estar activo en comunidades donde el candidato va a preguntar", "crear contenido de diagnóstico: ¿tienes este problema?", "activar Google Search con keywords de intención de problema"]'),

(2, 'Definición del Problema', 'Problem Framing',
 'El comprador intenta ponerle nombre a lo que siente. Articula el problema en palabras, aunque todavía de forma imprecisa. Busca lenguaje para describir su situación: googlea síntomas, no soluciones. Compara su situación actual vs. una ideal imaginada. Alta carga emocional: frustración, vergüenza, esperanza.',
 '["pregunta qué es CONOCER o para qué sirve", "dice que le dijeron que necesita certificarse pero no sabe bien por qué", "describe su situación laboral buscando que le digan si aplica", "pregunta si su experiencia o puesto califica", "mezcla certificación con título o curso universitario"]',
 '["crear contenido que articule el problema mejor de lo que el candidato podría solo", "usar el lenguaje exacto del candidato, no jerga técnica", "artículos tipo ¿Por qué certificarse con CONOCER?", "publicar contenido que valide que la necesidad es real y común", "desarrollar herramientas de autodiagnóstico: ¿aplico para certificarme?", "en anuncios: hablar del problema en primera persona del comprador"]'),

(3, 'Exploración Inicial', 'Information Seeking',
 'El comprador sale a buscar información de forma activa pero sin una solución específica en mente. Consulta fuentes de confianza: amigos, Google, YouTube, redes. Consume contenido educativo. No está comparando proveedores aún — está entendiendo el mapa del problema. Estado emocional: curiosidad, esperanza, algo de abrumamiento.',
 '["hace preguntas educativas generales sobre el proceso de certificación", "pregunta cuánto tiempo tarda o qué pasos tiene", "pregunta qué es un EC o qué es un portafolio", "no tiene urgencia ni fecha en mente", "quiere entender antes de comprometerse", "pide que le expliquen cómo funciona todo"]',
 '["ser la mejor fuente educativa del proceso CONOCER", "crear guías, videos, comparativas del proceso", "ofrecer lead magnet de alto valor a cambio del correo", "no vender aún — quien vende en esta fase espanta", "construir lista de nurturing con esta audiencia", "posicionarse como referencia antes de que compare proveedores"]'),

(4, 'Consciencia de Soluciones', 'Solution Awareness',
 'El comprador descubre que existen categorías de soluciones para su problema. Aprende que hay opciones: distintos CEs, métodos, proveedores. Posible momento "aha": esto tiene solución. Todavía no hay marcas en mente — hay categorías. Quien educa en esta fase es percibido como autoridad.',
 '["pregunta si puede certificarse con diferente organismo o por su cuenta", "pregunta diferencia entre estándares CONOCER", "compara proceso de certificación vs. curso universitario", "menciona que encontró varias opciones y no sabe cuál elegir", "pregunta si todos los centros son iguales"]',
 '["crear contenido que explique los tipos de solución que existen", "publicar comparativas honestas de enfoques sin sesgarse todavía", "posicionarse como quien entiende el panorama completo", "usar casos de uso para mostrar cuándo aplica cada opción", "aparecer en directorios y listas del sector", "webinars educativos: todo lo que debes saber antes de certificarte"]'),

(5, 'Construcción de Criterios', 'Criteria Formation',
 'El comprador empieza a definir — consciente o inconscientemente — qué características debe tener la solución ideal. Define prioridades: precio, velocidad, garantías, reputación, facilidad. Influenciado por sus valores y experiencias pasadas. Sesgo de anclaje: los primeros datos que conoce se vuelven referencia de comparación.',
 '["pregunta qué incluye el servicio exactamente", "pregunta si hay garantía de aprobación o qué pasa si no pasa", "compara precio con otro CE que le cotizaron antes", "pregunta cuánto tiempo tiene que dedicar", "pregunta si hay acompañamiento o lo dejan solo", "pregunta por la reputación o experiencia del centro"]',
 '["publicar contenido tipo qué buscar en un centro de evaluación", "crear comparativas donde los puntos fuertes del CE sean los criterios", "educar sobre criterios que el candidato no consideraba", "reencuadrar criterios donde los competidores son mejores", "casos de éxito segmentados por perfil de candidato", "ofrecer sesión gratuita de diagnóstico para conocer sus criterios"]'),

(6, 'Evaluación de Opciones', 'Consideration Set',
 'El comprador arma un shortlist de opciones y empieza a evaluarlas en paralelo. Visita sitios, lee reseñas, ve demos, pide recomendaciones. Compara precio, propuesta de valor, credibilidad. El miedo a tomar la decisión equivocada crece. Busca señales de confianza: casos de éxito, garantías, prueba social.',
 '["dice que está comparando con otro CE o cotizando con varios", "pide cotización formal o desglose de costos", "pregunta qué incluye vs. lo que no incluye", "menciona lo que vio en el sitio web o en Google", "hace preguntas muy específicas sobre el proceso y los entregables", "pide testimonios o casos de éxito de otros candidatos"]',
 '["tener página de comparativa directa vs. competidores", "testimonios y casos de éxito accesibles y creíbles", "ofrecer orientación gratuita sin fricción", "respuesta rápida a consultas — quien tarda pierde", "retargeting activo a quienes visitaron la página de precios", "propuestas personalizadas, no genéricas"]'),

(7, 'Validación Social', 'Social Proof Seeking',
 'Antes de decidir, el comprador busca confirmar que otros como él tomaron la misma decisión y les fue bien. Lee reseñas, busca testimonios, pregunta en grupos, pide referencias. Escucha más a pares que a la marca. El miedo al error supera al deseo de beneficio: quiere una decisión justificable ante otros.',
 '["pide hablar con alguien que ya se certificó", "pregunta si tienen reseñas en Google o Facebook", "menciona que le preguntó a un conocido y qué le dijeron", "pregunta cuántos candidatos han certificado", "busca confirmar con alguien externo antes de decidir", "pide referencia de un candidato que haya pasado por el proceso"]',
 '["banco robusto de testimonios en video y texto segmentados por perfil", "casos de éxito con números concretos", "reseñas activas en Google y Facebook", "facilitar que el prospecto hable con un candidato actual como referencia", "mostrar número de candidatos certificados", "programa de referidos que incentive a egresados a hablar"]'),

(8, 'Ansiedad Pre-Decisión', 'Choice Anxiety',
 'El comprador está al borde de decidir pero duda. Es el momento de mayor tensión psicológica. ¿Y si me equivoco? El miedo al arrepentimiento paraliza. Busca excusas para posponer: "necesito más información", "voy a pensarlo". Pequeños detalles se amplifican. En compras de alto valor puede haber semanas en esta fase.',
 '["dice que lo va a pensar", "dice que necesita consultarlo con su pareja, jefe o empresa", "pregunta de nuevo cosas que ya le explicamos", "pide más tiempo sin razón clara", "expresa miedo a no pasar la evaluación", "pregunta qué pasa si no cumple con los requisitos", "compara de nuevo con otra opción que ya descartó antes"]',
 '["garantías de reembolso o proceso sin riesgo", "testimonios de personas que también dudaron y se alegraron", "simplificar el proceso de inscripción al máximo", "comunicación de soporte disponible: WhatsApp, teléfono", "crear urgencia real y ética: plazas limitadas, precio que sube, fecha de cierre", "ofrecer opciones que reduzcan el compromiso inicial: etapa de orientación gratuita primero"]'),

(9, 'Decisión de Compra', 'Purchase Decision',
 'El comprador toma la decisión final. La decisión rara vez es 100% racional: las emociones tienen el peso final. Se activa justificación racional: el comprador busca razones lógicas para validar lo que emocionalmente ya quería. Factores de último momento: facilidad del proceso, fricción en el pago, atención recibida. La decisión puede revertirse hasta el último segundo.',
 '["dice que ya se decidió o que quiere proceder", "pregunta cómo pagar o a dónde depositar", "pregunta cuándo empezamos", "pide los datos bancarios o el link de pago", "pregunta qué necesita tener listo para arrancar", "tono cambia de evaluación a planificación"]',
 '["proceso de pago sin fricción: pocos pasos, múltiples métodos", "no introducir elementos nuevos de duda en el último momento", "reforzar la decisión emocional con lenguaje que confirme que están haciendo lo correcto", "tener al vendedor disponible para el cierre", "usar escasez y urgencia de forma ética para activar la decisión", "una vez que dice sí: confirmar inmediatamente con calidez"]'),

(10, 'Acto de Compra', 'Transaction Moment',
 'El momento en que se ejecuta la transacción. Aunque parece el final, es en realidad el inicio de la relación real. Alivio momentáneo: "ya lo hice". Inmediatamente después, el cerebro cambia de modo decidiendo a modo evaluando. Las expectativas se vuelven concretas: ahora sí hay algo que comprobar.',
 '["pago confirmado vía Stripe o comprobante subido", "webhook de pago recibido", "lead movido a etapa Comprado", "acceso creado en SmartBuilderEC", "primer mensaje post-pago enviado"]',
 '["confirmación inmediata por WhatsApp y email: clara, cálida, profesional", "instrucciones claras de los siguientes pasos — el candidato no debe adivinar", "primer gesto de sorpresa positiva: recurso adicional, mensaje personal", "no desaparecer — el silencio post-compra genera disonancia inmediata", "mensaje de bienvenida del equipo en las primeras 24 horas"]'),

(11, 'Disonancia Post-Compra', 'Buyer''s Remorse',
 '¿Tomé la decisión correcta? El comprador busca activamente información que confirme que hizo bien. Mayor en compras de alto valor o cuando había muchas alternativas. Puede llevar a solicitar cancelación o dejar mala reseña. En B2B: miedo a que superiores cuestionen la decisión.',
 '["pregunta si puede cancelar o si hay devolución", "hace preguntas que ya se le respondieron antes del pago", "tono inseguro o dubitativo en los primeros mensajes post-pago", "silencio total después del pago (mala señal)", "pregunta cuándo verá resultados concretos", "menciona que ya no está tan seguro"]',
 '["email de bienvenida que valide la decisión: miles de personas como tú ya lo viven", "contenido post-compra que refuerce por qué fue una buena elección", "testimonio de alguien que también dudó y está feliz", "atención proactiva: no esperar a que el candidato tenga problemas, contactarlo primero", "garantías visibles y accesibles para reducir el riesgo percibido residual", "evitar cualquier comunicación de ventas agresiva en este período"]'),

(12, 'Evaluación de la Experiencia', 'Post-Purchase Evaluation',
 'El comprador compara lo que esperaba vs. lo que recibió. Se activa el modelo de expectativas: confirmación positiva = satisfacción, negativa = insatisfacción. El servicio post-venta tiene enorme peso: velocidad de respuesta, acompañamiento, resultados. Una mala experiencia aquí destruye todo lo construido antes.',
 '["hace preguntas sobre su avance en SmartBuilderEC", "menciona dificultades con la plataforma o el proceso", "pregunta si va bien o si va a tiempo", "expresa frustración con algún paso del proceso", "compara su experiencia con lo que esperaba o le prometieron", "solicita apoyo adicional no contemplado originalmente"]',
 '["gestionar activamente las expectativas desde antes de la compra", "encuestas de satisfacción en el momento correcto", "asegurarse de que el candidato esté activando la plataforma correctamente", "atender quejas de forma rápida y generosa — un problema bien resuelto crea más lealtad", "documentar los resultados que el candidato está obteniendo y mostrárselos", "reuniones de seguimiento para revisar avance y detectar insatisfacción temprano"]'),

(13, 'Satisfacción o Insatisfacción', 'Outcome Processing',
 'El veredicto interno del comprador después de evaluar la experiencia. Satisfacción: sensación de acierto reforzada, disposición a volver a comprar y recomendar. Insatisfacción: frustración, sensación de haber sido engañado, desarrollo de rechazo de marca. En B2B puede escalar y dañar la relación comercial completa.',
 '["expresa que está contento con el proceso o que va bien", "solicita cancelación, devolución o queja formal", "responde positivamente a encuestas o mensajes de seguimiento", "comparte su avance espontáneamente", "menciona a alguien que también podría querer certificarse (señal de satisfacción)", "silencio prolongado combinado con bajo avance en SBC (señal de insatisfacción)"]',
 '["si hay satisfacción: pedir reseña o testimonio mientras el momentum es alto", "si hay satisfacción: ofrecer referidos — ¿conoces a alguien que también se beneficiaría?", "si hay satisfacción: presentar oportunidades de upsell de forma natural", "si hay insatisfacción: identificarla antes de que el candidato se queje públicamente", "si hay insatisfacción: responder con generosidad, no con defensas", "si hay insatisfacción: convertir la queja en oportunidad de recuperar la confianza"]'),

(14, 'Retención y Uso Continuo', 'Adoption & Retention',
 'El comprador usa el producto/servicio de forma recurrente y lo integra a su flujo. Formación de hábitos de uso. Descubrimiento de valor no anticipado: sorpresa positiva = deleite. Entre más lo usa, más valioso se vuelve (efecto IKEA). El comprador construye propiedad psicológica y se convierte en campeón interno.',
 '["avance sostenido y regular en SmartBuilderEC", "hace preguntas sobre cómo aprovechar mejor la plataforma", "menciona que ya integró el proceso a su rutina", "pregunta sobre otros estándares o servicios adicionales", "responde con rapidez a mensajes del equipo", "inicia conversaciones por su cuenta para resolver dudas de avance"]',
 '["onboarding progresivo: enseñar funcionalidades nuevas cuando ya dominó las básicas", "comunicación continua de valor: tips de uso, actualizaciones, recursos adicionales", "identificar a los candidatos más comprometidos y nutrirlos con atención especial", "usar datos de comportamiento para detectar señales de churn temprano", "reuniones de seguimiento regulares con reporte de avance", "celebrar hitos con el candidato: primer módulo completado, primer evidencia aprobada"]'),

(15, 'Lealtad', 'Loyalty',
 'El comprador elige repetir con la misma marca por encima de las alternativas disponibles. La lealtad reduce la necesidad de volver a pasar por todo el proceso de decisión. Confianza acumulada: reduce el riesgo percibido de futuras compras. Cambiar de proveedor genera resistencia: pérdida de lo conocido, costos de aprendizaje, incertidumbre.',
 '["ya se certificó y vuelve a preguntar por otro estándar", "recomienda el centro sin que se lo pidan", "menciona que ya refirió a alguien", "responde positivamente cuando se le contacta para nuevos servicios", "tiene historial de más de una compra o proceso completado", "regresa después de un tiempo con una nueva necesidad"]',
 '["facilitar la recompra: el candidato no debe volver a explicar su historia", "experiencia preferencial para candidatos recurrentes: atención prioritaria, descuentos", "personalización creciente: la marca debe conocer más al candidato con el tiempo", "recordatorios proactivos de renovación o nuevos estándares antes de que lo pida", "sorpresas ocasionales: reconocimiento, detalle, acceso anticipado a nuevos servicios"]'),

(16, 'Advocacy', 'Brand Evangelism',
 'El comprador se convierte en promotor activo de la marca. La fase más valiosa y más escasa. La identidad del comprador se fusiona parcialmente con la marca. El acto de recomendar refuerza su propia decisión de compra (reduce disonancia cognitiva residual). Movidos por genuino deseo de ayudar a otros, no por incentivo económico.',
 '["refirió activamente a otra persona que llegó al CE por su recomendación", "dejó reseña positiva en Google o Facebook sin que se lo pidieran", "defiende al CE cuando alguien lo cuestiona en conversaciones", "comparte contenido del CE en sus redes", "se ofrece a dar su testimonio o ser caso de éxito", "lleva a familiares o colegas directamente al proceso"]',
 '["programa de referidos estructurado con incentivo claro para ambas partes", "convertir al advocate en caso de éxito público: entrevista, artículo, video", "darle herramientas para recomendar: mensajes preescritos, link de referido único", "reconocimiento público en redes sociales y sitio web", "acceso exclusivo a novedades y servicios nuevos antes que nadie", "nunca dar por sentado al advocate — un trato descuidado en esta fase es el peor desperdicio"]');
