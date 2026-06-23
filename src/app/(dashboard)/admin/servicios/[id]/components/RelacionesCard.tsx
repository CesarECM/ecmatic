"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { crearRelacionAction, eliminarRelacionAction } from "../../actions";
import { TIPO_RELACION_LABELS, TIPOS_RELACION } from "@/services/servicio-relaciones";
import type { ServicioRelacion } from "@/services/servicio-relaciones";

interface OtroServicio { id: string; titulo: string }

interface Props {
  servicioId:    string;
  relaciones:    ServicioRelacion[];
  otrosServicios: OtroServicio[];
}

const BADGE_COLOR: Record<string, string> = {
  complementa:         "bg-blue-100 text-blue-700",
  es_leadmagnet_de:    "bg-purple-100 text-purple-700",
  prerequisito_de:     "bg-yellow-100 text-yellow-700",
  version_avanzada_de: "bg-green-100 text-green-700",
  incluye_a:           "bg-teal-100 text-teal-700",
  compite_con:         "bg-orange-100 text-orange-700",
};

export function RelacionesCard({ servicioId, relaciones, otrosServicios }: Props) {
  const [pending, startTransition] = useTransition();

  function handleEliminar(relacionId: string) {
    const tid = toast.loading("Eliminando relación…");
    startTransition(async () => {
      try {
        await eliminarRelacionAction(relacionId, servicioId);
        toast.success("Relación eliminada", { id: tid });
      } catch { toast.error("Error", { id: tid }); }
    });
  }

  function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("origen_id", servicioId);
    const tid = toast.loading("Guardando relación…");
    startTransition(async () => {
      try {
        await crearRelacionAction(fd);
        toast.success("Relación guardada", { id: tid });
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Relaciones con otros servicios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {relaciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin relaciones definidas. La IA puede sugerirlas automáticamente.</p>
        ) : (
          <div className="space-y-2">
            {relaciones.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0 ${BADGE_COLOR[r.tipo] ?? "bg-muted text-foreground"}`}>
                    {TIPO_RELACION_LABELS[r.tipo]}
                  </span>
                  <span className="font-medium truncate">{r.destino_titulo}</span>
                  {r.creado_por === "ia" && <Badge variant="secondary" className="text-[10px] shrink-0">IA</Badge>}
                </div>
                <button onClick={() => handleEliminar(r.id)} disabled={pending} className="text-xs text-red-600 hover:underline shrink-0 ml-2">
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {otrosServicios.length > 0 && (
          <form onSubmit={handleCrear} className="border-t pt-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Agregar relación</p>
            <div className="grid grid-cols-2 gap-2">
              <select name="tipo" className="text-sm border rounded-md px-3 py-1.5 bg-background">
                {TIPOS_RELACION.map(t => (
                  <option key={t} value={t}>{TIPO_RELACION_LABELS[t]}</option>
                ))}
              </select>
              <select name="destino_id" className="text-sm border rounded-md px-3 py-1.5 bg-background">
                {otrosServicios.map(s => (
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
