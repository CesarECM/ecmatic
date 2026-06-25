import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerProtocoloCompleto } from "@/services/protocolos-seguimiento";
import { Badge } from "@/components/ui/badge";
import { ProtocoloBuilder } from "./components/ProtocoloBuilder";

export const revalidate = 0;

export type EtapaOpcion = { id: string; nombre: string; ruta: string };

export default async function ProtocoloDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [protocolo, { data: etapasData }] = await Promise.all([
    obtenerProtocoloCompleto(id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createServiceClient() as any)
      .from("pipeline_etapas")
      .select("id, nombre, ruta")
      .eq("activo", true)
      .order("ruta")
      .order("orden"),
  ]);

  if (!protocolo) notFound();

  const etapas: EtapaOpcion[] = (etapasData ?? []) as EtapaOpcion[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <a href="/admin/protocolos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Protocolos
        </a>
        <h1 className="text-xl font-semibold flex-1">{protocolo.nombre}</h1>
        <Badge
          className={`shrink-0 ${
            protocolo.activo
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-gray-100 text-gray-500 border border-gray-200"
          }`}
        >
          {protocolo.activo ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      <ProtocoloBuilder protocolo={protocolo} etapas={etapas} />
    </div>
  );
}
