import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerEtapas, obtenerHistorialPipeline } from "@/services/pipeline";
import { obtenerPipelinesActivos } from "@/services/pipeline-multi";
import { listarEmailsInterceptados } from "@/services/bandeja-email";
import { obtenerModo } from "@/services/sistema";
import { listarTemplates } from "@/services/wa-templates";
import { obtenerProtocoloActivoLead, obtenerHistorialToques } from "@/services/lead-protocolo";
import { listarLlamadasLead } from "@/services/llamadas";
import { obtenerPendienteGHLParaLead } from "@/services/ghl-aprobacion";
import { obtenerEtiquetasLead } from "@/services/etiquetas";
import { obtenerContacto } from "@/lib/ghl/contacts-api";
import { ChatWhatsAppLead } from "@/components/leads/chat-whatsapp-lead";
import { LeadInfoPanel } from "@/components/leads/lead-info-panel";
import { GhlContactoCard } from "@/components/leads/ghl-contacto-card";
import { AuditorIABtn } from "@/components/ui/auditor-ia-btn";
import { Badge } from "@/components/ui/badge";
import { agendarLlamadaAdminAction, eliminarLlamadaAdminAction } from "./actions";

export const revalidate = 0;

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-100 text-red-800", I: "bg-yellow-100 text-yellow-800",
  S: "bg-green-100 text-green-800", C: "bg-blue-100 text-blue-800",
};

export default async function LeadPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: lead },
    historial,
    pipelinesActivos,
    etapasTripwire,
    etapasPremium,
    { data: vendedores },
    { data: senales },
    emailsInterceptados,
    modoSistema,
    todosTemplates,
    { data: msgReciente24h },
    leadProtocolo,
    historialToques,
    llamadasLead,
    pendienteGHL,
    etiquetasEcmatic,
  ] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    obtenerHistorialPipeline(id),
    obtenerPipelinesActivos(id).catch(() => []),
    obtenerEtapas("tripwire"),
    obtenerEtapas("premium"),
    supabase.from("vendedores").select("id, nombre, email").eq("activo", true),
    (supabase as any)
      .from("lead_senales_situacionales")
      .select("id, tipo, descripcion, fragmento, confianza, created_at")
      .eq("lead_id", id)
      .eq("activa", true)
      .order("confianza", { ascending: false }),
    listarEmailsInterceptados({ leadId: id, limite: 50 }).catch(() => []),
    obtenerModo().catch(() => "automatico" as const),
    listarTemplates().catch(() => []),
    (supabase as any)
      .from("mensajes")
      .select("id")
      .eq("lead_id", id)
      .eq("direccion", "entrante")
      .gte("created_at", hace24h)
      .limit(1),
    obtenerProtocoloActivoLead(id).catch(() => null),
    obtenerHistorialToques(id).catch(() => []),
    listarLlamadasLead(id).catch(() => []),
    obtenerPendienteGHLParaLead(id).catch(() => null),
    obtenerEtiquetasLead(id).catch(() => [] as { id: string; nombre: string; categoria: string; color: string }[]),
  ]);

  if (!lead) notFound();

  // GHL contact: usa ghl_contact_id del lead (migration 083); fallback a ghl_approval_queue
  let ghlContactId: string | null = (lead as any).ghl_contact_id ?? null;
  if (!ghlContactId) {
    const { data: qItemContacto } = await (supabase as any)
      .from("ghl_approval_queue")
      .select("ghl_contact_id")
      .eq("lead_ecmatic_id", id)
      .not("ghl_contact_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { ghl_contact_id: string } | null };
    ghlContactId = qItemContacto?.ghl_contact_id ?? null;
  }

  let tagsGHL: string[] = [];
  let ghlNombre: string | null = null;
  let ghlTelefono: string | null = null;
  let ghlEmail: string | null = null;

  if (ghlContactId) {
    try {
      const contactoGHL = await obtenerContacto(ghlContactId);
      tagsGHL = contactoGHL.tags ?? [];
      ghlNombre = contactoGHL.name ??
        (contactoGHL.firstName
          ? `${contactoGHL.firstName}${contactoGHL.lastName ? ` ${contactoGHL.lastName}` : ""}`.trim()
          : null);
      ghlTelefono = contactoGHL.phone ?? null;
      ghlEmail = contactoGHL.email ?? null;
    } catch { /* falla silenciosamente si GHL no responde */ }
  }

  const dentro24h = (msgReciente24h ?? []).length > 0;
  const templatesAprobados = todosTemplates.filter((t: { estado_meta: string }) => t.estado_meta === "APPROVED");

  const etapasPrimarias = lead.pipeline_ruta === "premium" ? etapasPremium : etapasTripwire;

  const rutasUnicas = [...new Set(pipelinesActivos.map((p) => p.ruta))];
  const etapasResultados = await Promise.all(
    rutasUnicas.map((ruta) =>
      (supabase as any)
        .from("pipeline_etapas")
        .select("nombre, orden")
        .eq("ruta", ruta)
        .eq("activo", true)
        .order("orden")
    )
  );
  const etapasPorRuta: Record<string, { nombre: string; orden: number }[]> = {};
  rutasUnicas.forEach((ruta, i) => {
    etapasPorRuta[ruta] = etapasResultados[i].data ?? [];
  });

  const { data: mensajesDesc } = await (supabase as any)
    .from("mensajes")
    .select("id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(21);

  const hayMasIniciales = (mensajesDesc ?? []).length === 21;
  const mensajesIniciales = ((mensajesDesc ?? []) as unknown[])
    .slice(0, 20)
    .reverse() as {
      id: string; canal: string; direccion: string; contenido: string;
      intencion_clasificada: string | null; interceptado: boolean; created_at: string;
    }[];

  const temperamento = lead.temperamento_inferido as string | undefined;

  return (
    <div className="-m-6 flex flex-col md:h-[calc(100dvh-53px)]">
      {/* Cabecera del lead */}
      <div className="px-6 py-3 border-b bg-card flex items-center gap-3 shrink-0 flex-wrap">
        <a href="/admin/leads" className="text-muted-foreground hover:text-foreground text-sm shrink-0">
          ← Leads
        </a>
        <div className="flex-1 flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="text-lg font-bold truncate">
            {lead.nombre ?? lead.telefono ?? "Sin nombre"}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>{lead.pipeline_stage}</Badge>
            <Badge variant="secondary">{lead.pipeline_ruta}</Badge>
            {temperamento && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DISC_COLORS[temperamento] ?? ""}`}>
                {temperamento}
              </span>
            )}
            {lead.compra_previa && (
              <span className="text-xs text-green-600 font-medium">★ Recurrente</span>
            )}
          </div>
          {(etiquetasEcmatic.length > 0 || tagsGHL.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {etiquetasEcmatic.map((e) => (
                <span
                  key={e.id}
                  style={{ backgroundColor: e.color + "22", color: e.color, borderColor: e.color + "66" }}
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                >
                  {e.categoria}: {e.nombre}
                </span>
              ))}
              {tagsGHL.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                  ghl: {t}
                </span>
              ))}
            </div>
          )}
          {(ghlNombre || ghlTelefono || ghlEmail) && (
            <div className="basis-full mt-1">
              <GhlContactoCard nombre={ghlNombre} telefono={ghlTelefono} email={ghlEmail} />
            </div>
          )}
        </div>
        {/* Agendar llamada manual para el vendedor asignado */}
        <form action={agendarLlamadaAdminAction} className="flex items-center gap-1 shrink-0">
          <input type="hidden" name="leadId" value={id} />
          <select
            name="objetivo"
            className="text-xs border rounded px-1.5 py-1 bg-background h-8"
          >
            <option value="avance">Avance</option>
            <option value="cierre">Cierre</option>
          </select>
          <button
            type="submit"
            disabled={!lead.vendedor_id}
            title={lead.vendedor_id ? "Crear llamada pendiente para el vendedor" : "Asigna un vendedor primero"}
            className="text-xs bg-orange-500 text-white px-2.5 py-1 rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed h-8 whitespace-nowrap"
          >
            📞 Agendar llamada
          </button>
        </form>

        <AuditorIABtn
          tipo="lead"
          id={lead.id}
          nombre={lead.nombre ?? lead.telefono ?? "Este lead"}
        />
      </div>

      {/* Split panel */}
      <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">
        {/* Chat WhatsApp — arriba en mobile, izquierda en desktop (55%) */}
        <div className="flex flex-col h-[55vh] overflow-hidden md:h-auto md:min-h-0 md:overflow-hidden border-b md:border-b-0 md:border-r md:w-[55%]">
          <ChatWhatsAppLead
            leadId={id}
            tieneTelefono={!!lead.telefono}
            telefonoLead={lead.telefono ?? null}
            mensajesIniciales={mensajesIniciales}
            hayMasIniciales={hayMasIniciales}
            dentro24h={dentro24h}
            modoSistema={modoSistema}
            leadNombre={lead.nombre ?? null}
            templatesAprobados={templatesAprobados}
            pendienteGHL={pendienteGHL}
          />
        </div>

        {/* Info / Pipelines / Emails — abajo en mobile, derecha en desktop (45%) */}
        <div className="flex-1 flex flex-col md:overflow-hidden">
          <LeadInfoPanel
            lead={lead}
            etapas={etapasPrimarias}
            historial={historial}
            vendedores={vendedores ?? []}
            senales={senales ?? []}
            pipelines={pipelinesActivos}
            etapasPorRuta={etapasPorRuta}
            emailsInterceptados={emailsInterceptados}
            leadProtocolo={leadProtocolo}
            historialToques={historialToques}
            llamadasLead={llamadasLead}
            eliminarLlamadaAction={eliminarLlamadaAdminAction}
          />
        </div>
      </div>
    </div>
  );
}
