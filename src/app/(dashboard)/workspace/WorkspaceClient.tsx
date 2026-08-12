"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { V2WorkspaceProvider, useV2Workspace, type RealtimeStatus } from "./WorkspaceContext";
import { OportunidadesPane } from "./OportunidadesPane";
import { TareasPane } from "./TareasPane";
import type { V2OportunidadesData } from "@/services/v2/oportunidades";
import type { V2TareasData } from "@/services/v2/tareas";

interface Props {
  initialOportunidades: V2OportunidadesData;
  initialTareas:        V2TareasData;
}

export function WorkspaceClient({ initialOportunidades, initialTareas }: Props) {
  return (
    <V2WorkspaceProvider>
      <WorkspaceLayout initialOportunidades={initialOportunidades} initialTareas={initialTareas} />
    </V2WorkspaceProvider>
  );
}

function WorkspaceLayout({ initialOportunidades, initialTareas }: Props) {
  const { setRealtimeStatus, refreshOportunidades, refreshTareas } = useV2Workspace();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("v2-workspace-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "v2_contact_points" },
        () => refreshTareas()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "v2_opportunities" },
        () => refreshOportunidades()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "v2_kb_items" },
        () => refreshTareas()
      )
      .subscribe((status) => {
        const map: Record<string, RealtimeStatus> = {
          SUBSCRIBED:    "connected",
          CHANNEL_ERROR: "error",
          TIMED_OUT:     "error",
        };
        if (map[status]) setRealtimeStatus(map[status] as RealtimeStatus);
      });

    return () => { supabase.removeChannel(channel); };
  }, [setRealtimeStatus, refreshOportunidades, refreshTareas]);

  return (
    <div className="-m-6 flex h-[calc(100dvh-53px)] overflow-hidden">

      {/* ── Columna izquierda: Oportunidades (380px) ─────────────────── */}
      <div className="w-[380px] shrink-0 flex flex-col border-r bg-card overflow-hidden">
        <OportunidadesPane initial={initialOportunidades} />
      </div>

      {/* ── Columna derecha: Tareas (flexible) ───────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TareasPane initial={initialTareas} />
      </div>

    </div>
  );
}
