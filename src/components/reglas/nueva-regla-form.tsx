"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearReglaAction } from "@/app/(dashboard)/admin/reglas/actions";

const TIPOS = [
  { value: "tactica",     label: "Táctica de venta" },
  { value: "urgencia",    label: "Urgencia" },
  { value: "restriccion", label: "Restricción" },
  { value: "producto",    label: "Producto" },
  { value: "rebate",      label: "Rebate de objeción" },
];

const EJEMPLO_CONDICIONES = `{"tags_ghl":["svc-smec","int-caliente"],"temperamento":"D"}`;

export function NuevaReglaForm() {
  const [abierto, setAbierto]   = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await crearReglaAction(formData);
      toast.success("Regla creada — pendiente de aprobación");
      setAbierto(false);
    });
  }

  return (
    <div>
      <Button size="sm" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cancelar" : "+ Nueva regla"}
      </Button>

      {abierto && (
        <Card className="mt-3 border-dashed fixed right-4 top-16 z-50 w-[520px] shadow-xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nueva regla conversacional</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input name="nombre" placeholder="Ej: Lead caliente con objeción" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <select
                    name="tipo"
                    required
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Seleccionar...</option>
                    {TIPOS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Descripción (opcional)</Label>
                <Input name="descripcion" placeholder="Cuándo aplica esta regla..." />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Condiciones (JSON)</Label>
                <Input
                  name="condiciones"
                  placeholder={EJEMPLO_CONDICIONES}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Campos: <code>tags_ghl</code> (array), <code>temperamento</code> (D/I/S/C), <code>pipeline_stage</code>. Dejar vacío = siempre aplica.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Instrucción para Claude</Label>
                <Textarea
                  name="instruccion"
                  rows={4}
                  placeholder={`Ej: "No te defiendas del precio. Valida brevemente, ancla en resultados concretos. Propón una sola acción al final."`}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Prioridad (0–100)</Label>
                <Input name="prioridad" type="number" min={0} max={100} defaultValue={50} />
                <p className="text-xs text-muted-foreground">Mayor = más prioridad. Restricciones: 80–100.</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Creando..." : "Crear regla"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
