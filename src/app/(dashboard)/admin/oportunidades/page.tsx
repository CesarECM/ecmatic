// MPS-34 S121.1 — Panel de Oportunidades de Cierre.
// Muestra exactamente las 10 oportunidades más cercanas al cierre.
// La IA puntúa, resume y sugiere; César decide y reordena con DnD.

import { listarOportunidades, obtenerUltimaIaAt } from "@/services/oportunidades";
import { OportunidadesClient } from "./OportunidadesClient";

export const revalidate = 0;
export const metadata   = { title: "Oportunidades · ECMatic" };

export default async function OportunidadesPage() {
  const [oportunidades, ultimaIaAt] = await Promise.all([
    listarOportunidades().catch(() => []),
    obtenerUltimaIaAt().catch(() => null),
  ]);

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">Top 10 Oportunidades</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Las {oportunidades.length > 0 ? oportunidades.length : "—"} oportunidades más cercanas al cierre ·
          Arrastra para reordenar · La IA puntúa y sugiere la siguiente acción
        </p>
      </div>

      <OportunidadesClient
        oportunidades={oportunidades}
        ultimaIaAt={ultimaIaAt}
        panelVacio={oportunidades.length === 0}
      />
    </div>
  );
}
