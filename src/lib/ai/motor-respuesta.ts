import { anthropic, CLAUDE_MODEL, generarEmbedding } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUso } from "@/services/conocimiento";

interface ContextoLead {
  nombre: string | null;
  temperamento: string | null;
  pipelineStage: string;
  compraPreviaa: boolean;
  historial: string;
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
  const recursos = await buscarRecursos(queryParaBusqueda);
  void registrarUso(recursos.map((r) => r.id));

  const recursosTexto =
    recursos.length > 0
      ? recursos.map((r) => `[${r.tipo.toUpperCase()}] ${r.titulo}:\n${r.contenido}`).join("\n\n")
      : "No se encontraron recursos específicos. Responde con información general del Centro ECM.";

  const systemPrompt = `Eres el asistente de ventas de Centro ECM, un centro de certificación CONOCER en México.
Tu objetivo es guiar al lead hacia la certificación con calidez y profesionalismo.

CONTEXTO DEL LEAD:
- Nombre: ${contexto.nombre ?? "desconocido"}
- Etapa en pipeline: ${contexto.pipelineStage}
- Temperamento inferido: ${contexto.temperamento ?? "no determinado"}
- Cliente previo: ${contexto.compraPreviaa ? "SÍ — trata con familiaridad" : "NO — es nuevo lead"}

HISTORIAL RECIENTE:
${contexto.historial || "(primera interacción)"}

INFORMACIÓN DISPONIBLE:
${recursosTexto}

INSTRUCCIONES:
- Responde en español, tono cálido y profesional
- Máximo 3 oraciones por mensaje; si necesitas más, divide en bloques
- NO expliques que eres IA
- Si no tienes información suficiente para responder, pregunta por más detalles
- Si detectas intención de compra, ofrece el link de pago de forma natural
- Si la pregunta está completamente fuera de tu alcance, indica que un asesor se pondrá en contacto`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: mensajes.join("\n"),
      },
    ],
  });

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
