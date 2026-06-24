import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerEtapas, obtenerHistorialPipeline } from "@/services/pipeline";
import { LeadPerfil } from "@/components/leads/lead-perfil";
import { EmailsInterceptadosCard } from "@/components/leads/emails-interceptados-card";
import { listarEmailsInterceptados } from "@/services/bandeja-email";

export const revalidate = 0;

export default async function LeadPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: lead }, historial, { data: mensajes }, etapasTripwire, etapasPremium, { data: vendedores }, { data: senales }, emailsInterceptados] =
    await Promise.all([
      supabase.from("leads").select("*").eq("id", id).single(),
      obtenerHistorialPipeline(id),
      (supabase as any)
        .from("mensajes")
        .select("id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at")
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
      listarEmailsInterceptados({ leadId: id, limite: 20 }).catch(() => []),
    ]);

  if (!lead) notFound();

  const etapas = lead.pipeline_ruta === "premium" ? etapasPremium : etapasTripwire;

  return (
    <div className="space-y-4">
      <LeadPerfil
        lead={lead}
        etapas={etapas}
        historial={historial}
        mensajes={mensajes ?? []}
        vendedores={vendedores ?? []}
        senales={senales ?? []}
      />
      <EmailsInterceptadosCard emails={emailsInterceptados} />
    </div>
  );
}
