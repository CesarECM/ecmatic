"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { calcularAsignacionOptima, aplicarAsignaciones, type AsignacionOptima } from "@/services/asignacion-optima";

async function fetchAsignacion(): Promise<AsignacionOptima[]> {
  const res = await fetch("/api/admin/asignacion-optima?secret=" + (process.env.NEXT_PUBLIC_CRON_SECRET ?? ""));
  if (!res.ok) throw new Error("Error al calcular");
  const d = await res.json();
  return d.asignaciones ?? [];
}

interface Props {
  vendedores: { id: string; nombre: string }[];
  leads: { id: string; nombre: string | null; telefono: string | null }[];
}

export function AsignacionOptimaCard({ vendedores, leads }: Props) {
  const [asignaciones, setAsignaciones] = useState<AsignacionOptima[]>([]);
  const [calculado, setCalculado] = useState(false);
  const [pending, startTransition] = useTransition();

  function calcular() {
    startTransition(async () => {
      const tid = toast.loading("Calculando asignación óptima…");
      try {
        // Llamar server action directamente
        const resultado = await fetch("/api/admin/asignacion-optima-ui", { method: "POST" });
        if (!resultado.ok) throw new Error("Error");
        const d = await resultado.json();
        setAsignaciones(d.asignaciones ?? []);
        setCalculado(true);
        toast.success(`${(d.asignaciones ?? []).length} asignaciones calculadas`, { id: tid });
      } catch {
        toast.error("Error al calcular", { id: tid });
      }
    });
  }

  function aplicar() {
    startTransition(async () => {
      const tid = toast.loading("Aplicando asignaciones…");
      try {
        const res = await fetch("/api/admin/asignacion-optima-ui", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asignaciones }),
        });
        if (!res.ok) throw new Error("Error");
        toast.success("Asignaciones aplicadas", { id: tid });
        setAsignaciones([]);
        setCalculado(false);
      } catch {
        toast.error("Error al aplicar", { id: tid });
      }
    });
  }

  const getNombre = (id: string, arr: { id: string; nombre: string | null; telefono: string | null }[]) =>
    arr.find((x) => x.id === id)?.nombre ?? arr.find((x) => x.id === id)?.telefono ?? id.slice(0, 8);
  const getVendedor = (id: string) => vendedores.find((v) => v.id === id)?.nombre ?? id.slice(0, 8);

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="font-medium text-sm">Asignación óptima (Algoritmo Húngaro)</p>
          <p className="text-xs text-muted-foreground">
            Maximiza la conversión esperada total asignando leads sin vendedor al equipo.
          </p>
        </div>
        <button
          onClick={calcular}
          disabled={pending}
          className="text-sm px-4 py-2 rounded-md border font-medium hover:bg-muted disabled:opacity-40"
        >
          {pending ? "Calculando…" : "Calcular propuesta"}
        </button>
      </div>

      {calculado && asignaciones.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin leads sin vendedor o sin vendedores activos.</p>
      )}

      {asignaciones.length > 0 && (
        <>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Lead</th>
                  <th className="px-3 py-2 text-left">Vendedor propuesto</th>
                  <th className="px-3 py-2 text-center">Beneficio esperado</th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{getNombre(a.leadId, leads)}</td>
                    <td className="px-3 py-2">{getVendedor(a.vendedorId)}</td>
                    <td className="px-3 py-2 text-center font-mono">
                      {(a.beneficioEsperado * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={aplicar}
            disabled={pending}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40 hover:opacity-90"
          >
            {pending ? "Aplicando…" : `Aplicar ${asignaciones.length} asignaciones`}
          </button>
        </>
      )}
    </div>
  );
}
