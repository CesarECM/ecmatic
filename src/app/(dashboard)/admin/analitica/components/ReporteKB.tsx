import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

async function toggleActivoKB(id: string, activo: boolean) {
  "use server";
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ activo }).eq("id", id);
  revalidatePath("/admin/analitica");
}

// S11.7 — Reporte de efectividad de la base de conocimiento
export async function ReporteKB() {
  const supabase = createServiceClient();
  const { data: recursos } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, tipo, score_uso, score_cierre, score_confianza, activo, fecha_ultima_actualizacion")
    .eq("aprobado", true)
    .order("score_uso", { ascending: false });

  const todos = recursos ?? [];
  const sinUso = todos.filter((r) => r.score_uso === 0);
  const mejoresCierre = [...todos].sort((a, b) => b.score_cierre - a.score_cierre).slice(0, 5);
  const masUsados = todos.slice(0, 5);

  const diasDesde = (fecha: string) => Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);

  function ScoreBar({ value, max = 1 }: { value: number; max?: number }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-gray-200">
          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{typeof value === 'number' && value < 1 ? `${Math.round(value * 100)}%` : value}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium">Efectividad de la base de conocimiento</p>

      <div className="grid sm:grid-cols-3 gap-3 text-center">
        <div className="rounded border p-3">
          <p className="text-2xl font-bold">{todos.length}</p>
          <p className="text-xs text-muted-foreground">Recursos activos</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-2xl font-bold text-red-500">{sinUso.length}</p>
          <p className="text-xs text-muted-foreground">Sin ningún uso</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-2xl font-bold text-green-600">
            {todos.filter((r) => r.score_cierre > 0.5).length}
          </p>
          <p className="text-xs text-muted-foreground">Alta correlación con cierres</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Más usados */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">MÁS USADOS</p>
          {masUsados.map((r) => (
            <div key={r.id} className="py-1.5 border-b last:border-0 flex justify-between items-center">
              <p className="text-xs truncate max-w-[200px]">{r.titulo}</p>
              <ScoreBar value={r.score_uso} max={Math.max(1, masUsados[0]?.score_uso ?? 1)} />
            </div>
          ))}
        </div>

        {/* Mejores cierres */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">MEJOR CORRELACIÓN CON CIERRES</p>
          {mejoresCierre.map((r) => (
            <div key={r.id} className="py-1.5 border-b last:border-0 flex justify-between items-center">
              <p className="text-xs truncate max-w-[200px]">{r.titulo}</p>
              <ScoreBar value={r.score_cierre} />
            </div>
          ))}
        </div>
      </div>

      {/* Sin uso */}
      {sinUso.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">SIN USO ({sinUso.length})</p>
          <div className="space-y-1">
            {sinUso.slice(0, 5).map((r) => (
              <div key={r.id} className="flex justify-between items-center text-xs border rounded px-2 py-1">
                <span className="truncate max-w-[250px]">{r.titulo}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">hace {diasDesde(r.fecha_ultima_actualizacion)}d</span>
                  <form action={toggleActivoKB.bind(null, r.id, !r.activo)}>
                    <button type="submit" className="text-red-500 hover:underline">Desactivar</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
