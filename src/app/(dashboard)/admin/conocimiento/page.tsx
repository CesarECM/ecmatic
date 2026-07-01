import { createServiceClient } from "@/lib/supabase/service";
import { detectarObsoletos } from "@/services/conocimiento";
import { RecursosList } from "@/components/conocimiento/recursos-list";
import { AlertasKB } from "@/components/conocimiento/alertas-kb";
import { ImportarFuente } from "@/components/conocimiento/importar-fuente";

export const metadata = { title: "Base de Conocimiento · ECMatic" };
export const revalidate = 0;

export default async function ConocimientoPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: recursos }, alertas] = await Promise.all([
    (createServiceClient() as any)
      .from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido, score_confianza, score_uso, kbi_score, aprobado, activo, origen, created_at, versiones_previas, caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es, contextos_aplica")
      .neq("tipo", "servicio")   // S32.7 — servicios viven en /admin/servicios
      .order("created_at", { ascending: false }),
    detectarObsoletos(),
  ]);

  const total = (recursos?.length ?? 0) as number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientes = recursos?.filter((r: any) => !r.aprobado).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de Conocimiento</h1>
          <p className="text-sm text-muted-foreground">
            {total} recursos · {pendientes} pendientes de aprobación
            {" · "}
            <a href="/admin/servicios" className="text-primary hover:underline">Ver catálogo de servicios →</a>
          </p>
        </div>
        <ImportarFuente />
      </div>
      <AlertasKB alertas={alertas} />
      <RecursosList recursos={recursos ?? []} />
    </div>
  );
}
