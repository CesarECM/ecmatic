import { createServiceClient } from "@/lib/supabase/service";
import { listarPendientes } from "@/services/etiquetas";
import { listarMensajesPendientes } from "@/services/mensajes-aprobacion";
import { listarComprobantesPendientes } from "@/services/comprobantes";
import { listarPendientesGHL } from "@/services/ghl-aprobacion";
import { ColaKBSeccion } from "./ColaKBSeccion";
import { ColaMatrizSeccion } from "./ColaMatrizSeccion";
import { ColaMensajesSeccion } from "./ColaMensajesSeccion";
import { ColaSugerenciasSeccion } from "./ColaSugerenciasSeccion";
import { ColaSugerenciasKBSeccion } from "./ColaSugerenciasKBSeccion";
import { ColaGHLSeccion } from "./ColaGHLSeccion";
import { KBISugerenciasSeccion } from "./KBISugerenciasSeccion";
import type { RecursoKBResumen } from "./SugerenciaKBCard";
import type { RecursoActual } from "./KBISugerenciaModal";
import type { KBISugerenciaItem } from "./KBISugerenciaCard";
import {
  aprobarSugerenciaAction, rechazarSugerenciaAction,
  aprobarClusterAction, rechazarClusterAction,
  aprobarEtiquetaAction, archivarEtiquetaAction,
  aprobarComprobanteAction, rechazarComprobanteAction,
  aprobarSugerenciaKBAction, eliminarSugerenciaAction,
  previsualizarCambioKBAction,
  aprobarKBISugerenciaAction, rechazarKBISugerenciaAction,
} from "./actions";

export const metadata = { title: "Cola de Aprobaciones · ECMatic" };
export const revalidate = 0;

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

export default async function AprobacionesPage() {
  const supabase = createServiceClient();

  const [
    { data: kb },
    { data: matriz },
    { data: sugerencias },
    { data: clusters },
    { data: kbiSugerencias },
    etiquetasPendientes,
    mensajesPendientes,
    comprobantesPendientes,
    pendientesGHL,
  ] = await Promise.all([
    supabase.from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("matriz_nd")
      .select("id, dimensiones, respuesta_sugerida, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    (supabase as any).from("sugerencias_ia")
      .select("id, tipo, titulo, descripcion, prioridad, created_at, tipo_brief, servicio_id, cluster_id, metadata")
      .is("aprobado", null).order("prioridad").order("created_at"),
    (supabase as any).from("clusters_sugerencias")
      .select("id, titulo_generado, conteo").order("conteo", { ascending: false }),
    (supabase as any).from("kbi_sugerencias")
      .select("id, recurso_id, tipo_accion, tipo_recurso_nuevo, titulo_propuesto, contenido_propuesto, razon, origen, created_at")
      .eq("estado", "pendiente").order("created_at"),
    listarPendientes(),
    listarMensajesPendientes(),
    listarComprobantesPendientes(),
    listarPendientesGHL().catch(() => []),
  ]);

  // MPS-20 — Fetch recursos actuales referenciados en kbi_sugerencias (para before/after en modal)
  const kbiItems = (kbiSugerencias ?? []) as KBISugerenciaItem[];
  const kbiRecursoIds = [...new Set(kbiItems.map(s => s.recurso_id).filter(Boolean) as string[])];
  const mapaKBIRecursos: Record<string, RecursoActual> = {};
  if (kbiRecursoIds.length > 0) {
    const { data: kbiRecursos } = await supabase
      .from("recursos_conocimiento")
      .select("id, titulo, contenido")
      .in("id", kbiRecursoIds);
    for (const r of (kbiRecursos ?? []) as { id: string; titulo: string; contenido: string }[]) {
      mapaKBIRecursos[r.id] = { titulo: r.titulo, contenido: r.contenido };
    }
  }

  // MPS-14 S52 — Separar sugerencias KB de las generales y hacer batch-fetch de recursos referenciados
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todasSugerencias = (sugerencias ?? []) as any[];
  const sugerenciasKB    = todasSugerencias.filter((s) => s.tipo === "kb_calidad");
  const sugerenciasOtras = todasSugerencias.filter((s) => s.tipo !== "kb_calidad");

  // Recopilar todos los IDs de recursos KB referenciados en el metadata
  const kbIds = new Set<string>();
  for (const s of sugerenciasKB) {
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.recurso_id === "string") kbIds.add(meta.recurso_id);
    if (Array.isArray(meta.recurso_ids)) (meta.recurso_ids as string[]).forEach((id) => kbIds.add(id));
    if (typeof meta.id_a === "string") kbIds.add(meta.id_a);
    if (typeof meta.id_b === "string") kbIds.add(meta.id_b);
  }

  const mapaKB: Record<string, RecursoKBResumen> = {};
  if (kbIds.size > 0) {
    const { data: recursosKB } = await supabase
      .from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido")
      .in("id", Array.from(kbIds));
    for (const r of (recursosKB ?? []) as RecursoKBResumen[]) {
      mapaKB[r.id] = r;
    }
  }

  const totalPendientes =
    (kb?.length ?? 0) + (matriz?.length ?? 0) + (sugerencias?.length ?? 0) +
    kbiItems.length +
    etiquetasPendientes.length + mensajesPendientes.length + comprobantesPendientes.length +
    pendientesGHL.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cola de aprobaciones</h1>
        <p className="text-sm text-muted-foreground">{totalPendientes} pendientes de revisión</p>
      </div>

      {totalPendientes === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todo aprobado — no hay sugerencias pendientes.
        </div>
      )}

      {/* MPS-20 S76.3 — Sugerencias KBI (ciclo de aprendizaje real) */}
      <KBISugerenciasSeccion
        items={kbiItems}
        recursosActuales={mapaKBIRecursos}
        aprobarAction={aprobarKBISugerenciaAction}
        rechazarAction={rechazarKBISugerenciaAction}
      />

      <ColaKBSeccion items={kb ?? []} />

      <ColaMatrizSeccion items={(matriz ?? []).map((m) => ({ ...m, dimensiones: m.dimensiones as Record<string, string> }))} />

      {etiquetasPendientes.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-pink-500" />
            Etiquetas IA ({etiquetasPendientes.length})
          </p>
          {etiquetasPendientes.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs bg-pink-100 text-pink-700 border border-pink-200 rounded px-1.5 py-0.5">
                    {item.categoria_nombre}
                  </span>
                  <p className="font-medium text-sm mt-1">{item.nombre}</p>
                  {item.descripcion && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">hace {diasDesde(item.created_at)}d</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <form action={aprobarEtiquetaAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-pink-600 px-3 py-1 text-xs text-white hover:bg-pink-700">Aprobar</button>
                  </form>
                  <form action={archivarEtiquetaAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Archivar</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {comprobantesPendientes.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            Comprobantes de pago ({comprobantesPendientes.length})
          </p>
          {comprobantesPendientes.map((item) => (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {item.lead_nombre ?? item.telefono} · {item.telefono} · hace {diasDesde(item.created_at)}d
                  </p>
                  {item.wa_media_id && (
                    <a href={`/api/admin/comprobante-imagen/${item.wa_media_id}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-amber-700 underline mt-1 inline-block">
                      Ver imagen
                    </a>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <form action={aprobarComprobanteAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700">Aprobar → Comprado</button>
                  </form>
                  <form action={rechazarComprobanteAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Rechazar</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <ColaGHLSeccion items={pendientesGHL} />

      <ColaMensajesSeccion items={mensajesPendientes} />

      {/* MPS-14 S52 — Sugerencias kb_calidad con ficha modal + vista previa antes/después */}
      <ColaSugerenciasKBSeccion
        items={sugerenciasKB.map((s) => ({ ...s, metadata: (s.metadata ?? {}) as Record<string, unknown> }))}
        recursosKB={mapaKB}
        aplicarAction={aprobarSugerenciaKBAction}
        eliminarAction={eliminarSugerenciaAction}
        previsualizarAction={previsualizarCambioKBAction}
      />

      {/* S33.5 + S33.9 — Sugerencias generales con Brief de Diseño y vista por Clusters */}
      <ColaSugerenciasSeccion
        items={sugerenciasOtras.map((s) => ({
          ...s,
          metadata: (s.metadata ?? {}) as Record<string, unknown>,
        }))}
        clusters={clusters ?? []}
        aprobarAction={aprobarSugerenciaAction}
        rechazarAction={rechazarSugerenciaAction}
        aprobarClusterAction={aprobarClusterAction}
        rechazarClusterAction={rechazarClusterAction}
      />
    </div>
  );
}
