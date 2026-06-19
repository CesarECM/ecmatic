import { createServiceClient } from "@/lib/supabase/service";
import { RecursosList } from "@/components/conocimiento/recursos-list";

export const metadata = { title: "Base de Conocimiento · ECMatic" };
export const revalidate = 0;

export default async function ConocimientoPage() {
  const { data: recursos } = await createServiceClient()
    .from("recursos_conocimiento")
    .select("id, tipo, titulo, contenido, score_confianza, score_uso, aprobado, activo, origen, created_at")
    .order("created_at", { ascending: false });

  const total = recursos?.length ?? 0;
  const pendientes = recursos?.filter((r) => !r.aprobado).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de Conocimiento</h1>
          <p className="text-sm text-muted-foreground">
            {total} recursos · {pendientes} pendientes de aprobación
          </p>
        </div>
      </div>
      <RecursosList recursos={recursos ?? []} />
    </div>
  );
}
