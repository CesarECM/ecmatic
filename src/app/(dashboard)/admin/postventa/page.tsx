import { createServiceClient } from "@/lib/supabase/service";
import { calcularChurnScore } from "@/services/churn";

export const revalidate = 0;
export const metadata = { title: "Post-Venta · ECMatic" };

export default async function PostVentaPage() {
  const supabase = createServiceClient();

  const [{ data: accesos }, { data: encuestas }, { data: referidos }] = await Promise.all([
    supabase
      .from("smartbuilder_accesos")
      .select("lead_id, estado, ultimo_avance, alta_confirmada, updated_at, leads(nombre, telefono)")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("encuestas")
      .select("id, lead_id, estado, created_at, leads(nombre)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("referidos")
      .select("id, codigo, convertido, lead_id, leads(nombre)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Churn scores de leads en etapa Comprado (máx 10)
  const { data: comprados } = await supabase
    .from("leads").select("id, nombre, metadata").eq("pipeline_stage", "Comprado").limit(10);

  const churnData = await Promise.all(
    (comprados ?? []).map((l) => calcularChurnScore(l.id))
  );
  const enRiesgo = churnData.filter((c) => c.score >= 50).sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Post-Venta y Retención</h1>

      {/* SmartBuilderEC accesos */}
      <section className="space-y-2">
        <p className="text-sm font-medium">Candidatos en SmartBuilderEC</p>
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3 text-left">Lead</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Avance</th>
                <th className="p-3 text-center">Alta confirmada</th>
              </tr>
            </thead>
            <tbody>
              {(accesos ?? []).length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sin candidatos registrados</td></tr>
              )}
              {(accesos ?? []).map((a) => {
                const lead = a.leads as unknown as { nombre: string | null; telefono: string | null } | null;
                return (
                  <tr key={a.lead_id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{lead?.nombre ?? lead?.telefono ?? "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs capitalize ${a.estado === "completado" ? "bg-green-100 text-green-700" : a.estado === "activo" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {a.estado}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-24 h-2 rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${a.ultimo_avance}%` }} />
                        </div>
                        <span className="text-xs">{a.ultimo_avance}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-xs">{a.alta_confirmada ? "✅" : "⏳"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Churn en riesgo */}
      {enRiesgo.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium text-red-600">Leads en riesgo de abandono</p>
          <div className="space-y-2">
            {enRiesgo.map((c) => {
              const lead = comprados?.find((l) => l.id === c.leadId);
              return (
                <div key={c.leadId} className="rounded border border-red-200 bg-red-50 p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{lead?.nombre ?? c.leadId.slice(0, 8)}</p>
                    <p className="text-xs text-red-600">{c.factores.join(" · ")}</p>
                  </div>
                  <span className="text-lg font-bold text-red-600">{c.score}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Encuestas y referidos en dos columnas */}
      <div className="grid sm:grid-cols-2 gap-6">
        <section className="space-y-2">
          <p className="text-sm font-medium">Encuestas recientes</p>
          {(encuestas ?? []).length === 0
            ? <p className="text-xs text-muted-foreground">Sin encuestas</p>
            : (encuestas ?? []).map((e) => {
              const lead = e.leads as unknown as { nombre: string | null } | null;
              return (
                <div key={e.id} className="flex justify-between items-center text-sm border-b py-1.5">
                  <span>{lead?.nombre ?? "Lead"}</span>
                  <span className={`text-xs rounded px-2 py-0.5 ${e.estado === "respondida" ? "bg-green-100 text-green-700" : e.estado === "enviada" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{e.estado}</span>
                </div>
              );
            })}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Referidos</p>
          {(referidos ?? []).length === 0
            ? <p className="text-xs text-muted-foreground">Sin referidos generados</p>
            : (referidos ?? []).map((r) => {
              const lead = r.leads as unknown as { nombre: string | null } | null;
              return (
                <div key={r.id} className="flex justify-between items-center text-sm border-b py-1.5">
                  <span>{lead?.nombre ?? "Lead"}</span>
                  <span className="text-xs font-mono text-muted-foreground">{r.codigo}</span>
                  {r.convertido && <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded">Convertido</span>}
                </div>
              );
            })}
        </section>
      </div>
    </div>
  );
}
