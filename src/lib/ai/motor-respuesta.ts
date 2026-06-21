import { anthropic, generarEmbedding } from "./client";
import { modeloPorTarea } from "./model-router";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUso, sugerirRecursoDesdeQuery } from "@/services/conocimiento";
import { obtenerGatillosActivos, formatearGatillosParaPrompt } from "@/services/gatillos";
import { registrarUsoIA } from "@/services/alertas-ia";
import { registrarAccionIA } from "@/services/log-ia";
import { inferirRespuestaMatriz } from "@/services/matriz-ia";
import { obtenerIdentidad, formatearIdentidadParaPrompt } from "@/services/identidad-marca";
import { seleccionarPagoServicio } from "@/lib/ai/selector-pago";
import { listarCuentasActivas, formatearCuentaParaPrompt } from "@/services/cuentas-bancarias";
import type { PipelineRuta, DimensionesMatriz } from "@/lib/supabase/types";
import type { SlotDisponible } from "@/services/citas";

interface ContextoLead {
  nombre: string | null;
  temperamento: string | null;
  pipelineStage: string;
  compraPreviaa: boolean;
  historial: string;
  pipelineRuta?: PipelineRuta;
  faseCAGC?: number;
  etiquetas?: string[];
  slotsDisponibles?: SlotDisponible[]; // inyectados cuando intención = quiere_agendar
  meetLink?: string | null;            // inyectado cuando intención = confirmando_slot y la cita se creó
}

// S22.4 — Tipo de recurso enriquecido (incluye ficha de servicio)
interface RecursoKB {
  id: string; tipo: string; titulo: string; contenido: string;
  caracteristicas?: string | null; beneficios?: string | null;
  ventajas?: string | null; para_quien_es?: string | null; para_quien_no_es?: string | null;
}

// S22.5 — Formato enriquecido para recursos tipo servicio
function formatearRecursoKB(r: RecursoKB): string {
  if (r.tipo !== "servicio") return `[${r.tipo.toUpperCase()}] ${r.titulo}:\n${r.contenido}`;
  const partes = [`[SERVICIO] ${r.titulo}:\n${r.contenido}`];
  if (r.caracteristicas) partes.push(`Características: ${r.caracteristicas}`);
  if (r.beneficios) partes.push(`Beneficios: ${r.beneficios}`);
  if (r.ventajas) partes.push(`Ventajas: ${r.ventajas}`);
  if (r.para_quien_es) partes.push(`Ideal para: ${r.para_quien_es}`);
  if (r.para_quien_no_es) partes.push(`NO recomendado para: ${r.para_quien_no_es}`);
  return partes.join("\n");
}

// ── S1.4: Búsqueda semántica en base de conocimiento ─────────────────────
async function buscarRecursos(query: string, limite = 4) {
  const supabase = createServiceClient();
  const embedding = await generarEmbedding(query);

  const { data } = await supabase.rpc("buscar_recursos", {
    query_embedding: embedding,
    limite,
    umbral: 0.65,
  });

  return (data ?? []) as RecursoKB[];
}

export interface RespuestaIA {
  texto: string;
  scoreConfianza: number; // 0–1; calculado en base a recursos KB + señales de incertidumbre
}

// Score heurístico: más recursos KB y sugerencia de matriz elevan la confianza;
// frases de incertidumbre en la respuesta la bajan.
function calcularScore(
  recursos: { id: string }[],
  sugerenciaMatriz: string | null,
  texto: string
): number {
  const INDICADORES = ["no tengo información", "no puedo ayudarte", "no sé", "un asesor", "te contactará", "fuera de mi alcance"];
  let score = Math.min(0.85, 0.30 + recursos.length * 0.18);
  if (sugerenciaMatriz) score += 0.10;
  if (INDICADORES.some((i) => texto.toLowerCase().includes(i))) score -= 0.30;
  return Math.max(0, Math.min(1, score));
}

// ── S1.4: Genera la respuesta de ECMatic usando Claude ───────────────────
export async function generarRespuesta(
  mensajes: string[],
  contexto: ContextoLead
): Promise<RespuestaIA> {
  const queryParaBusqueda = mensajes.join(" ");

  // S13.3 — Armar dimensiones 8D para consultar la matriz de personalización
  const dims8D: DimensionesMatriz = {
    canal_origen: "whatsapp",
    etapa_atasco: contexto.pipelineStage,
    ...(contexto.temperamento && { temperamento: contexto.temperamento as DimensionesMatriz["temperamento"] }),
    ...(contexto.faseCAGC !== undefined && { fase_cagc: contexto.faseCAGC }),
  };

  const [recursos, gatillos, sugerenciaMatriz, identidad] = await Promise.all([
    buscarRecursos(queryParaBusqueda),
    obtenerGatillosActivos(contexto.pipelineRuta),
    inferirRespuestaMatriz(dims8D, mensajes, contexto.nombre).catch(() => null),
    obtenerIdentidad().catch(() => null),
  ]);
  void registrarUso(recursos.map((r) => r.id));
  if (recursos.length === 0) void sugerirRecursoDesdeQuery(queryParaBusqueda);

  // S23.6 — Anclar servicio(s) identificados: la IA razona desde el servicio antes que desde cualquier otra cosa
  const serviciosAncla = recursos.filter((r) => r.tipo === "servicio");

  // S24.1/S24.2 — Resolver pagos, precios y cuentas bancarias en paralelo
  const [pagosServicios, cuentasActivas] = await Promise.all([
    serviciosAncla.length > 0
      ? Promise.all(
          serviciosAncla.map(async (s) => {
            const supabase = createServiceClient();
            const [pago, precioRow] = await Promise.all([
              seleccionarPagoServicio(s.id, contexto.faseCAGC).catch(() => null),
              supabase
                .from("recursos_conocimiento")
                .select("precio_centavos")
                .eq("id", s.id)
                .single()
                .then((r) => (r.data?.precio_centavos as number | null) ?? null, () => null),
            ]);
            return { titulo: s.titulo, pago, precio: precioRow };
          })
        )
      : Promise.resolve([]),
    listarCuentasActivas().catch(() => []),
  ]);
  const pagosConLink = pagosServicios.filter((p) => p.pago !== null);

  // Cuentas bancarias: solo mostrar si hay servicios ancla con precio configurado
  const serviciosConPrecio = pagosServicios.filter((p) => p.precio !== null);
  const cuentasBancariasLinea = (cuentasActivas.length > 0 && serviciosAncla.length > 0)
    ? [
        "\nTRANSFERENCIA BANCARIA (solo ofrécela si el lead no puede usar los links de pago):",
        ...cuentasActivas.map((c) => `• ${formatearCuentaParaPrompt(c)}`),
        serviciosConPrecio.length > 0
          ? `Montos: ${serviciosConPrecio.map((s) => `${s.titulo}: $${((s.precio ?? 0) / 100).toLocaleString("es-MX")} MXN`).join(" | ")}`
          : "",
      ].filter(Boolean).join("\n")
    : "";

  const anclaLinea = serviciosAncla.length > 0
    ? [
        `\nSERVICIO(S) QUE ESTÁS VENDIENDO EN ESTA CONVERSACIÓN:\n${serviciosAncla.map((s) => `• ${s.titulo}`).join("\n")}\nToda tu respuesta debe estar orientada a vender este/estos servicio(s).`,
        pagosConLink.length > 0
          ? `\nLINKS DE PAGO (comparte el link cuando detectes intención de compra):\n${pagosConLink.map((p) => `• ${p.titulo}: ${p.pago!.url}${p.pago!.descripcion ? ` (${p.pago!.descripcion})` : ""}`).join("\n")}`
          : "",
        cuentasBancariasLinea,
      ].join("\n")
    : "";

  // S22.5 — Usar formato enriquecido para recursos tipo servicio
  const recursosTexto =
    recursos.length > 0
      ? recursos.map(formatearRecursoKB).join("\n\n")
      : "No se encontraron recursos específicos. Responde con información general del Centro ECM.";

  // S11.8 — Inyectar mejores prácticas aprobadas en el contexto
  const { data: practicas } = await createServiceClient()
    .from("recursos_conocimiento")
    .select("contenido")
    .eq("tipo", "practica_venta")
    .eq("aprobado", true)
    .eq("activo", true)
    .order("score_confianza", { ascending: false })
    .limit(3);

  const practicasTexto = practicas?.length
    ? `\nMEJORES PRÁCTICAS DE VENTA APLICABLES:\n${practicas.map((p) => `• ${p.contenido}`).join("\n")}`
    : "";

  const faseCagcLinea = contexto.faseCAGC !== undefined
    ? `- Fase de compra CAGC: ${contexto.faseCAGC} — guía el tono y objetivo de tu respuesta según este momento del comprador`
    : "";
  const etiquetasLinea = contexto.etiquetas?.length
    ? `- Etiquetas del lead: ${contexto.etiquetas.join(", ")}`
    : "";

  const matrizLinea = sugerenciaMatriz
    ? `\nSUGERENCIA DE MATRIZ (usa como guía, adapta a la conversación):\n${sugerenciaMatriz}`
    : "";

  // S18.4 — Inyectar identidad de marca en el system prompt
  const brandLinea = identidad
    ? `\nIDENTIDAD DE MARCA:\n${formatearIdentidadParaPrompt(identidad)}`
    : "";

  // Meet link cuando el lead confirmó un slot y la cita ya fue creada
  const meetLinkLinea = contexto.meetLink
    ? [
        "\nCITA CREADA — COMPARTE EL LINK CON ENTUSIASMO:",
        `El sistema generó este enlace de Google Meet: ${contexto.meetLink}`,
        "Compártelo de forma cálida y natural. Menciona la fecha y hora en horario del Centro de México.",
        "Dile al lead que su solicitud ya está registrada y que en breve el equipo la confirma. Usa tono entusiasta y cercano.",
      ].join("\n")
    : "";

  // Slots disponibles para agendar (solo cuando intención = quiere_agendar)
  const tz = "America/Mexico_City";
  const slotsLinea = contexto.slotsDisponibles?.length
    ? [
        "\nHORARIOS DISPONIBLES — preséntaselos de forma conversacional, no como lista rígida:",
        ...contexto.slotsDisponibles.map((s, i) => {
          const fecha = s.inicio.toLocaleDateString("es-MX", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
          const hora  = s.inicio.toLocaleTimeString("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
          return `${i + 1}. ${fecha} a las ${hora}`;
        }),
        "\nREGLAS DE ZONA HORARIA (seguir siempre):",
        "• Todos los horarios son en horario del Centro de México — usa exactamente esa expresión, nunca abrevies a 'CDMX' ni 'hora local'.",
        "• Si el lead menciona estar en otra ciudad, estado o país con huso horario diferente, convierte el horario y acláraselo de forma natural: ejemplo: 'serían las 3:00 pm en horario del Centro de México, que en tu zona local serían las 4:00 pm'.",
        "• Cuando el lead elija un horario, confírmalo con calidez y entusiasmo.",
      ].join("\n")
    : "";

  const systemPrompt = `Eres el asistente de ventas de ${identidad?.nombre_empresa ?? "Centro ECM"}, un centro de certificación CONOCER en México.
Tu objetivo es guiar al lead hacia la certificación con calidez y profesionalismo.${brandLinea}${anclaLinea}${meetLinkLinea}${slotsLinea}

CONTEXTO DEL LEAD:
- Nombre: ${contexto.nombre ?? "desconocido"}
- Etapa en pipeline: ${contexto.pipelineStage}
- Temperamento inferido: ${contexto.temperamento ?? "no determinado"}
- Cliente previo: ${contexto.compraPreviaa ? "SÍ — trata con familiaridad" : "NO — es nuevo lead"}
${faseCagcLinea}
${etiquetasLinea}

HISTORIAL RECIENTE:
${contexto.historial || "(primera interacción)"}

INFORMACIÓN DISPONIBLE:
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
- Si el lead no encaja en "NO recomendado para" de un servicio, sé honesto y redirige con amabilidad`;

  const response = await anthropic.messages.create({
    model: modeloPorTarea("RESPUESTA"),
    max_tokens: 400,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: mensajes.join("\n"),
      },
    ],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});
  void registrarAccionIA({ tipoAccion: "generar_respuesta", resultado: "enviado",
    metadata: { recursos_usados: recursos.length } }).catch(() => {});

  const texto = (response.content[0] as { text: string }).text.trim();
  const scoreConfianza = calcularScore(recursos, sugerenciaMatriz, texto);
  return { texto, scoreConfianza };
}

// ── Detecta si la IA necesita handoff humano ─────────────────────────────
export async function necesitaHandoff(
  mensajes: string[],
  respuestaGenerada: string
): Promise<boolean> {
  const indicadores = [
    "no tengo información",
    "no puedo ayudarte",
    "no sé",
    "un asesor",
    "te contactará",
    "fuera de mi alcance",
  ];
  return indicadores.some((i) => respuestaGenerada.toLowerCase().includes(i));
}
