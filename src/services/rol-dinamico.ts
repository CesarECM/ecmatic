import { createServiceClient } from "@/lib/supabase/service";

export interface RolPorServicio {
  servicio: string;
  rol: "setter" | "closer";
  etapa: string;
}

// Etapas donde el lead ya está en modo Closer (decisión/cierre inminente)
const ETAPAS_CLOSER = new Set(["Propuesta", "Negociación", "Cierre", "Ganado", "Perdido"]);

// S31.7 — Determina si la IA opera como Setter o Closer por cada servicio activo del lead
// Un mismo lead puede ser Closer para un servicio y Setter para otro (multi-pipeline)
export async function obtenerRolDinamico(leadId: string): Promise<RolPorServicio[]> {
  const supabase = createServiceClient();

  const { data: pipelines } = await supabase
    .from("lead_pipelines")
    .select("ruta, etapa_actual")
    .eq("lead_id", leadId)
    .eq("activo", true);

  if (!pipelines?.length) return [];

  return pipelines.map((p) => {
    const etapa: string = p.etapa_actual ?? "Nuevo";
    const servicio: string = p.ruta ?? "pipeline";
    const rol: "setter" | "closer" = ETAPAS_CLOSER.has(etapa) ? "closer" : "setter";
    return { servicio, rol, etapa };
  });
}

// Construye el bloque de instrucción de rol dinámico para el motor de respuesta
export function formatearRolDinamicoParaPrompt(roles: RolPorServicio[]): string {
  if (!roles.length) return "";

  const lineas = roles.map((r) => {
    if (r.rol === "closer") {
      return `• ${r.servicio} → CLOSER (etapa: ${r.etapa}): el lead está cerca de decidir; facilita la decisión, reduce fricción, ofrece el link de pago.`;
    }
    return `• ${r.servicio} → SETTER (etapa: ${r.etapa}): el lead está en exploración; conduce el protocolo pre-cualificación, no presiones el cierre.`;
  });

  return [
    "\nROL DINÁMICO POR SERVICIO:",
    "Puedes ser Setter y Closer al mismo tiempo según el servicio en cuestión:",
    ...lineas,
  ].join("\n");
}
