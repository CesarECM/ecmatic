// MPS-36 S126.1 — Smart Panel v2: pool ilimitado, 3 secciones, scoring compuesto.

import { listarTodosActivos, obtenerUltimaIaAt } from "@/services/oportunidades";
import { OportunidadesClient } from "./OportunidadesClient";

export const revalidate = 0;
export const metadata   = { title: "Oportunidades · ECMatic" };

export default async function OportunidadesPage() {
  const [lista, ultimaIaAt] = await Promise.all([
    listarTodosActivos().catch(() => ({ top10: [], esperando: [], seguimiento: [] })),
    obtenerUltimaIaAt().catch(() => null),
  ]);

  const total = lista.top10.length + lista.esperando.length + lista.seguimiento.length;

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">Panel de Oportunidades</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {total > 0
            ? `${total} en seguimiento · Top 10 priorizados por IA · La IA pondera ticket, momentum y fecha de compromiso`
            : "Sin leads en seguimiento · Presiona Inicializar para que la IA seleccione los mejores candidatos"}
        </p>
      </div>

      <OportunidadesClient
        lista={lista}
        ultimaIaAt={ultimaIaAt}
      />
    </div>
  );
}
