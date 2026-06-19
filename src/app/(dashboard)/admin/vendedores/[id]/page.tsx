import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { calcularMetricasVendedor, generarCoachingIA } from "@/services/vendedor-metricas";
import { listarTranscriptos } from "@/services/transcriptos";

interface Props { params: Promise<{ id: string }> }

export const revalidate = 0;

export default async function VendedorDetallePage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: vendedor } = await supabase.from("vendedores").select("id, nombre, email").eq("id", id).single();
  if (!vendedor) notFound();

  const [metricas, coaching, transcriptos] = await Promise.all([
    calcularMetricasVendedor(id),
    generarCoachingIA(id),
    listarTranscriptos(),
  ]);

  const misTranscriptos = transcriptos.filter((t) => {
    const lead = t as { cita_id?: string | null };
    return lead.cita_id !== undefined;
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">{vendedor.nombre}</h1>
        <p className="text-sm text-muted-foreground">{vendedor.email}</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Citas (30d)", value: metricas.totalCitas },
          { label: "Show rate", value: `${Math.round(metricas.showRate * 100)}%` },
          { label: "Conversión", value: `${Math.round(metricas.tasaConversion * 100)}%` },
          { label: "Promesas vencidas", value: metricas.promesasVencidas },
        ].map((m) => (
          <div key={m.label} className="rounded border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Coaching IA */}
      {coaching.length > 0 && (
        <div className="rounded border bg-blue-50 p-4 space-y-2">
          <p className="text-sm font-medium text-blue-900">Sugerencias de coaching — IA</p>
          <ul className="space-y-1">
            {coaching.map((s, i) => (
              <li key={i} className="text-sm text-blue-800 flex gap-2">
                <span>•</span><span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcriptos */}
      <div>
        <p className="text-sm font-medium mb-2">Transcriptos de sesiones ({misTranscriptos.length})</p>
        {misTranscriptos.length === 0
          ? <p className="text-sm text-muted-foreground">Sin transcriptos registrados.</p>
          : (
            <div className="space-y-2">
              {misTranscriptos.slice(0, 5).map((t) => (
                <div key={t.id} className="rounded border p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span>{new Date(t.created_at).toLocaleDateString("es-MX")}</span>
                    {t.temperatura_cierre && (
                      <span className={`rounded px-2 py-0.5 text-xs capitalize ${
                        t.temperatura_cierre === "caliente" ? "bg-green-100 text-green-700" :
                        t.temperatura_cierre === "tibia" ? "bg-yellow-100 text-yellow-700" :
                        "bg-blue-100 text-blue-700"}`}>{t.temperatura_cierre}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
