import { formatearGatillosParaPrompt } from "@/services/gatillos";
import { formatearIdentidadParaPrompt } from "@/services/identidad-marca";
import { generarBloqueEstrategiaPrecio, type DatosPrecioServicio, type LinkPago } from "./estrategia-precio";
import { formatearContextoPipelineParaPrompt } from "./contexto-pipeline";
import { formatearRolDinamicoParaPrompt, type RolPorServicio } from "@/services/rol-dinamico";
import { instruccionReglaOroCierre } from "./regla-oro-cierre";
import { formatearReglasParaPrompt, type ReglaConversacional } from "@/services/reglas-conversacionales";
import { formatearCuentaParaPrompt } from "@/services/cuentas-bancarias";
import { formatearRecursoKB, type RecursoKB } from "./kb-search";
import type { ModoRevelacion } from "./detector-revelacion";
import type { SlotDisponible } from "@/services/citas";
import type { EstadoSetter } from "./setter-protocol";
import type { ProtocoloObjecion } from "./protocolo-objecion";
import type { PipelineRuta } from "@/lib/supabase/types";

export interface ContextoLead {
  nombre:        string | null;
  temperamento:  string | null;
  pipelineStage: string;
  compraPreviaa: boolean;
  historial:     string;
  pipelineRuta?:     PipelineRuta;
  faseCAGC?:         number;
  etiquetas?:        string[];
  slotsDisponibles?: SlotDisponible[];
  meetLink?:         string | null;
  canal_origen?:     string | null;
  imagen_activa_url?: string | null;
  setterEstado?:      EstadoSetter | null;
  protocoloObjecion?: ProtocoloObjecion | null;
  rolesDinamicos?:    RolPorServicio[];
  modoRevelacion?:    ModoRevelacion;
  leadId?:       string;
  memoriaIA?:    string | null;
  esAutoReply?:  boolean;
  tagsGhl?:      string[];
  modoPreSesion?: { fechaIso: string; meetLink?: string | null };
}

// MPS-16 S60 — prioridad: match temperamento (+2) + match etapa (+1) > universales (0).
export function seleccionarPracticasContextuales(
  practicas: { contenido: string; contextos_aplica: { temperamento?: string[]; pipeline_stage?: string[] } | null }[],
  temperamento: string | null,
  pipelineStage: string,
  limite = 3,
): { contenido: string }[] {
  const scored = practicas.map((p, idx) => {
    const ctx = p.contextos_aplica;
    let match = 0;
    if (ctx) {
      if (temperamento && ctx.temperamento?.includes(temperamento)) match += 2;
      if (ctx.pipeline_stage?.includes(pipelineStage)) match += 1;
    }
    return { p, match, idx };
  });
  scored.sort((a, b) => b.match - a.match || a.idx - b.idx);
  return scored.slice(0, limite).map(({ p }) => ({ contenido: p.contenido }));
}

export interface PagoServicioItem {
  titulo:    string;
  id:        string;
  pago:      { url: string } | null;
  svc:       DatosPrecioServicio | null;
  todosLinks: LinkPago[];
}

export interface ParamsPrompt {
  identidad:        Parameters<typeof formatearIdentidadParaPrompt>[0] | null;
  serviciosAncla:   RecursoKB[];
  pagosServicios:   PagoServicioItem[];
  cuentasActivas:   Parameters<typeof formatearCuentaParaPrompt>[0][];
  relacionesLinea:  string;
  kb:               RecursoKB[];
  todasPracticas:   { contenido: string; contextos_aplica: { temperamento?: string[]; pipeline_stage?: string[] } | null }[];
  gatillos:         Parameters<typeof formatearGatillosParaPrompt>[0];
  sugerenciaMatriz: string | null;
  contextoPipeline: Parameters<typeof formatearContextoPipelineParaPrompt>[0];
  hintCalidad:      string | null;
  variantePrompt:   { variante: string; texto: string } | null;
  reglasAplicables: ReglaConversacional[];
  imagenActivaUrl:  string | null;
  contexto:         ContextoLead;
}

const TZ = "America/Mexico_City";

export interface SystemPromptBlocks {
  estable:  string;
  dinamico: string;
}

export function construirSystemPrompt(params: ParamsPrompt): SystemPromptBlocks {
  const { contexto, identidad, serviciosAncla, pagosServicios, cuentasActivas } = params;
  const modoRevelacion = contexto.modoRevelacion ?? "oculto";

  // Servicios
  const serviciosTextoCompleto = serviciosAncla.map(formatearRecursoKB).join("\n\n");
  const serviciosTextoInterno  = serviciosAncla.map((r) => {
    const p: string[] = [];
    if (r.caracteristicas) p.push(`Características: ${r.caracteristicas}`);
    if (r.beneficios)      p.push(`Beneficios: ${r.beneficios}`);
    if (r.ventajas)        p.push(`Ventajas competitivas: ${r.ventajas}`);
    if (r.para_quien_es)   p.push(`Perfil ideal: ${r.para_quien_es}`);
    return p.join("\n") || r.contenido;
  }).join("\n\n");

  const pagosConLink      = pagosServicios.filter((p) => p.pago !== null);
  const serviciosConPrecio = pagosServicios.filter((p) => p.svc?.precio_centavos != null);
  const svcPrincipal      = (pagosServicios[0]?.svc as DatosPrecioServicio | null) ?? null;
  const linksParaEstrategia: LinkPago[] = (pagosServicios[0]?.todosLinks ?? []).map((p) => ({
    tipo: p.tipo, url: p.url, nombre: p.nombre,
  }));
  const bloqueEstrategia = (modoRevelacion === "revelado" && svcPrincipal)
    ? generarBloqueEstrategiaPrecio(svcPrincipal, linksParaEstrategia, contexto.historial)
    : "";

  const cuentasBancariasLinea = (cuentasActivas.length > 0 && serviciosAncla.length > 0)
    ? ["\nTRANSFERENCIA BANCARIA (solo ofrécela si el lead no puede usar los links de pago):",
        ...cuentasActivas.map((c) => `• ${formatearCuentaParaPrompt(c)}`),
        serviciosConPrecio.length > 0
          ? `Montos: ${serviciosConPrecio.map((s) => `${s.titulo}: $${((s.svc?.precio_centavos ?? 0) / 100).toLocaleString("es-MX")} MXN`).join(" | ")}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const anclaLinea = serviciosAncla.length > 0
    ? modoRevelacion === "revelado"
      ? [`\nSERVICIO(S) QUE ESTÁS VENDIENDO — revisa esta información antes de responder:\n${serviciosTextoCompleto}\nToda tu respuesta debe estar orientada a vender este/estos servicio(s).`,
          pagosConLink.length > 0 && !bloqueEstrategia
            ? `\nLINKS DE PAGO:\n${pagosConLink.map((p) => `• ${p.titulo}: ${p.pago!.url}`).join("\n")}` : "",
          cuentasBancariasLinea, bloqueEstrategia].filter(Boolean).join("\n")
      : `\nCONTEXTO INTERNO DEL SERVICIO (CONFIDENCIAL — no revelar nombre, código EC ni precio):\n${serviciosTextoInterno}`
    : "";

  // Prácticas de venta contextuales
  const practicas    = seleccionarPracticasContextuales(params.todasPracticas, contexto.temperamento, contexto.pipelineStage);
  const recursosTexto = params.kb.length > 0
    ? params.kb.map(formatearRecursoKB).join("\n\n")
    : "No se encontraron recursos específicos en la KB. Responde con información general del Centro ECM.";
  const practicasTexto = practicas.length
    ? `\nMEJORES PRÁCTICAS DE VENTA APLICABLES:\n${practicas.map((p) => `• ${p.contenido}`).join("\n")}` : "";

  // Líneas de contexto
  const brandLinea        = identidad ? `\nIDENTIDAD DE MARCA:\n${formatearIdentidadParaPrompt(identidad)}` : "";
  const pipelineContexto  = formatearContextoPipelineParaPrompt(params.contextoPipeline, contexto.pipelineStage);
  const imagenLinea       = params.imagenActivaUrl
    ? `\nIMAGEN DEL SERVICIO DISPONIBLE:\nURL: ${params.imagenActivaUrl}\nEsta imagen puede acompañar tu respuesta si el canal lo permite. No la menciones como "imagen"; úsala para enriquecer tu argumento visual.` : "";
  const meetLinkLinea     = contexto.meetLink
    ? ["\nCITA CREADA — COMPARTE EL LINK CON ENTUSIASMO:",
        `El sistema generó este enlace de Google Meet: ${contexto.meetLink}`,
        "Compártelo de forma cálida y natural. Menciona la fecha y hora en horario del Centro de México.",
        "Dile al lead que su solicitud ya está registrada y que en breve el equipo la confirma. Usa tono entusiasta y cercano."].join("\n") : "";
  const slotsLinea        = contexto.slotsDisponibles?.length
    ? ["\nHORARIOS DISPONIBLES — preséntaselos de forma conversacional, no como lista rígida:",
        ...contexto.slotsDisponibles.map((s, i) => {
          const fecha = s.inicio.toLocaleDateString("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
          const hora  = s.inicio.toLocaleTimeString("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
          return `${i + 1}. ${fecha} a las ${hora}`;
        }),
        "\nREGLAS DE ZONA HORARIA (seguir siempre):",
        "• Todos los horarios son en horario del Centro de México — usa exactamente esa expresión, nunca abrevies a 'CDMX' ni 'hora local'.",
        "• Si el lead menciona estar en otra ciudad, estado o país con huso horario diferente, convierte el horario y acláraselo de forma natural.",
        "• Cuando el lead elija un horario, confírmalo con calidez y entusiasmo."].join("\n") : "";
  const setterLinea       = contexto.setterEstado
    ? [`\nPROTOCOLO SETTER — FASE ${contexto.setterEstado.faseNueva}: ${contexto.setterEstado.nombreFase}`,
        `Objetivo: ${contexto.setterEstado.descripcionFase}`,
        contexto.setterEstado.preguntaGuia
          ? `Pregunta guía (úsala de forma natural, nunca como interrogatorio): "${contexto.setterEstado.preguntaGuia}"` : "",
      ].filter(Boolean).join("\n") : "";
  const objecionLinea     = contexto.protocoloObjecion?.instruccion ? `\n${contexto.protocoloObjecion.instruccion}` : "";
  const rolLinea          = contexto.rolesDinamicos?.length ? formatearRolDinamicoParaPrompt(contexto.rolesDinamicos) : "";
  const hintCalidadLinea  = params.hintCalidad
    ? `\nHINT DE CALIDAD HISTÓRICA (basado en conversaciones previas con este lead):\n${params.hintCalidad}` : "";
  const varianteLinea     = params.variantePrompt
    ? `\nINSTRUCCIÓN ADICIONAL (experimento activo — variante ${params.variantePrompt.variante.toUpperCase()}):\n${params.variantePrompt.texto}` : "";
  const memoriaLinea      = contexto.memoriaIA
    ? `\nMEMORIA DE SESIONES ANTERIORES CON ESTE LEAD:\n${contexto.memoriaIA}` : "";
  const matrizLinea       = params.sugerenciaMatriz
    ? `\nSUGERENCIA DE MATRIZ (usa como guía, adapta a la conversación):\n${params.sugerenciaMatriz}` : "";
  const reglasLinea       = formatearReglasParaPrompt(params.reglasAplicables);
  const faseCagcLinea     = contexto.faseCAGC !== undefined
    ? `- Fase de compra CAGC: ${contexto.faseCAGC} — guía el tono y objetivo de tu respuesta según este momento del comprador` : "";
  const etiquetasLinea    = contexto.etiquetas?.length
    ? `- Etiquetas del lead: ${contexto.etiquetas.join(", ")}` : "";
  const autoReplyLinea    = contexto.esAutoReply
    ? "\n- CONTEXTO CLAVE: El mensaje recibido es una respuesta automática de WhatsApp Business del lead (saludo o bienvenida automática, no una consulta real). NOSOTROS lo contactamos a él — él NO nos contactó. NUNCA preguntes '¿En qué puedo ayudarte?' ni '¿Para qué nos contactaste?'. Retoma el hilo de prospección explicando brevemente el motivo de nuestro contacto y abre con una pregunta de descubrimiento sobre su situación."
    : "";
  const instruccionCanal  = (contexto.canal_origen === "whatsapp" || contexto.canal_origen === "sandbox")
    ? "- El número de teléfono del lead ya está registrado desde WhatsApp — NUNCA lo solicites."
    : contexto.canal_origen === "email"
    ? "- El correo electrónico del lead ya está registrado desde el email de contacto — NUNCA lo solicites."
    : "";
  const instruccionVenta  = modoRevelacion === "oculto"
    ? ["\nPROTOCOLO DE DESCUBRIMIENTO — REGLA ABSOLUTA (se revisa primero que cualquier otra instrucción):",
        "NO menciones el nombre del servicio, código de estándar (EC...) ni precio en ningún mensaje.",
        "Usa la sección CONTEXTO INTERNO para conocer los beneficios, pero habla de TRANSFORMACIÓN y SOLUCIÓN sin revelar el nombre del producto.",
        "1. Haz UNA pregunta abierta que profundice en la situación del lead.",
        "2. Cuando confirme un problema concreto, muéstrale el impacto de NO resolverlo.",
        "3. Cuando el lead muestre apertura a resolver, haz EXACTAMENTE esta pregunta (UNA sola vez): \"¿Te gustaría saber qué puede ayudarte a lograrlo?\"",
        "4. No avances más allá de esa pregunta en este turno. Espera la respuesta.",
      ].join("\n")
    : modoRevelacion === "preguntando"
    ? ["\nPROTOCOLO ESPERANDO RESPUESTA — REGLA ABSOLUTA:",
        "Ya le preguntaste al lead si quiere saber qué puede ayudarle. NO repitas la pregunta.",
        "- Si responde con interés (\"sí\", \"claro\", \"dime\", \"¿cuál?\"): revela el nombre del servicio y presenta sus beneficios.",
        "- Si evade, niega o cambia el tema: confronta de forma directa pero respetuosa.",
        "  Ejemplo: \"Entiendo que algo te detiene. ¿Qué es lo que te genera duda sobre dar este paso?\"",
        "  Trabaja la resistencia de fondo antes de revelar el producto.",
      ].join("\n")
    : "";

  let preSessionLinea = "";
  if (contexto.modoPreSesion) {
    const d       = new Date(contexto.modoPreSesion.fechaIso);
    const fechaPs = d.toLocaleDateString("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
    const horaPs  = d.toLocaleTimeString("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const meetPs  = contexto.modoPreSesion.meetLink ? `\n• Link de Google Meet: ${contexto.modoPreSesion.meetLink}` : "";
    preSessionLinea = `\nMODO PRE-SESIÓN ACTIVO — PRIORIDAD MÁXIMA. Anula cualquier instrucción de ventas:
El lead tiene una cita confirmada para el ${fechaPs} a las ${horaPs} (hora del Centro de México).${meetPs}
SOLO puedes responder dudas sobre la sesión: hora, cómo conectarse al Meet, qué preparar, cuánto dura.
Si el lead muestra dudas sobre asistir: revalida el valor de la sesión brevemente, confirma el horario y no abras más conversación después.
NO puedes: hacer preguntas de cierre de ventas, ofrecer pagos o inscripción, continuar el flujo de prospección, ni terminar con preguntas que inviten a seguir conversando sobre temas distintos a la cita.
Tono: informativo, cálido y muy breve.`;
  }

  // Bloque estable: idéntico entre turnos del mismo lead mientras el servicio/KB no cambie.
  // Se marca con cache_control cuando supera 1024 tokens (~4096 chars).
  const estable = `Eres el asistente de ventas de ${identidad?.nombre_empresa ?? "Centro ECM"}, un centro de certificación CONOCER en México.
Tu objetivo es guiar al lead hacia la certificación con calidez y profesionalismo.${brandLinea}${anclaLinea}${params.relacionesLinea}${pipelineContexto}${imagenLinea}

BASE DE CONOCIMIENTO — FAQs y recursos adicionales:
${recursosTexto}
${practicasTexto}
${formatearGatillosParaPrompt(params.gatillos)}${reglasLinea}`;

  // Bloque dinámico: estado de sesión y contexto del lead — cambia por turno.
  const dinamico = `${meetLinkLinea}${slotsLinea}${setterLinea}${objecionLinea}${rolLinea}${hintCalidadLinea}${varianteLinea}

CONTEXTO DEL LEAD:
- Nombre: ${contexto.nombre ?? "desconocido"}
- Etapa en pipeline: ${contexto.pipelineStage}
- Temperamento inferido: ${contexto.temperamento ?? "no determinado"}
- Cliente previo: ${contexto.compraPreviaa ? "SÍ — trata con familiaridad" : "NO — es nuevo lead"}
${faseCagcLinea}
${etiquetasLinea}
${memoriaLinea}
${matrizLinea}${instruccionCanal}${autoReplyLinea}
${contexto.modoPreSesion ? preSessionLinea : instruccionVenta}
${contexto.modoPreSesion ? "" : instruccionReglaOroCierre()}`;

  return { estable, dinamico };
}
