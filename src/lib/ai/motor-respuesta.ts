import { anthropic, generarEmbedding } from "./client";
import { modeloPorTarea } from "./model-router";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUso, sugerirRecursoDesdeQuery } from "@/services/conocimiento";
import { obtenerGatillosActivos, formatearGatillosParaPrompt } from "@/services/gatillos";
import { registrarUsoIA } from "@/services/alertas-ia";
import { registrarAccionIA } from "@/services/log-ia";
import { inferirRespuestaMatriz } from "@/services/matriz-ia";
import type { PipelineRuta, DimensionesMatriz } from "@/lib/supabase/types";

interface ContextoLead {
  nombre: string | null;
  temperamento: string | null;
  pipelineStage: string;
  compraPreviaa: boolean;
  historial: string;
  pipelineRuta?: PipelineRuta;
  faseCAGC?: number; // S13.3 — 8ª dimensión de personalización
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

  return (data ?? []) as { id: string; titulo: string; contenido: string; tipo: string }[];
}

// ── S1.4: Genera la respuesta de ECMatic usando Claude ───────────────────
export async function generarRespuesta(
  mensajes: string[],
  contexto: ContextoLead
): Promise<string> {
  const queryParaBusqueda = mensajes.join(" ");

  // S13.3 — Armar dimensiones 8D para consultar la matriz de personalización
  const dims8D: DimensionesMatriz = {
    canal_origen: "whatsapp",
    etapa_atasco: contexto.pipelineStage,
    ...(contexto.temperamento && { temperamento: contexto.temperamento as DimensionesMatriz["temperamento"] }),
    ...(contexto.faseCAGC !== undefined && { fase_cagc: contexto.faseCAGC }),
  };

  const [recursos, gatillos, sugerenciaMatriz] = await Promise.all([
    buscarRecursos(queryParaBusqueda),
    obtenerGatillosActivos(contexto.pipelineRuta),
    inferirRespuestaMatriz(dims8D, mensajes, contexto.nombre).catch(() => null),
  ]);
  void registrarUso(recursos.map((r) => r.id));
  if (recursos.length === 0) void sugerirRecursoDesdeQuery(queryParaBusqueda);

  const recursosTexto =
    recursos.length > 0
      ? recursos.map((r) => `[${r.tipo.toUpperCase()}] ${r.titulo}:\n${r.contenido}`).join("\n\n")
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

  const matrizLinea = sugerenciaMatriz
    ? `\nSUGERENCIA DE MATRIZ (usa como guía, adapta a la conversación):\n${sugerenciaMatriz}`
    : "";

  const systemPrompt = `Eres el asistente de ventas de Centro ECM, un centro de certificación CONOCER en México.
Tu objetivo es guiar al lead hacia la certificación con calidez y profesionalismo.

CONTEXTO DEL LEAD:
- Nombre: ${contexto.nombre ?? "desconocido"}
- Etapa en pipeline: ${contexto.pipelineStage}
- Temperamento inferido: ${contexto.temperamento ?? "no determinado"}
- Cliente previo: ${contexto.compraPreviaa ? "SÍ — trata con familiaridad" : "NO — es nuevo lead"}
${faseCagcLinea}

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
- Si detectas intención de compra, ofrece el link de pago de forma natural
- Si la pregunta está completamente fuera de tu alcance, indica que un asesor se pondrá en contacto`;

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

  return (response.content[0] as { text: string }).text.trim();
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
