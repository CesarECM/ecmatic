import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import type { EstadoCita } from "@/lib/supabase/types";

const BADGE: Record<EstadoCita, string> = {
  pendiente:  "bg-yellow-100 text-yellow-800",
  confirmada: "bg-blue-100 text-blue-800",
  show:       "bg-green-100 text-green-800",
  noshow:     "bg-red-100 text-red-800",
  cancelada:  "bg-gray-100 text-gray-600",
};

export const revalidate = 0;

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const svc = createServiceClient();
  const { data: vendedor } = await svc
    .from("vendedores").select("id, nombre").eq("profile_id", user!.id).single();

  if (!vendedor) {
    return <p className="text-sm text-muted-foreground p-6">Tu cuenta no está vinculada a un vendedor.</p>;
  }

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde.getTime() + 14 * 24 * 60 * 60 * 1000);

  const { data: citas } = await svc
    .from("citas")
    .select("id, fecha_inicio, fecha_fin, estado, google_meet_link, resultado, leads(nombre, telefono)")
    .eq("vendedor_id", vendedor.id)
    .gte("fecha_inicio", desde.toISOString())
    .lte("fecha_inicio", hasta.toISOString())
    .order("fecha_inicio");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mi agenda — próximas 2 semanas</h1>
        <p className="text-sm text-muted-foreground">{citas?.length ?? 0} citas agendadas</p>
      </div>

      {(!citas || citas.length === 0) && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin citas próximas en los próximos 14 días.
        </div>
      )}

      <div className="space-y-3">
        {(citas ?? []).map((c) => {
          const lead = c.leads as unknown as { nombre: string | null; telefono: string | null } | null;
          const inicio = new Date(c.fecha_inicio);
          const necesitaPostSesion = (c.estado === "show" || c.estado === "noshow") && !c.resultado;

          return (
            <div key={c.id} className={`rounded-lg border bg-card p-4 space-y-2 ${necesitaPostSesion ? "border-orange-300" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{lead?.nombre ?? lead?.telefono ?? "Lead"}</p>
                  <p className="text-sm text-muted-foreground">
                    {inicio.toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short" })}
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${BADGE[c.estado as EstadoCita]}`}>
                  {c.estado}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {c.google_meet_link && (
                  <a href={c.google_meet_link} target="_blank"
                    className="text-xs text-blue-600 hover:underline">📹 Unirse a Meet</a>
                )}
                {necesitaPostSesion && (
                  <Link href={`/vendedor/cita/${c.id}/post-sesion`}
                    className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600">
                    Llenar ficha post-sesión
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
