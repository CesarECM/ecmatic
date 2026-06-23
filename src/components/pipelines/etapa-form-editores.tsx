"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TareaObligatoria, PlantillaMensaje, CondicionWorkflow } from "@/services/etapas-admin";

export function TareasEditor({ tareas, onChange }: { tareas: TareaObligatoria[]; onChange: (t: TareaObligatoria[]) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">Tareas obligatorias antes de avanzar</label>
      <div className="space-y-1">
        {tareas.map((t, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={t.descripcion}
              onChange={(e) => onChange(tareas.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
              className="text-xs flex-1"
              placeholder="Descripción de la tarea"
            />
            <select
              value={t.completada_por}
              onChange={(e) => onChange(tareas.map((x, j) => j === i ? { ...x, completada_por: e.target.value as TareaObligatoria["completada_por"] } : x))}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="vendedor">Vendedor</option>
              <option value="ia">IA</option>
              <option value="lead">Lead</option>
            </select>
            <button type="button" onClick={() => onChange(tareas.filter((_, j) => j !== i))} className="text-destructive text-xs">✕</button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...tareas, { descripcion: "", completada_por: "vendedor" }])}
        className="text-xs text-primary hover:underline"
      >
        + Agregar tarea
      </button>
    </div>
  );
}

export function CondicionesEditor({ condiciones, onChange }: { condiciones: CondicionWorkflow[]; onChange: (c: CondicionWorkflow[]) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">Workflow condicional (Si → Entonces)</label>
      <div className="space-y-2">
        {condiciones.map((c, i) => (
          <div key={i} className="space-y-1 rounded-md border p-2 bg-background">
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-10">Si:</span>
              <Input
                value={c.si}
                onChange={(e) => onChange(condiciones.map((x, j) => j === i ? { ...x, si: e.target.value } : x))}
                className="text-xs flex-1"
                placeholder="Condición del lead o conversación"
              />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-10">Entonces:</span>
              <Input
                value={c.entonces}
                onChange={(e) => onChange(condiciones.map((x, j) => j === i ? { ...x, entonces: e.target.value } : x))}
                className="text-xs flex-1"
                placeholder="Acción a ejecutar"
              />
              <button type="button" onClick={() => onChange(condiciones.filter((_, j) => j !== i))} className="text-destructive text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...condiciones, { si: "", entonces: "" }])}
        className="text-xs text-primary hover:underline"
      >
        + Agregar condición
      </button>
    </div>
  );
}

export function PlantillasEditor({ plantillas, onChange }: { plantillas: PlantillaMensaje[]; onChange: (p: PlantillaMensaje[]) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">Plantillas de mensaje por canal</label>
      <div className="space-y-2">
        {plantillas.map((p, i) => (
          <div key={i} className="rounded-md border p-2 bg-background space-y-1.5">
            <div className="flex gap-2 items-center justify-between">
              <select
                value={p.canal}
                onChange={(e) => onChange(plantillas.map((x, j) => j === i ? { ...x, canal: e.target.value as PlantillaMensaje["canal"] } : x))}
                className="rounded-md border bg-background px-2 py-1 text-xs"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="llamada">Llamada</option>
                <option value="meet">Meet</option>
              </select>
              <button type="button" onClick={() => onChange(plantillas.filter((_, j) => j !== i))} className="text-destructive text-xs">✕</button>
            </div>
            {p.canal === "email" && (
              <Input
                value={p.asunto ?? ""}
                onChange={(e) => onChange(plantillas.map((x, j) => j === i ? { ...x, asunto: e.target.value } : x))}
                className="text-xs"
                placeholder="Asunto del email"
              />
            )}
            <Textarea
              value={p.cuerpo}
              onChange={(e) => onChange(plantillas.map((x, j) => j === i ? { ...x, cuerpo: e.target.value } : x))}
              rows={3}
              className="text-xs"
              placeholder="Cuerpo del mensaje. Usa {nombre}, {servicio}, etc."
            />
            <Input
              value={(p.variables ?? []).join(", ")}
              onChange={(e) => onChange(plantillas.map((x, j) => j === i ? { ...x, variables: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } : x))}
              className="text-xs"
              placeholder="Variables: nombre, servicio, fecha (separadas por coma)"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...plantillas, { canal: "whatsapp", cuerpo: "", variables: [] }])}
        className="text-xs text-primary hover:underline"
      >
        + Agregar plantilla
      </button>
    </div>
  );
}
