import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

// S15.3 — Verifica si un teléfono o email está en blacklist.
// Llamar ANTES de obtenerOCrearLead para cumplir LFPDPPP.
export async function verificarBlacklist(
  telefono?: string | null,
  email?: string | null
): Promise<boolean> {
  if (!telefono && !email) return false;
  const supabase = createServiceClient();
  const conditions: string[] = [];
  if (telefono) conditions.push(`telefono.eq.${telefono}`);
  if (email)    conditions.push(`email.eq.${email}`);
  const { data } = await supabase
    .from("blacklist")
    .select("id")
    .or(conditions.join(","))
    .maybeSingle();
  return !!data;
}

// S15.3 — Agrega un número/email a la blacklist y desactiva el lead si existe.
export async function agregarABlacklist(
  params: { telefono?: string; email?: string },
  motivo: "solicitud_eliminacion" | "invalido" | "spam" = "solicitud_eliminacion"
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("blacklist").upsert({ ...params, motivo }, { onConflict: "telefono" });
  if (params.telefono) {
    await supabase.from("leads").update({ activo: false })
      .eq("telefono", params.telefono);
  }
  if (params.email) {
    await supabase.from("leads").update({ activo: false })
      .eq("email", params.email);
  }
}

// S15.1 — Detecta posibles leads duplicados por teléfono/email similar.
// Devuelve pares con su score de similitud para revisión del admin.
export async function detectarDuplicadosLeads(): Promise<
  { lead_a: string; lead_b: string; razon: string }[]
> {
  const supabase = createServiceClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, nombre, telefono, email")
    .eq("activo", true)
    .not("telefono", "is", null);

  if (!leads?.length) return [];
  const duplicados: { lead_a: string; lead_b: string; razon: string }[] = [];

  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      const a = leads[i], b = leads[j];
      // Normalizar teléfono: mismo número con/sin +52, espacios, etc.
      const telA = a.telefono?.replace(/\D/g, "") ?? "";
      const telB = b.telefono?.replace(/\D/g, "") ?? "";
      if (telA && telB && (telA.endsWith(telB) || telB.endsWith(telA))) {
        duplicados.push({ lead_a: a.id, lead_b: b.id, razon: "teléfono coincide (variante formato)" });
      } else if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
        duplicados.push({ lead_a: a.id, lead_b: b.id, razon: "email idéntico" });
      }
    }
    if (duplicados.length >= 20) break; // máx 20 pares por ciclo
  }
  return duplicados;
}

// S15.2 — Solicita datos faltantes al lead de forma conversacional si hay señal positiva.
// Devuelve el texto a enviar, o null si no corresponde pedirlos ahora.
// canal: evita pedir datos que el canal ya provee (whatsapp → no pedir teléfono, email → no pedir correo)
export async function generarSolicitudDatosFaltantes(
  lead: { id: string; nombre: string | null; email: string | null },
  historial: string,
  canal?: string
): Promise<string | null> {
  const faltantes: string[] = [];
  if (!lead.nombre) faltantes.push("nombre completo");
  // No pedir correo si el canal de origen ya lo provee
  if (!lead.email && canal !== "email") faltantes.push("correo electrónico");
  if (faltantes.length === 0) return null;

  // Solo pedir si la conversación tiene señal positiva (no en primera interacción)
  if (!historial || historial.length < 100) return null;

  const prompt = `Eres el asistente de ventas de Centro ECM. En esta conversación activa y positiva,
necesitas pedir de forma natural y justificada: ${faltantes.join(" y ")}.
El lead ya mostró interés, así que es buen momento. Escribe UNA sola oración en español,
cálida y con razón clara (para enviarte tu información de certificación). Sin asteriscos.`;

  try {
    const res = await callClaudeIA("CLASIFICAR", {
      max_tokens: 80,
      messages: [{ role: "user", content: `Historial:\n${historial.slice(-300)}\n\n${prompt}` }],
    });
    return (res.content[0] as { text: string }).text.trim();
  } catch {
    return null;
  }
}

// S15.4 — Archiva manualmente un lead por inactividad.
export async function archivarLead(leadId: string, razon: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("leads")
    .update({ archivado: true, archivado_razon: razon, activo: false })
    .eq("id", leadId);
}

// S15.4 — Ejecuta el ciclo de archivo automático por inactividad.
// Archiva leads sin actividad más allá del umbral por ruta de producto.
export async function ejecutarArchivoAutomatico(): Promise<{ archivados: number }> {
  const supabase = createServiceClient();
  const UMBRAL_TRIPWIRE_DIAS = Number(process.env.ARCHIVO_DIAS_TRIPWIRE ?? "45");
  const UMBRAL_PREMIUM_DIAS  = Number(process.env.ARCHIVO_DIAS_PREMIUM  ?? "90");

  const ahora = new Date();
  let archivados = 0;

  for (const [ruta, dias] of [["tripwire", UMBRAL_TRIPWIRE_DIAS], ["premium", UMBRAL_PREMIUM_DIAS]] as const) {
    const umbralFecha = new Date(ahora.getTime() - dias * 86400000).toISOString();
    const { data: candidatos } = await supabase
      .from("leads")
      .select("id, pipeline_ruta")
      .eq("activo", true)
      .eq("archivado", false)
      .eq("pipeline_ruta", ruta)
      .not("pipeline_stage", "in", '("Comprado","Certificado","Perdido")')
      .lt("updated_at", umbralFecha)
      .limit(50);

    for (const lead of candidatos ?? []) {
      await archivarLead(lead.id, `Inactivo más de ${dias} días (ruta ${ruta})`);
      archivados++;
    }
  }
  return { archivados };
}
