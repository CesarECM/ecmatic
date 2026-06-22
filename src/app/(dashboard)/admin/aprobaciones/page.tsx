import { createServiceClient } from "@/lib/supabase/service";
import { listarPendientes } from "@/services/etiquetas";
import { listarMensajesPendientes } from "@/services/mensajes-aprobacion";
import { listarComprobantesPendientes } from "@/services/comprobantes";
import { ColaKBSeccion } from "./ColaKBSeccion";
import { ColaMatrizSeccion } from "./ColaMatrizSeccion";
import { ColaMensajesSeccion } from "./ColaMensajesSeccion";
import { ColaSugerenciasSeccion } from "./ColaSugerenciasSeccion";
import {
  aprobarSugerenciaAction, rechazarSugerenciaAction,
  aprobarClusterAction, rechazarClusterAction,
  aprobarEtiquetaAction, archivarEtiquetaAction,
  aprobarComprobanteAction, rechazarComprobanteAction,
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
    etiquetasPendientes,
    mensajesPendientes,
    comprobantesPendientes,
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
    listarPendientes(),
    listarMensajesPendientes(),
    listarComprobantesPendientes(),
  ]);

  const totalPendientes =
    (kb?.length ?? 0) + (matriz?.length ?? 0) + (sugerencias?.length ?? 0) +
    etiquetasPendientes.length + mensajesPendientes.length + comprobantesPendientes.length;

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

      <ColaMensajesSeccion items={mensajesPendientes} />

      {/* S33.5 + S33.9 — Sugerencias con Brief de Diseño y vista por Clusters */}
      <ColaSugerenciasSeccion
        items={(sugerencias ?? []).map((s: Record<string, unknown>) => ({
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
