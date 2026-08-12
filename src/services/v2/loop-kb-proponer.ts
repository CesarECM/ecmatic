import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

interface PropuestaIA {
  tiene_aprendizaje: boolean;
  tipo?:             "FAQ" | "IC";
  contenido?:        string;
  razon?:            string;
}

function parsear(texto: string): PropuestaIA {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(limpio) as PropuestaIA;
}

// Paso 10 — Extrae aprendizaje de una edición o rechazo y propone un item KB
export async function proponerKbDesdeRetroalimentacion(cpId: string): Promise<void> {
  const db = createServiceClient() as any;

  // 1. Cargar contact_point con lead
  const { data: cp } = await db
    .from("v2_contact_points")
    .select("*, lead:v2_leads(id, nombre, ghl_contact_id)")
    .eq("id", cpId)
    .single();

  if (!cp) return;

  const lead = cp.lead as { id: string; nombre: string | null; ghl_contact_id: string };

  // 2. Retroalimentación guardada por loop-aprobar
  const { data: nota } = await db
    .from("v2_follow_up_notes")
    .select("resultado, retroalimentacion_edicion")
    .eq("contact_point_id", cpId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!nota?.retroalimentacion_edicion?.trim()) return;

  const accion = nota.resultado === "no_hecho" ? "rechazado" : "editado";

  // 3. KB existente (aprobados + propuestos) para detectar duplicados
  const { data: kbRows } = await db
    .from("v2_kb_items")
    .select("tipo, contenido")
    .in("estado", ["aprobado", "propuesto"])
    .order("score_confianza", { ascending: false })
    .limit(20);

  const kbTexto = kbRows?.length
    ? (kbRows as { tipo: string; contenido: string }[])
        .map((k) => `[${k.tipo}] ${k.contenido}`).join("\n")
    : "(KB vacía)";

  // 4. Llamada a Claude
  const system = `Eres el analizador de aprendizajes de KB de ECMatic (CRM de Centro ECM, certificaciones CONOCER en México).

Tu tarea: a partir de la retroalimentación del usuario sobre un mensaje que la IA propuso, determinar si existe un aprendizaje reutilizable que deba guardarse en la Base de Conocimiento.

Tipos de items KB:
- FAQ: respuesta a una pregunta frecuente del lead (ej: "¿Cuánto cuesta la certificación?")
- IC: instrucción de conversación — cómo debe comunicarse el sistema (ej: "No mencionar plazos exactos hasta confirmar disponibilidad del candidato")

Cuándo proponer:
- El aprendizaje es específico, claro y aplicable a futuras conversaciones.
- La edición revela un patrón de respuesta mejor que el sistema debe aprender.
- El rechazo expone una restricción o regla que el sistema desconocía.

Cuándo NO proponer (tiene_aprendizaje: false):
- Solo fue un ajuste de redacción menor sin valor de regla general.
- El error fue de datos puntuales del lead, no del estilo/contenido general.
- El item ya existe o es casi idéntico a uno en la KB.

Responde EXCLUSIVAMENTE con JSON válido. Sin markdown fuera del JSON.`;

  const userMsg = `## Mensaje que la IA propuso (tipo: ${cp.tipo.toUpperCase()})
${cp.contenido_propuesto ?? "(Sin contenido)"}

## Mensaje final (después de la acción del usuario)
${cp.contenido_final ?? "(Sin contenido final — fue rechazado)"}

## Acción del usuario: ${accion}
## Retroalimentación: ${nota.retroalimentacion_edicion}

## KB actual (para detectar duplicados)
${kbTexto}

---
Responde con este JSON exacto:
{
  "tiene_aprendizaje": true | false,
  "tipo": "FAQ" | "IC",
  "contenido": "el item de KB completo listo para usar en futuros prompts",
  "razon": "por qué este aprendizaje es valioso y reutilizable"
}
Si tiene_aprendizaje es false, los demás campos son opcionales.`;

  const respuesta = await callClaudeIA(
    "V2_KB_PROPONER",
    { system, messages: [{ role: "user", content: userMsg }], max_tokens: 600 },
    { leadId: lead.id }
  );

  const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";
  let propuesta: PropuestaIA;
  try {
    propuesta = parsear(texto);
  } catch {
    return;
  }

  if (!propuesta.tiene_aprendizaje || !propuesta.tipo || !propuesta.contenido?.trim()) return;

  await db.from("v2_kb_items").insert({
    tipo:              propuesta.tipo,
    contenido:         propuesta.contenido.trim(),
    estado:            "propuesto",
    score_confianza:   50,
    ultima_validacion: new Date().toISOString(),
    version:           1,
    metadata: {
      origin_contact_point_id: cpId,
      origen_accion:           accion,
      razon:                   propuesta.razon ?? "",
    },
  });
}
