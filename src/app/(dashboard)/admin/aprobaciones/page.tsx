import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

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

export default async function AprobacionesPage() {
  const supabase = createServiceClient();

  const [{ data: kb }, { data: matriz }, { data: sugerencias }] = await Promise.all([
    supabase.from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("matriz_nd")
      .select("id, dimensiones, respuesta_sugerida, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("sugerencias_ia")
      .select("id, tipo, titulo, descripcion, prioridad, created_at")
      .is("aprobado", null).order("prioridad").order("created_at"),
  ]);

  const totalPendientes = (kb?.length ?? 0) + (matriz?.length ?? 0) + (sugerencias?.length ?? 0);

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
