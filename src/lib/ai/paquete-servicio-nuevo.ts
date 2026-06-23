// S23.5 — Genera sugerencias en cola de aprobación al crear un servicio nuevo
import { callClaudeIA } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { logDebugIA } from "@/services/log-ia";

interface SugerenciaPaquete {
  tipo: "pipeline" | "general";
  titulo: string;
  descripcion: string;
  metadata: Record<string, unknown>;
}

// Genera 3 sugerencias: pipeline/CAGC, leadmagnet candidato, template base de venta
async function generarSugerencias(
  tituloServicio: string,
  contenidoServicio: string
): Promise<SugerenciaPaquete[]> {
  const response = await callClaudeIA("PAQUETE_SERVICIO", {
    max_tokens: 600,
    system: `Eres el motor de configuración de ECMatic. Al registrarse un nuevo servicio de certificación CONOCER, generas 3 sugerencias concretas para el admin:
1. Pipeline / rama CAGC: qué fases del comprador (0-16) son más relevantes para este servicio y qué etapas de pipeline crear.
2. Leadmagnet candidato: un recurso gratuito de valor que atraiga leads interesados en este servicio.
3. Template base de venta: un mensaje de primer contacto por WhatsApp orientado a este servicio.

Responde SOLO en JSON con este formato exacto:
[
  {"tipo":"pipeline","titulo":"...","descripcion":"...","categoria":"pipeline_cagc"},
  {"tipo":"general","titulo":"...","descripcion":"...","categoria":"leadmagnet_candidato"},
  {"tipo":"general","titulo":"...","descripcion":"...","categoria":"template_base_venta"}
]`,
    messages: [{
      role: "user",
      content: `Nuevo servicio registrado:\nTítulo: ${tituloServicio}\nDescripción: ${contenidoServicio.slice(0, 500)}`,
    }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  void logDebugIA("PAQUETE_SERVICIO_NUEVO", `[PARSE_INICIO] ${raw.length} chars: ${raw.slice(0, 120)}`, {
    raw_preview: raw.slice(0, 600), raw_length: raw.length, servicio: tituloServicio,
  });
  try {
    const items = JSON.parse(raw) as Array<{
      tipo: "pipeline" | "general";
      titulo: string;
      descripcion: string;
      categoria: string;
    }>;
    void logDebugIA("PAQUETE_SERVICIO_NUEVO", `[PARSE_OK] ${items.length} sugerencias`, {
      count: items.length, titulos: items.map(i => i.titulo),
    });
    return items.map((i) => ({
      tipo: i.tipo,
      titulo: i.titulo,
      descripcion: i.descripcion,
      metadata: { categoria: i.categoria, servicio_titulo: tituloServicio },
    }));
  } catch (err) {
    await logDebugIA("PAQUETE_SERVICIO_NUEVO", `[PARSE_ERROR] JSON.parse falló: ${String(err)}`, {
      raw_preview: raw.slice(0, 600), error: String(err),
    }, "error");
    return [];
  }
}

// Punto de entrada — llamar fire-and-forget desde crearRecurso
export async function generarPaqueteServicioNuevo(
  servicioId: string,
  tituloServicio: string,
  contenidoServicio: string
): Promise<void> {
  const sugerencias = await generarSugerencias(tituloServicio, contenidoServicio);
  if (sugerencias.length === 0) return;

  void logDebugIA("PAQUETE_SERVICIO_NUEVO", `[INICIO] Insertando ${sugerencias.length} sugerencias para servicio ${servicioId}`, {
    servicioId, count: sugerencias.length,
  });

  const supabase = createServiceClient();
  for (const s of sugerencias) {
    const { error: insertError } = await (supabase as any).from("sugerencias_ia").insert({
      tipo:        s.tipo,
      titulo:      s.titulo,
      descripcion: s.descripcion,
      prioridad:   "importante",
      servicio_id: servicioId,
      metadata:    s.metadata,
    });
    if (insertError) {
      await logDebugIA("PAQUETE_SERVICIO_NUEVO", `[INSERT_ERROR] "${s.titulo}": ${insertError.message}`, {
        titulo: s.titulo, code: insertError.code, message: insertError.message, details: insertError.details,
      }, "error");
    } else {
      void logDebugIA("PAQUETE_SERVICIO_NUEVO", `[INSERT_OK] "${s.titulo}"`, {
        titulo: s.titulo, tipo: s.tipo,
      });
    }
  }
}
