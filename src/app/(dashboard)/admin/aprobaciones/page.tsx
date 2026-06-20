import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { listarPendientes, aprobarEtiqueta, archivarEtiqueta } from "@/services/etiquetas";
import { listarMensajesPendientes, marcarMensajeEnviado, rechazarMensaje } from "@/services/mensajes-aprobacion";
import { listarComprobantesPendientes, aprobarComprobante, rechazarComprobante } from "@/services/comprobantes";
import { enviarRespuestaWhatsApp } from "@/services/whatsapp-sender";

export const metadata = { title: "Cola de Aprobaciones · ECMatic" };
export const revalidate = 0;

const TIPO_COLOR: Record<string, string> = {
  kb:      "bg-blue-100 text-blue-700 border-blue-200",
  matriz:  "bg-orange-100 text-orange-700 border-orange-200",
  pipeline:"bg-amber-100 text-amber-700 border-amber-200",
  flujo:   "bg-green-100 text-green-700 border-green-200",
  avatar:  "bg-purple-100 text-purple-700 border-purple-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-300 text-gray-700",
};

async function aprobarKB(id: string) {
  "use server";
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ aprobado: true }).eq("id", id);
  revalidatePath("/admin/aprobaciones");
}

async function aprobarMatriz(id: string) {
  "use server";
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ aprobado: true }).eq("id", id);
  revalidatePath("/admin/aprobaciones");
}

async function aprobarSugerencia(id: string) {
  "use server";
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").update({ aprobado: true }).eq("id", id);
  revalidatePath("/admin/aprobaciones");
}

async function aprobarEtiquetaAction(id: string) {
  "use server";
  await aprobarEtiqueta(id);
  revalidatePath("/admin/aprobaciones");
}

async function archivarEtiquetaAction(id: string) {
  "use server";
  await archivarEtiqueta(id);
  revalidatePath("/admin/aprobaciones");
}

async function aprobarMensajeAction(id: string, telefono: string, bloques: string[]) {
  "use server";
  await enviarRespuestaWhatsApp(telefono, bloques);
  await marcarMensajeEnviado(id);
  revalidatePath("/admin/aprobaciones");
}

async function rechazarMensajeAction(id: string) {
  "use server";
  await rechazarMensaje(id);
  revalidatePath("/admin/aprobaciones");
}

async function aprobarComprobanteAction(id: string) {
  "use server";
  await aprobarComprobante(id);
  revalidatePath("/admin/aprobaciones");
}

async function rechazarComprobanteAction(id: string) {
  "use server";
  await rechazarComprobante(id);
  revalidatePath("/admin/aprobaciones");
}

export default async function AprobacionesPage() {
  const supabase = createServiceClient();

  const [{ data: kb }, { data: matriz }, { data: sugerencias }, etiquetasPendientes, mensajesPendientes, comprobantesPendientes] = await Promise.all([
    supabase.from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("matriz_nd")
      .select("id, dimensiones, respuesta_sugerida, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("sugerencias_ia")
      .select("id, tipo, titulo, descripcion, prioridad, created_at")
      .is("aprobado", null).order("prioridad").order("created_at"),
    listarPendientes(),
    listarMensajesPendientes(),
    listarComprobantesPendientes(),
  ]);

  const totalPendientes =
    (kb?.length ?? 0) + (matriz?.length ?? 0) + (sugerencias?.length ?? 0) +
    etiquetasPendientes.length + mensajesPendientes.length + comprobantesPendientes.length;

  function diasDesde(fecha: string) {
    return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  }

  function prioridadKB(item: { origen: string; created_at: string }): string {
    const dias = diasDesde(item.created_at);
    if (dias > 7) return "importante";
    if (item.origen === "ia_sugerido") return "puede_esperar";
    return "puede_esperar";
  }

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

      {/* Base de conocimiento */}
      {(kb ?? []).length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            Base de conocimiento ({kb?.length})
          </p>
          {(kb ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs rounded border px-1.5 py-0.5 ${TIPO_COLOR.kb}`}>{item.tipo}</span>
                    <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[prioridadKB(item)]}`}>{prioridadKB(item).replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
                  </div>
                  <p className="font-medium text-sm mt-1">{item.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.contenido}</p>
                </div>
                <form action={aprobarKB.bind(null, item.id)}>
                  <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 shrink-0">
                    Aprobar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Matriz nD */}
      {(matriz ?? []).length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            Matriz nD ({matriz?.length})
          </p>
          {(matriz ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(item.dimensiones as Record<string, string>).map(([k, v]) => (
                      <span key={k} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{k}: {v}</span>
                    ))}
                    <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.respuesta_sugerida}</p>
                </div>
                <form action={aprobarMatriz.bind(null, item.id)}>
                  <button type="submit" className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 shrink-0">
                    Aprobar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* S14.3 — Etiquetas sugeridas por IA */}
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
                    <button type="submit" className="rounded bg-pink-600 px-3 py-1 text-xs text-white hover:bg-pink-700">
                      Aprobar
                    </button>
                  </form>
                  <form action={archivarEtiquetaAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
                      Archivar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* S18.2 — Comprobantes de pago pendientes de verificación */}
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
                    <a
                      href={`/api/admin/comprobante-imagen/${item.wa_media_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-amber-700 underline mt-1 inline-block"
                    >
                      Ver imagen
                    </a>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <form action={aprobarComprobanteAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700">
                      Aprobar → Comprado
                    </button>
                  </form>
                  <form action={rechazarComprobanteAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* S17.3/S17.4 — Mensajes en cola (Modo Seguro / Seguro Automático) */}
      {mensajesPendientes.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-teal-500" />
            Respuestas en cola ({mensajesPendientes.length})
          </p>
          {mensajesPendientes.map((item) => (
            <div key={item.id} className="rounded-lg border border-teal-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {item.lead_nombre ?? item.telefono} · hace {diasDesde(item.created_at)}d
                    </span>
                    {item.score_confianza !== null && (
                      <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                        item.score_confianza >= 0.7
                          ? "bg-green-100 text-green-700"
                          : item.score_confianza >= 0.4
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        Score {(item.score_confianza * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-3">{item.respuesta}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <form action={aprobarMensajeAction.bind(null, item.id, item.telefono, item.bloques)}>
                    <button type="submit" className="rounded bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-700">
                      Enviar
                    </button>
                  </form>
                  <form action={rechazarMensajeAction.bind(null, item.id)}>
                    <button type="submit" className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Otras sugerencias IA */}
      {(sugerencias ?? []).length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500" />
            Sugerencias generales ({sugerencias?.length})
          </p>
          {(sugerencias ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs rounded border px-1.5 py-0.5 ${TIPO_COLOR[item.tipo] ?? TIPO_COLOR.general}`}>{item.tipo}</span>
                    <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[item.prioridad]}`}>{item.prioridad.replace("_", " ")}</span>
                  </div>
                  <p className="font-medium text-sm mt-1">{item.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</p>
                </div>
                <form action={aprobarSugerencia.bind(null, item.id)}>
                  <button type="submit" className="rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 shrink-0">
                    Aprobar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
