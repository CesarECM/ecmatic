import { callClaudeIA } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUso, sugerirRecursoDesdeQuery } from "@/services/conocimiento";
import { obtenerGatillosActivos, formatearGatillosParaPrompt } from "@/services/gatillos";
import { registrarUsoIA } from "@/services/alertas-ia";
import { inferirRespuestaMatriz } from "@/services/matriz-ia";
import { obtenerIdentidad, formatearIdentidadParaPrompt } from "@/services/identidad-marca";
import { seleccionarPagoServicio } from "@/lib/ai/selector-pago";
import { listarCuentasActivas, formatearCuentaParaPrompt } from "@/services/cuentas-bancarias";
import { instruccionReglaOroCierre } from "./regla-oro-cierre";
import { formatearRolDinamicoParaPrompt, type RolPorServicio } from "@/services/rol-dinamico";
import { buscarRecursos, calcularScore, formatearRecursoKB } from "./kb-search";
import { obtenerContextoPipeline, formatearContextoPipelineParaPrompt } from "./contexto-pipeline";
import { obtenerRelacionesParaPrompt } from "@/services/servicio-relaciones";
import type { PipelineRuta, DimensionesMatriz } from "@/lib/supabase/types";
import type { SlotDisponible } from "@/services/citas";
import type { EstadoSetter } from "./setter-protocol";
import type { ProtocoloObjecion } from "./protocolo-objecion";

export { necesitaHandoff } from "./handoff";

function normalizarRespuesta(texto: string): string {
  return texto
    .replace(/^[—–] /gm, "")      // viñeta con raya al inicio de línea → quitar
    .replace(/ [—–]$/gm, ".")     // raya al final de oración → punto
    .replace(/ [—–] /g, ", ")     // raya entre dos frases → coma
    .replace(/[—–]/g, ", ");      // cualquier raya restante → coma
}

interface ContextoLead {
  nombre: string | null;
  temperamento: string | null;
  pipelineStage: string;
  compraPreviaa: boolean;
  historial: string;
  pipelineRuta?: PipelineRuta;
  faseCAGC?: number;
  etiquetas?: string[];
  slotsDisponibles?: SlotDisponible[];
  meetLink?: string | null;
  canal_origen?: string | null;
  imagen_activa_url?: string | null;
  // S31 — Arquitectura de Objeciones
  setterEstado?: EstadoSetter | null;
  protocoloObjecion?: ProtocoloObjecion | null;
  rolesDinamicos?: RolPorServicio[];
}

export interface RespuestaIA {
  texto: string;
  scoreConfianza: number;
  imagenUrl: string | null;  // S32.8
}

export async function generarRespuesta(
  mensajes: string[],
  contexto: ContextoLead
): Promise<RespuestaIA> {
  const queryParaBusqueda = mensajes.join(" ");

  const dims8D: DimensionesMatriz = {
    canal_origen: "whatsapp",
    etapa_atasco: contexto.pipelineStage,
    ...(contexto.temperamento && { temperamento: contexto.temperamento as DimensionesMatriz["temperamento"] }),
    ...(contexto.faseCAGC !== undefined && { fase_cagc: contexto.faseCAGC }),
  };

  const [resultadosBusqueda, gatillos, sugerenciaMatriz, identidad, contextoPipeline] = await Promise.all([
    buscarRecursos(queryParaBusqueda),
    obtenerGatillosActivos(contexto.pipelineRuta),
    inferirRespuestaMatriz(dims8D, mensajes, contexto.nombre).catch(() => null),
    obtenerIdentidad().catch(() => null),
    obtenerContextoPipeline(contexto.pipelineRuta as string | undefined, contexto.pipelineStage)
      .catch(() => ({ servicio: null, etapa: null })),
  ]);

  const { servicios: serviciosSemánticos, kb } = resultadosBusqueda;

  // Servicio garantizado por pipeline FK (prioridad 1) + hasta 2 adicionales semánticos sin duplicados
  const serviciosPipeline = contextoPipeline.servicio ? [contextoPipeline.servicio] : [];
  const idsPipeline = new Set(serviciosPipeline.map(s => s.id));
  const serviciosExtra = serviciosSemánticos.filter(s => !idsPipeline.has(s.id)).slice(0, 2);
  const serviciosAncla = [...serviciosPipeline, ...serviciosExtra];

  const todosRecursos = [...serviciosSemánticos, ...kb];
  void registrarUso(todosRecursos.map((r) => r.id));
  if (todosRecursos.length === 0) void sugerirRecursoDesdeQuery(queryParaBusqueda);

  // S32.8 — Seleccionar imagen activa del canal para el servicio principal
  const canalParaImagen = (contexto.canal_origen === "email" ? "email"
    : contexto.canal_origen === "landing" ? "landing" : "whatsapp") as "whatsapp" | "email" | "landing";
  const imagenActivaUrl: string | null = await (async () => {
    if (!contexto.imagen_activa_url && serviciosAncla.length > 0) {
      try {
        const { seleccionarImagenActiva } = await import("@/services/imagen-servicio");
        return await seleccionarImagenActiva(serviciosAncla[0].id, canalParaImagen);
      } catch { return null; }
    }
    return contexto.imagen_activa_url ?? null;
  })();

  // S24.1/S24.2 — Pagos, cuentas bancarias y relaciones de servicios
  const [pagosServicios, cuentasActivas, relacionesLinea] = await Promise.all([
    serviciosAncla.length > 0
      ? Promise.all(serviciosAncla.map(async (s) => {
          const supabase = createServiceClient();
          const [pago, precioRow] = await Promise.all([
            seleccionarPagoServicio(s.id, contexto.faseCAGC).catch(() => null),
            supabase.from("recursos_conocimiento").select("precio_centavos")
              .eq("id", s.id).single()
              .then((r) => (r.data?.precio_centavos as number | null) ?? null, () => null),
          ]);
          return { titulo: s.titulo, pago, precio: precioRow };
        }))
      : Promise.resolve([]),
    listarCuentasActivas().catch(() => []),
    serviciosAncla.length > 0
      ? obtenerRelacionesParaPrompt(serviciosAncla[0].id).catch(() => "")
      : Promise.resolve(""),
  ]);
  const pagosConLink = pagosServicios.filter((p) => p.pago !== null);
  const serviciosConPrecio = pagosServicios.filter((p) => p.precio !== null);

  const cuentasBancariasLinea = (cuentasActivas.length > 0 && serviciosAncla.length > 0)
    ? ["\nTRANSFERENCIA BANCARIA (solo ofrécela si el lead no puede usar los links de pago):",
        ...cuentasActivas.map((c) => `• ${formatearCuentaParaPrompt(c)}`),
        serviciosConPrecio.length > 0
          ? `Montos: ${serviciosConPrecio.map((s) => `${s.titulo}: $${((s.precio ?? 0) / 100).toLocaleString("es-MX")} MXN`).join(" | ")}` : "",
      ].filter(Boolean).join("\n")
    : "";

  // Servicios — siempre con ficha completa, antes que cualquier otra información
  const serviciosTexto = serviciosAncla.map(formatearRecursoKB).join("\n\n");
  const anclaLinea = serviciosAncla.length > 0
    ? [`\nSERVICIO(S) QUE ESTÁS VENDIENDO — revisa esta información antes de responder:\n${serviciosTexto}\nToda tu respuesta debe estar orientada a vender este/estos servicio(s).`,
        pagosConLink.length > 0
          ? `\nLINKS DE PAGO (comparte el link cuando detectes intención de compra):\n${pagosConLink.map((p) => `• ${p.titulo}: ${p.pago!.url}${p.pago!.descripcion ? ` (${p.pago!.descripcion})` : ""}`).join("\n")}` : "",
        cuentasBancariasLinea].join("\n")
    : "";

  // Protocolo y plantillas de la etapa actual del pipeline
  const pipelineContextoLinea = formatearContextoPipelineParaPrompt(contextoPipeline, contexto.pipelineStage);

  const { data: practicas } = await createServiceClient()
    .from("recursos_conocimiento").select("contenido")
    .eq("tipo", "practica_venta").eq("aprobado", true).eq("activo", true)
    .order("score_confianza", { ascending: false }).limit(3);

  // KB: solo FAQs y recursos genéricos — los servicios ya están en anclaLinea
  const recursosTexto = kb.length > 0
    ? kb.map(formatearRecursoKB).join("\n\n")
    : "No se encontraron recursos específicos en la KB. Responde con información general del Centro ECM.";
  const practicasTexto = practicas?.length
    ? `\nMEJORES PRÁCTICAS DE VENTA APLICABLES:\n${practicas.map((p) => `• ${p.contenido}`).join("\n")}` : "";
  const faseCagcLinea = contexto.faseCAGC !== undefined
    ? `- Fase de compra CAGC: ${contexto.faseCAGC} — guía el tono y objetivo de tu respuesta según este momento del comprador` : "";
  const etiquetasLinea = contexto.etiquetas?.length
    ? `- Etiquetas del lead: ${contexto.etiquetas.join(", ")}` : "";
  const matrizLinea = sugerenciaMatriz
    ? `\nSUGERENCIA DE MATRIZ (usa como guía, adapta a la conversación):\n${sugerenciaMatriz}` : "";
  const brandLinea = identidad ? `\nIDENTIDAD DE MARCA:\n${formatearIdentidadParaPrompt(identidad)}` : "";
  const imagenLinea = imagenActivaUrl
    ? `\nIMAGEN DEL SERVICIO DISPONIBLE:\nURL: ${imagenActivaUrl}\nEsta imagen puede acompañar tu respuesta si el canal lo permite. No la menciones como "imagen"; úsala para enriquecer tu argumento visual.` : "";
  const meetLinkLinea = contexto.meetLink
    ? ["\nCITA CREADA — COMPARTE EL LINK CON ENTUSIASMO:",
        `El sistema generó este enlace de Google Meet: ${contexto.meetLink}`,
        "Compártelo de forma cálida y natural. Menciona la fecha y hora en horario del Centro de México.",
        "Dile al lead que su solicitud ya está registrada y que en breve el equipo la confirma. Usa tono entusiasta y cercano."].join("\n") : "";
  const tz = "America/Mexico_City";
  const slotsLinea = contexto.slotsDisponibles?.length
    ? ["\nHORARIOS DISPONIBLES — preséntaselos de forma conversacional, no como lista rígida:",
        ...contexto.slotsDisponibles.map((s, i) => {
          const fecha = s.inicio.toLocaleDateString("es-MX", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
          const hora  = s.inicio.toLocaleTimeString("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
          return `${i + 1}. ${fecha} a las ${hora}`;
        }),
        "\nREGLAS DE ZONA HORARIA (seguir siempre):",
        "• Todos los horarios son en horario del Centro de México — usa exactamente esa expresión, nunca abrevies a 'CDMX' ni 'hora local'.",
        "• Si el lead menciona estar en otra ciudad, estado o país con huso horario diferente, convierte el horario y acláraselo de forma natural.",
        "• Cuando el lead elija un horario, confírmalo con calidez y entusiasmo."].join("\n") : "";
  const setterLinea = contexto.setterEstado
    ? [`\nPROTOCOLO SETTER — FASE ${contexto.setterEstado.faseNueva}: ${contexto.setterEstado.nombreFase}`,
        `Objetivo: ${contexto.setterEstado.descripcionFase}`,
        contexto.setterEstado.preguntaGuia
          ? `Pregunta guía (úsala de forma natural, nunca como interrogatorio): "${contexto.setterEstado.preguntaGuia}"` : "",
      ].filter(Boolean).join("\n") : "";
  const objecionLinea = contexto.protocoloObjecion?.instruccion ? `\n${contexto.protocoloObjecion.instruccion}` : "";
  const rolLinea = contexto.rolesDinamicos?.length ? formatearRolDinamicoParaPrompt(contexto.rolesDinamicos) : "";
  // Instrucción de descubrimiento: solo en fases setter 1-2 (o primer mensaje sin historial)
  const esPrimerMensaje = !contexto.historial || contexto.historial.trim() === "";
  const setterFaseParaPrompt = contexto.setterEstado?.faseNueva ?? (esPrimerMensaje ? 1 : null);
  const instruccionDescubrimiento = (setterFaseParaPrompt !== null && setterFaseParaPrompt <= 2)
    ? [
        "\nPROTOCOLO HIGH-TICKET — FASE DE DESCUBRIMIENTO (obligatorio ahora):",
        "El lead aún no ha reconocido claramente su problema. NO menciones nombres de servicio, estándares (EC0301, EC0217, etc.) ni precios.",
        "Tu único objetivo: profundizar en la situación del lead.",
        "  1. Haz UNA pregunta abierta que amplíe lo que el lead acaba de decir.",
        "  2. Cuando confirme un problema o deseo concreto, muéstrale el impacto de NO resolverlo (sin nombrar el servicio aún).",
        "  3. Solo cuando el lead exprese que quiere resolver ESO, presenta el servicio por nombre.",
        "Regla de oro: la gente compra soluciones a problemas, no productos. Primero el problema, luego el producto.",
      ].join("\n")
    : "";

  const canal = contexto.canal_origen;
  const instruccionCanal = canal === "whatsapp" || canal === "sandbox"
    ? "- El número de teléfono del lead ya está registrado desde WhatsApp — NUNCA lo solicites."
    : canal === "email"
    ? "- El correo electrónico del lead ya está registrado desde el email de contacto — NUNCA lo solicites."
    : "";

  const systemPrompt = `Eres el asistente de ventas de ${identidad?.nombre_empresa ?? "Centro ECM"}, un centro de certificación CONOCER en México.
Tu objetivo es guiar al lead hacia la certificación con calidez y profesionalismo.${brandLinea}${anclaLinea}${relacionesLinea}${pipelineContextoLinea}${imagenLinea}${meetLinkLinea}${slotsLinea}${setterLinea}${objecionLinea}${rolLinea}

CONTEXTO DEL LEAD:
- Nombre: ${contexto.nombre ?? "desconocido"}
- Etapa en pipeline: ${contexto.pipelineStage}
- Temperamento inferido: ${contexto.temperamento ?? "no determinado"}
- Cliente previo: ${contexto.compraPreviaa ? "SÍ — trata con familiaridad" : "NO — es nuevo lead"}
${faseCagcLinea}
${etiquetasLinea}

HISTORIAL RECIENTE:
${contexto.historial || "(primera interacción)"}

BASE DE CONOCIMIENTO — FAQs y recursos adicionales:
${recursosTexto}
${practicasTexto}
${formatearGatillosParaPrompt(gatillos)}${matrizLinea}

INSTRUCCIONES:
- Responde en español, tono cálido y profesional
- Máximo 3 oraciones por mensaje; si necesitas más, divide en bloques
- NO expliques que eres IA
- Si no tienes información suficiente para responder, pregunta por más detalles
- Si detectas intención de compra, ofrece el link de pago de forma natural; si el lead no puede usarlo, proporciona los datos de transferencia bancaria del contexto
- Si la pregunta está completamente fuera de tu alcance, indica que un asesor se pondrá en contacto
- Para argumentar a favor de un servicio, usa sus beneficios y ventajas disponibles
- Si el lead no encaja en "NO recomendado para" de un servicio, sé honesto y redirige con amabilidad
${instruccionCanal}
${instruccionDescubrimiento}
${instruccionReglaOroCierre()}`;

  const response = await callClaudeIA("RESPUESTA", {
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: "user", content: mensajes.join("\n") }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  const raw  = (response.content[0] as { text: string }).text.trim();
  const texto = normalizarRespuesta(raw);
  return { texto, scoreConfianza: calcularScore(todosRecursos, sugerenciaMatriz, texto), imagenUrl: imagenActivaUrl };
}
