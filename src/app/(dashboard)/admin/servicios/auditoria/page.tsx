import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Auditoría de Servicios IA · ECMatic" };
export const revalidate = 0;

const URGENCIA_COLOR: Record<string, string> = {
  alta:  "bg-red-100 text-red-700",
  media: "bg-yellow-100 text-yellow-700",
  baja:  "bg-blue-100 text-blue-700",
};

const ACCION_LABEL: Record<string, string> = {
  separar:         "✂️ Separar",
  unir:            "🔗 Unir",
  crear:           "➕ Crear",
  editar:          "✏️ Editar",
  eliminar:        "🗑️ Eliminar",
  completar_campo: "📝 Completar",
};

export default async function AuditoriaServiciosPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const [sugRes, svcRes] = await Promise.all([
    supabase
      .from("sugerencias_ia")
      .select("id, titulo, contenido, metadata, servicio_id, created_at")
      .eq("categoria", "auditor_servicio")
      .is("aprobado", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("servicios").select("id, titulo, icono").eq("activo", true),
  ]);

  const sugerencias = (sugRes.data ?? []) as {
    id: string; titulo: string; contenido: string;
    metadata: Record<string, unknown>; servicio_id: string | null; created_at: string;
  }[];

  const servicios = (svcRes.data ?? []) as { id: string; titulo: string; icono: string | null }[];
  const svcMap = new Map(servicios.map(s => [s.id, s]));

  const grouped = sugerencias.reduce<Record<string, typeof sugerencias>>((acc, s) => {
    const key = s.servicio_id ?? "__sin_servicio";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auditoría IA de Servicios</h1>
          <p className="text-sm text-muted-foreground">
            {sugerencias.length} sugerencia{sugerencias.length !== 1 ? "s" : ""} pendientes ·{" "}
            <Link href="/admin/aprobaciones" className="text-primary hover:underline">Ver panel de aprobaciones →</Link>
          </p>
        </div>
      </div>

      {sugerencias.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay sugerencias pendientes. El auditor analiza cada servicio automáticamente al editarlo.
        </div>
      )}

      {Object.entries(grouped).map(([svcId, items]) => {
        const svc = svcMap.get(svcId);
        return (
          <div key={svcId} className="space-y-3">
            <div className="flex items-center gap-2">
              {svc?.icono && <span>{svc.icono}</span>}
              <h2 className="font-semibold text-sm">
                {svc ? (
                  <Link href={`/admin/servicios/${svcId}`} className="hover:underline">
                    {svc.titulo}
                  </Link>
                ) : "Sin servicio asociado"}
              </h2>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>

            <div className="space-y-2 pl-4">
              {items.map((s) => {
                const urgencia = s.metadata?.urgencia as string | undefined;
                const accion   = s.metadata?.accion   as string | undefined;
                const afectados = (s.metadata?.servicio_ids_afectados as string[] | undefined) ?? [];

                return (
                  <div key={s.id} className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {accion && <span className="text-xs text-muted-foreground">{ACCION_LABEL[accion] ?? accion}</span>}
                      {urgencia && (
                        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${URGENCIA_COLOR[urgencia] ?? "bg-muted"}`}>
                          {urgencia}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(s.created_at).toLocaleDateString("es-MX")}
                      </span>
                    </div>

                    <p className="text-sm font-medium">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.contenido}</p>

                    {afectados.length > 1 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {afectados.map(aid => {
                          const as2 = svcMap.get(aid);
                          return as2 ? (
                            <Link key={aid} href={`/admin/servicios/${aid}`} className="text-[10px] text-primary hover:underline bg-primary/10 rounded px-1.5 py-0.5">
                              {as2.titulo}
                            </Link>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
