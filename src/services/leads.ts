import { createServiceClient } from "@/lib/supabase/service";
import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import { enviarBienvenida } from "@/lib/email/transaccional";
import { verificarBlacklist } from "@/services/limpieza-leads";
import type { Temperamento, IntencionClasificada } from "@/lib/supabase/types";

// ── S1.7 / S15.3: Busca o crea el lead por número de teléfono ───────────
// Si el teléfono está en blacklist, lanza error silencioso para cortar el flujo.
export async function obtenerOCrearLead(telefono: string) {
  const enBlacklist = await verificarBlacklist(telefono).catch(() => false);
  if (enBlacklist) throw new Error("[leads] Número en blacklist — flujo abortado");

  const supabase = createServiceClient();

  const { data: existente } = await supabase
    .from("leads")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  if (existente) return existente;

  const { data: nuevo, error } = await supabase
    .from("leads")
    .insert({ telefono, canal_origen: "whatsapp" })
    .select()
    .single();

  if (error) throw new Error(`Error creando lead: ${error.message}`);

  // S4.2 — Bienvenida por email al primer contacto (fire-and-forget)
  if (nuevo.email) void enviarBienvenida({ nombre: nuevo.nombre, email: nuevo.email });

  return nuevo;
}

// ── S1.7: Detecta compra previa ──────────────────────────────────────────
export async function tieneCompraPreviaa(leadId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("leads")
    .select("compra_previa")
    .eq("id", leadId)
    .single();
  return data?.compra_previa ?? false;
}

// ── S1.8: Infiere y actualiza etapa de pipeline ──────────────────────────
export async function inferirEtapaPipeline(
  leadId: string,
  historial: string,
  intencion: IntencionClasificada
): Promise<string> {
  const mapaEtapas: Record<IntencionClasificada, string> = {
    compra_inmediata:     "Propuesta",
    compra_consideracion: "Interesado",
    duda_tecnica:         "Interesado",
    objecion_precio:      "Negociación",
    objecion_confianza:   "Negociación",
    abandono_inminente:   "Contactado",
    quiere_agendar:       "Propuesta",
    confirmando_slot:     "Propuesta",
    fuera_de_contexto:    "Contactado",
    compra:               "Propuesta",   // legacy
    otro:                 "Contactado",  // legacy
  };

  const nuevaEtapa = mapaEtapas[intencion] ?? "Contactado";
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("pipeline_stage")
    .eq("id", leadId)
    .single();

  // Solo avanza, nunca retrocede en el pipeline
  const etapasOrden = ["Nuevo", "Contactado", "Interesado", "Propuesta", "Negociación", "Comprado"];
  const idxActual = etapasOrden.indexOf(lead?.pipeline_stage ?? "Nuevo");
  const idxNuevo = etapasOrden.indexOf(nuevaEtapa);

  if (idxNuevo > idxActual) {
    await supabase
      .from("leads")
      .update({ pipeline_stage: nuevaEtapa })
      .eq("id", leadId);

    await supabase.from("pipeline_movimientos").insert({
      lead_id: leadId,
      etapa_anterior: lead?.pipeline_stage ?? null,
      etapa_nueva: nuevaEtapa,
      motivo: `Inferido por IA — intención: ${intencion}`,
      movido_por: "ia",
    });

    return nuevaEtapa;
  }
  return lead?.pipeline_stage ?? "Nuevo";
}

// ── S1.9: Infiere temperamento DISC de forma silenciosa ──────────────────
export async function inferirTemperamento(
  leadId: string,
  mensajes: string[]
): Promise<void> {
  const texto = mensajes.join(" ");
  if (texto.length < 20) return; // muy poco texto para inferir

  const response = await anthropic.messages.create({
    model: modeloPorTarea("CLASIFICAR"),
    max_tokens: 5,
    system: `Clasifica el estilo de comunicación del siguiente texto según DISC.
Responde SOLO con una letra: D, I, S o C.
D=dominante/directo, I=influyente/expresivo, S=estable/paciente, C=concienzudo/analítico`,
    messages: [{ role: "user", content: texto }],
  });

  const raw = (response.content[0] as { text: string }).text.trim().toUpperCase();
  const temperamento = (["D", "I", "S", "C"].find((t) => raw.includes(t)) ?? null) as Temperamento | null;

  if (!temperamento) return;

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("temperamento_confianza")
    .eq("id", leadId)
    .single();

  const confianzaActual = lead?.temperamento_confianza ?? 0;
  const nuevaConfianza = Math.min(1, confianzaActual + 0.25);

  await supabase
    .from("leads")
    .update({ temperamento_inferido: temperamento, temperamento_confianza: nuevaConfianza })
    .eq("id", leadId);
}
