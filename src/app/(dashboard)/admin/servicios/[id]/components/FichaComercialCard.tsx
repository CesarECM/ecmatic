"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actualizarDatosGeneralesAction } from "../../actions";
import type { Servicio, ModalidadServicio } from "@/services/servicios";

const MODALIDADES: { value: ModalidadServicio; label: string }[] = [
  { value: "presencial", label: "Presencial" },
  { value: "en_linea",   label: "En línea"   },
  { value: "hibrido",    label: "Híbrido"    },
];

export function FichaComercialCard({ servicio }: { servicio: Servicio }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", servicio.id);
    const tid = toast.loading("Guardando…");
    startTransition(async () => {
      try {
        await actualizarDatosGeneralesAction(fd);
        toast.success("Ficha actualizada — el auditor IA revisará los cambios", { id: tid });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ficha comercial</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Argumentación de venta */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Argumentación</p>
            {[
              { name: "caracteristicas", label: "Características" },
              { name: "beneficios",      label: "Beneficios" },
              { name: "ventajas",        label: "Ventajas competitivas" },
              { name: "para_quien_es",   label: "¿Para quién es?" },
              { name: "para_quien_no_es", label: "¿Para quién NO es?" },
            ].map(({ name, label }) => (
              <div key={name} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Textarea
                  name={name}
                  defaultValue={(servicio as Record<string, unknown>)[name] as string ?? ""}
                  rows={2}
                  placeholder={label}
                />
              </div>
            ))}
          </div>

          {/* Logística */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Logística</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Modalidad</label>
                <select name="modalidad" defaultValue={servicio.modalidad ?? ""} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="">Sin especificar</option>
                  {MODALIDADES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Duración (horas)</label>
                <Input name="duracion_horas" type="number" min={0} defaultValue={servicio.duracion_horas ?? ""} placeholder="8" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Requisitos previos</label>
              <Textarea name="requisitos_previos" defaultValue={servicio.requisitos_previos ?? ""} rows={2} placeholder="¿Qué debe tener o saber el candidato?" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Entregables (separados por coma)</label>
              <Input name="entregables" defaultValue={(servicio.entregables ?? []).join(", ")} placeholder="Constancia, Carta de evaluación, Diploma" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Garantía</label>
              <Input name="garantia" defaultValue={servicio.garantia ?? ""} placeholder="30 días de satisfacción garantizada" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tiempo promedio de cierre (días)</label>
              <Input name="tiempo_promedio_cierre_dias" type="number" min={0} defaultValue={servicio.tiempo_promedio_cierre_dias ?? ""} placeholder="14" />
            </div>
          </div>

          {/* Público objetivo */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Público objetivo</p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sectores industriales (separados por coma)</label>
              <Input name="sector_industria" defaultValue={(servicio.sector_industria ?? []).join(", ")} placeholder="Manufactura, Salud, Educación" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ocupación objetivo</label>
              <Input name="ocupacion_objetivo" defaultValue={servicio.ocupacion_objetivo ?? ""} placeholder="Evaluadores de competencias laborales" />
            </div>
          </div>

          <Button type="submit" size="sm" disabled={pending}>Guardar ficha</Button>
        </form>
      </CardContent>
    </Card>
  );
}
