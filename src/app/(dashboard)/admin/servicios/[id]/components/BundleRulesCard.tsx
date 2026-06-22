"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { crearBundleReglaAction, eliminarBundleReglaAction } from "../../actions";

interface BundleRegla {
  id: string;
  servicio_destino_id: string;
  tipo: "complementa" | "leadmagnet";
  destino_titulo: string;
}

interface OtroServicio { id: string; titulo: string }

interface Props {
  servicioId: string;
  reglas: BundleRegla[];
  otrosServicios: OtroServicio[];
}

const TIPO_LABELS = { complementa: "Complementa a", leadmagnet: "Es leadmagnet de" } as const;

export function BundleRulesCard({ servicioId, reglas, otrosServicios }: Props) {
  const [pending, startTransition] = useTransition();

  function handleEliminar(reglaId: string) {
    const tid = toast.loading("Eliminando relación…");
    startTransition(async () => {
      try {
        await eliminarBundleReglaAction(reglaId, servicioId);
        toast.success("Relación eliminada", { id: tid });
      } catch {
        toast.error("Error al eliminar", { id: tid });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Relaciones con otros servicios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Relaciones existentes */}
        {reglas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin relaciones definidas aún.</p>
        ) : (
          <div className="space-y-2">
            {reglas.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm rounded-md border px-3 py-2">
                <div>
                  <span className="text-xs text-muted-foreground mr-2">{TIPO_LABELS[r.tipo]}</span>
                  <span className="font-medium">{r.destino_titulo}</span>
                </div>
                <button
                  disabled={pending}
                  onClick={() => handleEliminar(r.id)}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formulario nueva relación */}
        {otrosServicios.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("origen_id", servicioId);
              const tid = toast.loading("Guardando relación…");
              startTransition(async () => {
                try {
                  await crearBundleReglaAction(fd);
                  toast.success("Relación guardada", { id: tid });
                  (e.target as HTMLFormElement).reset();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error", { id: tid });
                }
              });
            }}
            className="flex gap-2 items-end border-t pt-3"
          >
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Este servicio…</label>
              <select name="tipo" className="w-full text-sm border rounded-md px-3 py-1.5 bg-background">
                <option value="complementa">Complementa a</option>
                <option value="leadmagnet">Es leadmagnet de</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Servicio destino</label>
              <select name="destino_id" className="w-full text-sm border rounded-md px-3 py-1.5 bg-background">
                {otrosServicios.map((s) => (
                  <option key={s.id} value={s.id}>{s.titulo}</option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
