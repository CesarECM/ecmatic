import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { autoEnviarPorGHL } from "./loop-enviar";
import { buscarKbV2 } from "./kb-search";

interface GeneradoIA {
  contenido:        string;
  confianza:        number;
  razon_confianza:  string;
}

function parsear(texto: string): GeneradoIA {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const obj = JSON.parse(limpio) as GeneradoIA;
  obj.confianza = Math.max(0, Math.min(100, Math.round(obj.confianza ?? 50)));
  return obj;
}

function instruccionesTipo(tipo: string): string {
  switch (tipo) {
    case "whatsapp":     return "Máximo 3 párrafos cortos. Tono conversacional y cálido. Sin bullets. Doble salto de línea entre párrafos.";
    case "email":        return 'Comienza con "Asunto: [línea de asunto]" seguido de salto de línea doble, luego el cuerpo del email. Tono formal pero cercano.';
    case "llamada":      return "Lista de puntos de conversación con viñetas (-). Cada punto en una línea. Incluye preguntas clave a hacer.";
    case "videollamada": return "Agenda con tiempos estimados. Formato: HH:MM - Tema. Incluye objetivo de cada bloque.";
    default:             return "Contenido claro y profesional.";
  }
}

export async function generarContenido(
  cpId: string,
  instruccionExtra?: string
): Promise<{ contenido: string; confianza: number }> {
  const db = createServiceClient() as any;

  // ── Cargar contact_point + lead ───────────────────────────────────────────
  const { data: cp, error: cpErr } = await db
    .from("v2_contact_points")
    .select("*, lead:v2_leads(id, nombre, telefono, ghl_contact_id)")
    .eq("id", cpId)
    .single();

  if (cpErr || !cp) throw new Error(`generarContenido: contact_point no encontrado (${cpId})`);
  if (cp.estado !== "pendiente_generacion") throw new Error(`generarContenido: estado inválido (${cp.estado})`);

  const lead = cp.lead as { id: string; nombre: string | null; telefono: string | null; ghl_contact_id: string };

  // ── Conversación reciente ─────────────────────────────────────────────────
  let convTexto = "(Sin conversación registrada)";
  const { data: v1Lead } = await db
    .from("leads").select("id").eq("ghl_contact_id", lead.ghl_contact_id).maybeSingle();

  if (v1Lead) {
    const { data: msgs } = await db
      .from("mensajes")
      .select("direccion, contenido, created_at")
      .eq("lead_id", v1Lead.id)
      .order("created_at", { ascending: false })
      .limit(15);

    if (msgs?.length) {
      convTexto = ((msgs as any[]).reverse())
        .map((m: any) => `${m.direccion === "entrante" ? "Lead" : "ECMatic"}: ${m.contenido}`)
        .join("\n");
    }
  }

  // ── S152.2 — Contexto multi-oportunidad para CPs fusionados ─────────────
  let opFusionTexto = "";
  if (cp.es_fusionado && (cp.opportunity_ids as string[]).length > 1) {
    const { data: opsData } = await db
      .from("v2_opportunities")
      .select("producto_servicio, fase_cagc")
      .in("id", cp.opportunity_ids as string[]);
    if (opsData?.length) {
      opFusionTexto = "\n## Oportunidades fusionadas (incluir ambas en el mensaje)\n" +
        (opsData as { producto_servicio: string | null; fase_cagc: string }[])
          .map((o) => `- ${o.producto_servicio ?? "Sin producto"} (fase: ${o.fase_cagc})`)
          .join("\n");
    }
  }

  // ── KB aprobada — búsqueda semántica (S150.2) ────────────────────────────
  const kbQuery = (cp.metadata as Record<string, unknown>)?.razon_contacto as string
    ?? "certificacion CONOCER";
  const kbRows  = await buscarKbV2(kbQuery, 8);
  const kbTexto = kbRows.length
    ? kbRows.map((k) => `[${k.tipo}] ${k.contenido}`).join("\n")
    : "(KB vacía)";

  // ── Reglas de conversación ────────────────────────────────────────────────
  const { data: reglasRows } = await db
    .from("v2_conversation_rules")
    .select("contenido").eq("activa", true).order("orden", { ascending: true });

  const reglasTexto = reglasRows?.length
    ? (reglasRows as { contenido: string }[]).map((r) => `- ${r.contenido}`).join("\n")
    : "(Sin reglas)";

  // ── Llamada a Claude ──────────────────────────────────────────────────────
  const razonContacto = (cp.metadata as any)?.razon_contacto ?? "Continuar la conversación con el lead";

  const system = `Eres el redactor de mensajes de ECMatic — CRM de Centro ECM, empresa de certificaciones CONOCER en México.

INSTRUCCIONES PARA ESTE TIPO DE MENSAJE (${cp.tipo.toUpperCase()}):
${instruccionesTipo(cp.tipo)}

REGLAS DE CONVERSACIÓN:
${reglasTexto}

CONOCIMIENTO DISPONIBLE (KB):
${kbTexto}

Responde EXCLUSIVAMENTE con JSON válido. Sin markdown fuera del JSON.`;

  const userMsg = `## Lead
Nombre: ${lead.nombre ?? "Desconocido"}

## Conversación reciente
${convTexto}

## Objetivo de este mensaje
${razonContacto}${opFusionTexto}${instruccionExtra ? `\n\n## Instrucción adicional de César\n${instruccionExtra}` : ""}

---
Genera el mensaje y responde con este JSON:
{
  "contenido": "el mensaje completo listo para enviar",
  "confianza": 0-100,
  "razon_confianza": "por qué este nivel de confianza"
}`;

  const respuesta = await callClaudeIA(
    "V2_GENERAR_CONTENIDO",
    { system, messages: [{ role: "user", content: userMsg }], max_tokens: 1200 },
    { leadId: lead.id }
  );

  const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";
  const generado = parsear(texto);

  // ── S150.1: Verificar condición de auto-envío ────────────────────────────
  const debeAutoEnviar = generado.confianza >= 92 && cp.tipo === "whatsapp";
  let forzarRevision   = false;

  if (debeAutoEnviar) {
    const { count } = await db
      .from("v2_contact_points")
      .select("*", { count: "exact", head: true })
      .eq("estado", "enviado_automatico");
    forzarRevision = count !== null && count % 50 === 49;
  }

  // ── Actualizar contact_point ──────────────────────────────────────────────
  await db.from("v2_contact_points").update({
    estado:              "generado",
    contenido_propuesto: generado.contenido,
    confianza:           generado.confianza,
    metadata: {
      ...(cp.metadata ?? {}),
      razon_confianza: generado.razon_confianza,
      ...(debeAutoEnviar && forzarRevision ? { muestreo_forzado: true } : {}),
    },
    updated_at: new Date().toISOString(),
  }).eq("id", cpId);

  // ── Auto-enviar sin intervención humana ──────────────────────────────────
  if (debeAutoEnviar && !forzarRevision) {
    await autoEnviarPorGHL(cpId, generado.contenido);
  }

  return { contenido: generado.contenido, confianza: generado.confianza };
}
