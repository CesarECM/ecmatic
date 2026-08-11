"use client";

import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { OportunidadesClient } from "@/app/(dashboard)/admin/oportunidades/OportunidadesClient";
import { LeadDetailPane } from "./LeadDetailPane";
import { AprobacionesPane } from "./AprobacionesPane";
import { NuevoLeadFAB } from "./NuevoLeadFAB";
import { LeadSearchBox } from "./LeadSearchBox";
import type { OportunidadLista } from "@/services/oportunidades";
import type { AprobacionesData } from "@/app/api/admin/workspace/aprobaciones/route";

interface Props {
  oportunidades:          OportunidadLista;
  ultimaIaAt:             string | null;
  initialAprobaciones:    AprobacionesData;
}

export function WorkspaceClient(props: Props) {
  return (
    <WorkspaceProvider>
      <WorkspaceLayout {...props} />
    </WorkspaceProvider>
  );
}

function WorkspaceLayout({ oportunidades, ultimaIaAt, initialAprobaciones }: Props) {
  const { selectedLeadId } = useWorkspace();

  return (
    <div className="-m-6 flex h-[calc(100dvh-53px)] overflow-hidden">

      {/* ── Columna izquierda: Oportunidades (280px) ─────────────── */}
      <div className="w-[280px] shrink-0 flex flex-col border-r bg-card overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Oportunidades
          </p>
          {selectedLeadId && (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" title="Lead seleccionado" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <OportunidadesClient
            lista={oportunidades}
            ultimaIaAt={ultimaIaAt}
            workspaceMode
          />
        </div>
      </div>

      {/* ── Columna central: Lead Detail (flexible) ──────────────── */}
      <div className="flex-1 relative flex flex-col overflow-hidden border-r min-w-0">
        <div className="px-4 py-2 border-b shrink-0 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
            Lead
          </p>
          <LeadSearchBox />
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <LeadDetailPane />
        </div>
        <NuevoLeadFAB />
      </div>

      {/* ── Columna derecha: Aprobaciones (320px) ────────────────── */}
      <div className="w-[320px] shrink-0 flex flex-col bg-card overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Aprobaciones
          </p>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <AprobacionesPane initial={initialAprobaciones} />
        </div>
      </div>

    </div>
  );
}
