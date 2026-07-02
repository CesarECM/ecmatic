import { createServiceClient } from "@/lib/supabase/service";
import { ReglasList } from "@/components/reglas/reglas-list";
import { NuevaReglaForm } from "@/components/reglas/nueva-regla-form";
import { TagBuilder } from "@/components/reglas/tag-builder";

export const metadata = { title: "Reglas Conversacionales · ECMatic" };
export const revalidate = 0;

export default async function ReglasPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reglas } = await (createServiceClient() as any)
    .from("reglas_conversacionales")
    .select("id, nombre, descripcion, tipo, condiciones, instruccion, prioridad, activa, aprobada, usos, cierres, score, origen, aprobada_at, created_at")
    .order("prioridad", { ascending: false })
    .order("created_at", { ascending: false });

  const total      = (reglas?.length ?? 0) as number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientes = reglas?.filter((r: any) => !r.aprobada).length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activas    = reglas?.filter((r: any) => r.activa && r.aprobada).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reglas Conversacionales</h1>
          <p className="text-sm text-muted-foreground">
            {total} reglas · {activas} activas · {pendientes} pendientes de aprobación
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            SI [condiciones] → instrucción para Claude. Las reglas aprobadas y activas se inyectan en el system prompt.
          </p>
        </div>
        <NuevaReglaForm />
      </div>

      <TagBuilder />

      <ReglasList reglas={reglas ?? []} />
    </div>
  );
}
