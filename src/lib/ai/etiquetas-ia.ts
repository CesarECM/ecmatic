import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";
import { crearEtiqueta, asignarEtiqueta, listarCategorias } from "@/services/etiquetas";
import { createServiceClient } from "@/lib/supabase/service";

interface SugerenciaEtiqueta {
  categoria: string;
  nombre: string;
  descripcion: string;
  accion: "asignar_existente" | "crear_nueva";
  etiqueta_id?: string;
}

// S14.2 — Analiza conversación + perfil del lead y propone etiquetas.
// Las nuevas quedan en estado pendiente_revision; las existentes se asignan directo.
export async function sugerirEtiquetasParaLead(
  leadId: string,
  mensajes: string[],
  historial: string
): Promise<void> {
  const supabase = createServiceClient();

  const [categorias, { data: lead }] = await Promise.all([
    listarCategorias(),
    supabase.from("leads")
      .select("nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, canal_origen")
      .eq("id", leadId).single(),
  ]);

  const catalogoTexto = categorias
    .map((c) => {
      const etiquetasActivas = c.etiquetas.filter((e) => e.estado === "activa");
      const lista = etiquetasActivas.map((e) => `  - ${e.nombre} (id:${e.id})`).join("\n");
      return `[${c.nombre}]\n${lista || "  (sin etiquetas aún)"}`;
    })
    .join("\n\n");

  const prompt = `Eres un sistema de etiquetado para Centro ECM (certificaciones CONOCER, México).
Analiza el perfil y la conversación del lead y propón hasta 4 etiquetas relevantes.

CATÁLOGO DE ETIQUETAS EXISTENTES:
${catalogoTexto}

PERFIL DEL LEAD:
- Nombre: ${lead?.nombre ?? "desconocido"}
- Temperamento: ${lead?.temperamento_inferido ?? "no determinado"}
- Etapa: ${lead?.pipeline_stage ?? "Nuevo"}
- Ruta: ${lead?.pipeline_ruta ?? "tripwire"}
- Canal origen: ${lead?.canal_origen ?? "whatsapp"}

CONVERSACIÓN RECIENTE:
${historial || "(sin historial)"}
${mensajes.join("\n")}

Responde ÚNICAMENTE con JSON válido. Para etiquetas existentes usa "asignar_existente" con su id.
Para etiquetas nuevas usa "crear_nueva" (quedarán pendientes de aprobación del admin).
Solo propone etiquetas con señales claras en la conversación.

{"sugerencias": [
  {"categoria": "Nombre Categoría", "nombre": "Nombre Etiqueta", "descripcion": "por qué aplica", "accion": "asignar_existente", "etiqueta_id": "uuid"},
  {"categoria": "Nombre Categoría", "nombre": "Nombre Etiqueta Nueva", "descripcion": "por qué aplica", "accion": "crear_nueva"}
]}`;

  let sugerencias: SugerenciaEtiqueta[] = [];
  try {
    const res = await anthropic.messages.create({
      model: modeloPorTarea("CLASIFICAR"),
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    void registrarUsoIA("anthropic", res.usage.input_tokens, res.usage.output_tokens).catch(() => {});
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { sugerencias?: SugerenciaEtiqueta[] };
    sugerencias = json.sugerencias ?? [];
  } catch {
    return;
  }

  for (const s of sugerencias.slice(0, 4)) {
    try {
      if (s.accion === "asignar_existente" && s.etiqueta_id) {
        await asignarEtiqueta(leadId, s.etiqueta_id, "ia");
      } else if (s.accion === "crear_nueva") {
        const cat = categorias.find((c) => c.nombre === s.categoria);
        if (!cat) continue;
        const nueva = await crearEtiqueta(cat.id, s.nombre, s.descripcion, "ia_sugerido");
        // Asignar solo si el admin la aprueba — no auto-asignar pendientes
        void nueva; // solo crear la etiqueta pendiente de revisión
      }
    } catch {
      continue;
    }
  }
}
