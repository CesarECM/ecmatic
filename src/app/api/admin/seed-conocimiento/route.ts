import { NextRequest, NextResponse } from "next/server";
import { crearRecurso } from "@/services/conocimiento";
import { createServiceClient } from "@/lib/supabase/service";

// Protección mínima: token en header Authorization
const SEED_TOKEN = process.env.SEED_SECRET_TOKEN ?? "ecmatic_seed_2026";

const SEED: Array<{ tipo: Parameters<typeof crearRecurso>[0]; titulo: string; contenido: string }> =
  [
    // ── FAQs ──────────────────────────────────────────────────────────────
    {
      tipo: "faq",
      titulo: "¿Qué es una certificación CONOCER?",
      contenido:
        "CONOCER es el Consejo Nacional de Normalización y Certificación de Competencias Laborales. Una certificación CONOCER es un reconocimiento oficial del gobierno mexicano que valida que una persona tiene las competencias necesarias para desempeñar una función laboral específica. Es reconocida por empresas, instituciones educativas y dependencias de gobierno en todo México.",
    },
    {
      tipo: "faq",
      titulo: "¿Cuánto tiempo toma el proceso de certificación?",
      contenido:
        "El proceso completo toma entre 2 y 4 semanas dependiendo del estándar de competencia. Incluye: orientación inicial (1 sesión), entrega de evidencias documentales (1 semana), evaluación presencial o en línea (1 día), y emisión del certificado digital (5-10 días hábiles posteriores a la evaluación).",
    },
    {
      tipo: "faq",
      titulo: "¿Qué documentos necesito para certificarme?",
      contenido:
        "Los documentos básicos son: identificación oficial vigente (INE/pasaporte), CURP, comprobante de domicilio, y evidencias de experiencia laboral en el área a certificar (constancias, contratos, reconocimientos). Algunos estándares requieren documentos adicionales específicos que te indicamos al inicio del proceso.",
    },
    {
      tipo: "faq",
      titulo: "¿La certificación CONOCER tiene validez oficial?",
      contenido:
        "Sí. Los certificados emitidos por Centro ECM tienen validez oficial ante la SEP y están registrados en el Sistema Nacional de Competencias (SNC). Son reconocidos por empresas, universidades y dependencias gubernamentales en toda la República Mexicana. El certificado no caduca y se puede verificar en línea.",
    },
    {
      tipo: "faq",
      titulo: "¿Puedo certificarme si no tengo título universitario?",
      contenido:
        "Sí, absolutamente. La certificación CONOCER evalúa competencias laborales demostradas en la práctica, no grados académicos. Está diseñada precisamente para reconocer el conocimiento y experiencia que las personas acumulan en su trabajo, independientemente de su nivel de escolaridad.",
    },
    {
      tipo: "faq",
      titulo: "¿Qué estándares de competencia maneja Centro ECM?",
      contenido:
        "Centro ECM está habilitado para evaluar estándares en áreas como: gestión empresarial, tecnologías de la información, educación y capacitación, salud y bienestar, y servicios. Contáctanos para confirmar disponibilidad del estándar específico que necesitas.",
    },
    {
      tipo: "faq",
      titulo: "¿Cómo es la evaluación?",
      contenido:
        "La evaluación la realiza un Evaluador Independiente certificado. Puede incluir: revisión de portafolio de evidencias (documentos, fotografías, proyectos), demostración práctica de habilidades, y/o entrevista de competencias. El evaluador emite un dictamen de Competente o Aún No Competente. En caso de no competente, puedes subsanar y volver a evaluarte sin costo adicional.",
    },
    {
      tipo: "faq",
      titulo: "¿Qué pasa si no paso la evaluación?",
      contenido:
        "Si el dictamen es 'Aún No Competente', el evaluador te indica exactamente qué evidencias complementar o qué habilidades reforzar. Tienes la oportunidad de subsanar y presentarte nuevamente sin costo adicional dentro del mismo proceso. La gran mayoría de nuestros candidatos logran certificarse en el primer intento.",
    },

    // ── Objeciones ────────────────────────────────────────────────────────
    {
      tipo: "objecion",
      titulo: "Objeción: 'Es muy caro'",
      contenido:
        "Entiendo que el costo es un factor importante. Considera que la certificación CONOCER es una inversión que se recupera rápidamente: muchas empresas pagan mejor a personal certificado, algunas incluso lo requieren para ciertos puestos. Además ofrecemos planes de pago y en ocasiones hay convocatorias con subsidio parcial. ¿Te cuento qué opciones de pago tenemos disponibles?",
    },
    {
      tipo: "objecion",
      titulo: "Objeción: 'No tengo tiempo'",
      contenido:
        "El proceso es más flexible de lo que parece. La mayor parte del trabajo (reunir evidencias) lo haces a tu propio ritmo desde casa. La evaluación presencial es solo un día. Muchos de nuestros candidatos trabajan tiempo completo y se certificaron sin mayor problema. ¿Cuál sería el mejor horario para ti para la sesión de orientación?",
    },
    {
      tipo: "objecion",
      titulo: "Objeción: 'No sé si me sirva / para qué me sirve'",
      contenido:
        "Es una pregunta muy válida. La certificación CONOCER sirve para: demostrar oficialmente tu experiencia ante empleadores, requisito en licitaciones y concursos gubernamentales, diferenciarte de otros candidatos en procesos de selección, y en algunos casos para acceder a programas de apoyo del gobierno. ¿En qué área trabajas? Así te puedo decir concretamente cómo te beneficia.",
    },
    {
      tipo: "objecion",
      titulo: "Objeción: 'Ya tengo título universitario, ¿para qué necesito esto?'",
      contenido:
        "El título universitario certifica conocimiento académico; la certificación CONOCER certifica competencias laborales demostradas. Son complementarios. De hecho, muchos profesionistas con título se certifican para acreditar habilidades específicas que su carrera no cubre formalmente, o porque su empleador lo solicita. Juntos fortalecen mucho tu perfil.",
    },
    {
      tipo: "objecion",
      titulo: "Objeción: 'Necesito pensarlo / consultarlo'",
      contenido:
        "Por supuesto, es una decisión importante. Para ayudarte a decidir: la orientación inicial es gratuita y sin compromiso, así puedes conocer exactamente el proceso y costos antes de comprometerte. ¿Te parece si agendamos esa sesión informativa y con eso tienes toda la información para decidir con calma?",
    },

    // ── Servicios ─────────────────────────────────────────────────────────
    {
      tipo: "servicio",
      titulo: "Proceso de Certificación CONOCER",
      contenido:
        "Servicio completo de certificación de competencias laborales ante CONOCER/SEP. Incluye: sesión de orientación y diagnóstico, guía para armado de portafolio de evidencias, evaluación por evaluador certificado, y gestión del trámite de certificado digital. Duración: 2-4 semanas. Válido para personas con experiencia laboral demostrable en el área a certificar.",
    },
    {
      tipo: "servicio",
      titulo: "Orientación y Diagnóstico Previo (Gratuito)",
      contenido:
        "Sesión informativa sin costo donde revisamos: qué estándar de competencia aplica para tu perfil, qué evidencias necesitas reunir, el cronograma del proceso, y resolvemos todas tus dudas. Disponible en línea o presencial en Morelia, Michoacán. Sin compromiso de pago posterior.",
    },
    {
      tipo: "servicio",
      titulo: "Asesoría para Armado de Portafolio",
      contenido:
        "Acompañamiento personalizado para identificar, organizar y presentar las evidencias que demuestran tus competencias. Muchos candidatos tienen la experiencia pero no saben cómo documentarla correctamente. Nuestros asesores te guían paso a paso para maximizar tus posibilidades de obtener el dictamen de Competente.",
    },

    // ── Templates WhatsApp ─────────────────────────────────────────────────
    {
      tipo: "template_wa",
      titulo: "Bienvenida inicial — primer contacto",
      contenido:
        "¡Hola! Soy el asistente de Centro ECM 👋 Vi que tienes interés en certificarte con CONOCER. Estoy aquí para ayudarte. Para orientarte mejor, ¿podrías decirme en qué área laboras o qué tipo de certificación estás buscando?",
    },
    {
      tipo: "template_wa",
      titulo: "Seguimiento — lead que pidió información pero no respondió",
      contenido:
        "Hola, te escribo del Centro ECM. Hace unos días te compartí información sobre las certificaciones CONOCER. ¿Pudiste revisarla? Con gusto resuelvo cualquier duda que tengas o agendamos una orientación gratuita cuando tengas un momento. 😊",
    },
  ];

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${SEED_TOKEN}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("recursos_conocimiento")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    return NextResponse.json({ message: "Seed ya aplicado", total: count });
  }

  const resultados: string[] = [];
  for (const item of SEED) {
    try {
      const recurso = await crearRecurso(item.tipo, item.titulo, item.contenido, "interno");
      // Aprobamos automáticamente los recursos del seed inicial
      await supabase
        .from("recursos_conocimiento")
        .update({ aprobado: true })
        .eq("id", recurso.id);
      resultados.push(`✓ ${item.titulo}`);
    } catch (err) {
      resultados.push(`✗ ${item.titulo}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ message: "Seed completado", resultados });
}
