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
import { obtenerActivo } from "@/services/seguimiento-lead";
import { ChatWhatsAppLead } from "@/components/leads/chat-whatsapp-lead";
import { LeadInfoPanel } from "@/components/leads/lead-info-panel";
import { GhlContactoCard } from "@/components/leads/ghl-contacto-card";
import { RefreshBtn } from "@/components/ui/refresh-btn";
import { AuditorIABtn } from "@/components/ui/auditor-ia-btn";
import { Badge } from "@/components/ui/badge";
import { eliminarLlamadaAdminAction } from "./actions";

export const revalidate = 0;

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-100 text-red-800", I: "bg-yellow-100 text-yellow-800",
  S: "bg-green-100 text-green-800", C: "bg-blue-100 text-blue-800",
};

const ARCO_CONFIG: Record<string, { label: string; cls: string }> = {
  hot_urgente: { label: "🔥 Hot",        cls: "bg-red-100 text-red-800" },
  calentando:  { label: "📈 Calentando", cls: "bg-orange-100 text-orange-800" },
  neutro:      { label: "😐 Neutro",     cls: "bg-gray-100 text-gray-600" },
  frustrado:   { label: "😤 Frustrado",  cls: "bg-amber-100 text-amber-800" },
  perdido:     { label: "❌ Perdido",    cls: "bg-red-50 text-red-500" },
};

function tiempoRelativo(fecha: Date): string {
  const diff = Date.now() - fecha.getTime();
  if (diff < 0) return "recién";
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "recién";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mes`;
}

export default async function LeadPerfilPage({ params }: { params: Promise<{ id: string }> }) {
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
    seguimientoActivo,
  ] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    obtenerHistorialPipeline(id).catch(() => []),
    obtenerPipelinesActivos(id).catch(() => []),
    obtenerEtapas("tripwire").catch(() => []),
    obtenerEtapas("premium").catch(() => []),
    supabase.from("vendedores").select("id, nombre, email").eq("activo", true),
    (supabase as any)
      .from("lead_senales_situacionales")
      .select("id, tipo, descripcion, fragmento, confianza, created_at")
      .eq("lead_id", id).eq("activa", true).order("confianza", { ascending: false }),
    listarEmailsInterceptados({ leadId: id, limite: 50 }).catch(() => []),
    obtenerModo().catch(() => "automatico" as const),
    listarTemplates().catch(() => []),
    (supabase as any)
      .from("mensajes").select("id").eq("lead_id", id)
      .eq("direccion", "entrante").gte("created_at", hace24h).limit(1),
    obtenerProtocoloActivoLead(id).catch(() => null),
    obtenerHistorialToques(id).catch(() => []),
    listarLlamadasLead(id).catch(() => []),
    obtenerPendienteGHLParaLead(id).catch(() => null),
    obtenerEtiquetasLead(id).catch(() => [] as { id: string; nombre: string; categoria: string; color: string }[]),
    obtenerActivo(id).catch(() => null),
  ]);

  if (!lead) notFound();

  // GHL contact: prefiere ghl_contact_id del lead (migration 083), fallback a approval queue
  let ghlContactId: string | null = (lead as any).ghl_contact_id ?? null;
  if (!ghlContactId) {
    const { data: q } = await (supabase as any)
      .from("ghl_approval_queue").select("ghl_contact_id")
      .eq("lead_ecmatic_id", id).not("ghl_contact_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle() as { data: { ghl_contact_id: string } | null };
    ghlContactId = q?.ghl_contact_id ?? null;
  }

  let tagsGHL: string[] = [];
  let ghlNombre: string | null = null;
  let ghlTelefono: string | null = null;
  let ghlEmail: string | null = null;

  if (ghlContactId) {
    try {
      const c = await obtenerContacto(ghlContactId);
      tagsGHL = c.tags ?? [];
      ghlNombre = c.name ?? (c.firstName ? `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`.trim() : null);
      ghlTelefono = c.phone ?? null;
      ghlEmail = c.email ?? null;
    } catch { /* GHL no disponible */ }
  }

  // URLs externas
  const ghlUrl = ghlContactId && process.env.GHL_LOCATION_ID
    ? `https://app.gohighlevel.com/v2/location/${process.env.GHL_LOCATION_ID}/contacts/detail/${ghlContactId}`
    : null;
  const waUrl = lead.telefono
    ? `https://wa.me/${lead.telefono.replace(/\D/g, "")}`
    : null;

  // Métricas de tiempo
  const dentro24h = (msgReciente24h ?? []).length > 0;
  const templatesAprobados = todosTemplates.filter((t: { estado_meta: string }) => t.estado_meta === "APPROVED");
  const etapasPrimarias = lead.pipeline_ruta === "premium" ? etapasPremium : etapasTripwire;

  const { data: mensajesDesc } = await (supabase as any)
    .from("mensajes").select("id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at")
    .eq("lead_id", id).order("created_at", { ascending: false }).limit(21);

  const hayMasIniciales = (mensajesDesc ?? []).length === 21;
  const mensajesIniciales = ((mensajesDesc ?? []) as unknown[]).slice(0, 20).reverse() as {
    id: string; canal: string; direccion: string; contenido: string;
    intencion_clasificada: string | null; interceptado: boolean; created_at: string;
  }[];

  const ultimoMsg = mensajesIniciales.length > 0 ? mensajesIniciales[mensajesIniciales.length - 1] : null;
  const tiempoDesdeUltimoMsg = ultimoMsg ? tiempoRelativo(new Date(ultimoMsg.created_at)) : null;

  // Historial DESC: el primer movimiento a la etapa actual es el más reciente
  const entradaEtapa = historial.find((m) => m.etapa_nueva === lead.pipeline_stage);
  const tiempoEnEtapa = tiempoRelativo(new Date(entradaEtapa?.created_at ?? lead.created_at));

  const rutasUnicas = [...new Set(pipelinesActivos.map((p) => p.ruta))];
  const etapasResultados = await Promise.all(
    rutasUnicas.map((ruta) =>
      (supabase as any).from("pipeline_etapas").select("nombre, orden")
        .eq("ruta", ruta).eq("activo", true).order("orden")
    )
  );
  const etapasPorRuta: Record<string, { nombre: string; orden: number }[]> = {};
  rutasUnicas.forEach((ruta, i) => { etapasPorRuta[ruta] = etapasResultados[i].data ?? []; });

  const temperamento = lead.temperamento_inferido as string | undefined;
  const arco = lead.arco_emocional as string | null;
  const scoreColor = lead.score_salud >= 67 ? "bg-green-100 text-green-800"
    : lead.score_salud >= 34 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";

  return (
    <div className="-m-6 flex flex-col md:h-[calc(100dvh-53px)]">
      {/* Cabecera */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-start gap-3 flex-wrap">
          <a href="/admin/leads" className="text-muted-foreground hover:text-foreground text-sm shrink-0 mt-0.5">
            ← Leads
          </a>
          <div className="flex-1 min-w-0 space-y-1">
            {/* Fila 1: nombre + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate">{lead.nombre ?? lead.telefono ?? "Sin nombre"}</h1>
              <Badge>{lead.pipeline_stage}</Badge>
              <Badge variant="secondary">{lead.pipeline_ruta}</Badge>
              {temperamento && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DISC_COLORS[temperamento] ?? ""}`}>
                  {temperamento}
                </span>
              )}
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
                ★{lead.score_salud}
              </span>
              {arco && ARCO_CONFIG[arco] && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ARCO_CONFIG[arco].cls}`}>
                  {ARCO_CONFIG[arco].label}
                </span>
              )}
              {lead.compra_previa && (
                <span className="text-xs text-green-600 font-medium">★ Recurrente</span>
              )}
            </div>
            {/* Fila 2: etiquetas */}
            {(etiquetasEcmatic.length > 0 || tagsGHL.length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {etiquetasEcmatic.map((e) => (
                  <span key={e.id}
                    style={{ backgroundColor: e.color + "22", color: e.color, borderColor: e.color + "66" }}
                    className="text-xs px-2 py-0.5 rounded-full border font-medium">
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
            {/* Fila 3: datos GHL con links */}
            {(ghlNombre || ghlTelefono || ghlEmail) && (
              <GhlContactoCard nombre={ghlNombre} telefono={ghlTelefono} email={ghlEmail} ghlUrl={ghlUrl} waUrl={waUrl} />
            )}
            {/* Fila 4: meta — tiempos y modo */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {tiempoDesdeUltimoMsg && (
                <span>Último msg: <strong className="text-foreground">{tiempoDesdeUltimoMsg}</strong></span>
              )}
              <span>En etapa: <strong className="text-foreground">{tiempoEnEtapa}</strong></span>
              <span>Motor: <strong className={modoSistema === "automatico" ? "text-green-600" : "text-orange-600"}>{modoSistema}</strong></span>
            </div>
          </div>
          {/* Acciones globales */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <RefreshBtn />
            <AuditorIABtn tipo="lead" id={lead.id} nombre={lead.nombre ?? lead.telefono ?? "Este lead"} />
          </div>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">
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
            seguimientoActivo={seguimientoActivo}
          />
        </div>
      </div>
    </div>
  );
}
