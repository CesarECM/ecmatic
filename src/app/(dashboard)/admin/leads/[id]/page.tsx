import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerEtapas, obtenerHistorialPipeline } from "@/services/pipeline";
import { LeadPerfil } from "@/components/leads/lead-perfil";

export const revalidate = 0;

export default async function LeadPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: lead }, historial, { data: mensajes }, etapasTripwire, etapasPremium, { data: vendedores }, { data: senales }] =
    await Promise.all([
      supabase.from("leads").select("*").eq("id", id).single(),
      obtenerHistorialPipeline(id),
      supabase
        .from("mensajes")
        .select("id, canal, direccion, contenido, intencion_clasificada, created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      obtenerEtapas("tripwire"),
      obtenerEtapas("premium"),
      supabase.from("vendedores").select("id, nombre, email").eq("activo", true),
      (supabase as any)
        .from("lead_senales_situacionales")
        .select("id, tipo, descripcion, fragmento, confianza, created_at")
        .eq("lead_id", id)
        .eq("activa", true)
        .order("confianza", { ascending: false }),
    ]);

  if (!lead) notFound();

  const etapas = lead.pipeline_ruta === "premium" ? etapasPremium : etapasTripwire;

  return (
    <LeadPerfil
      lead={lead}
      etapas={etapas}
      historial={historial}
      mensajes={mensajes ?? []}
      vendedores={vendedores ?? []}
      senales={senales ?? []}
    />
  );
}
