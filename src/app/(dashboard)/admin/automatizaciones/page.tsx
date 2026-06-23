import { CRONS } from "@/lib/automatizaciones/registry";
import { ultimasEjecuciones } from "@/services/cron-log";
import { AutomatizacionesClient } from "./AutomatizacionesClient";

export const metadata = { title: "Automatizaciones · ECMatic" };
export const revalidate = 0;

export default async function AutomatizacionesPage() {
  const nombres = CRONS.map((c) => c.name);
  const ultimas = await ultimasEjecuciones(nombres);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground">
          Panel central de CRONs. Consulta cuándo se ejecutó cada uno y dispáralo manualmente.
        </p>
      </div>
      <AutomatizacionesClient crons={CRONS} ultimas={ultimas} />
    </div>
  );
}
