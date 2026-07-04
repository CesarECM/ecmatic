"use client";

import { useState } from "react";
import { crearTemplateAction } from "./actions";

const TIPOS = [
  { value: "nurturing",      label: "Nurturing" },
  { value: "conversational", label: "Conversacional" },
  { value: "payment",        label: "Pago" },
  { value: "demo_agendado",  label: "Post-Demo" },
] as const;

export function NuevoTemplateForm() {
  const [texto, setTexto] = useState("");

  return (
    <form action={crearTemplateAction} className="rounded-lg border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Nuevo template manual</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Tipo de seguimiento</label>
          <select name="tipo" required
            className="w-full rounded border bg-background px-2 py-1.5 text-sm">
            {TIPOS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Guardar como</label>
          <select name="estado"
            className="w-full rounded border bg-background px-2 py-1.5 text-sm">
            <option value="aprobado">Aprobado (entra a cola de aprobación)</option>
            <option value="sugerido">Sugerido (puede editarse antes de usar)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Texto del template
          <span className={`ml-2 tabular-nums ${texto.length < 20 ? "text-red-500" : "text-muted-foreground"}`}>
            ({texto.length} car. — mín. 20)
          </span>
        </label>
        <textarea
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          required
          placeholder="Escribe el mensaje de seguimiento..."
          className="w-full rounded border bg-background p-2 text-sm resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={texto.length < 20}
          className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          Crear template
        </button>
        <a href="/admin/templates"
          className="rounded bg-muted px-4 py-1.5 text-sm hover:bg-muted/80 transition-colors">
          Cancelar
        </a>
      </div>
    </form>
  );
}
