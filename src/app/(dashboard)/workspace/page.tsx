import type { Metadata } from "next";
import { listarOportunidades } from "@/services/v2/oportunidades";
import { listarTareas } from "@/services/v2/tareas";
import { WorkspaceClient } from "./WorkspaceClient";

export const metadata: Metadata = { title: "Workspace — ECMatic" };

export default async function WorkspacePage() {
  const [oportunidades, tareas] = await Promise.all([
    listarOportunidades(),
    listarTareas(),
  ]);
  return <WorkspaceClient initialOportunidades={oportunidades} initialTareas={tareas} />;
}
