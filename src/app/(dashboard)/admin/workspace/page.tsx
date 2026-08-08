import { listarTodosActivos, obtenerUltimaIaAt } from "@/services/oportunidades";
import { fetchAprobacionesData } from "@/app/api/admin/workspace/aprobaciones/route";
import { WorkspaceClient } from "./WorkspaceClient";

export const revalidate = 0;
export const metadata   = { title: "Workspace · ECMatic" };

export default async function WorkspacePage() {
  const [oportunidades, ultimaIaAt, initialAprobaciones] = await Promise.all([
    listarTodosActivos().catch(() => ({ top10: [], esperando: [], seguimiento: [] })),
    obtenerUltimaIaAt().catch(() => null),
    fetchAprobacionesData().catch(() => ({
      kb: [], matriz: [], sugerencias: [], clusters: [], kbiItems: [],
      mapaKBIRecursos: {}, etiquetasPendientes: [], mensajesPendientes: [],
      comprobantesPendientes: [], pendientesGHL: [], totalPendientes: 0,
    })),
  ]);

  return (
    <WorkspaceClient
      oportunidades={oportunidades}
      ultimaIaAt={ultimaIaAt}
      initialAprobaciones={initialAprobaciones}
    />
  );
}
