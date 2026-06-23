"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { WaTemplate, CategoriaWaTemplate } from "@/services/wa-templates";

const ESTADO_COLORS: Record<string, string> = {
  DRAFT: "secondary",
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  PAUSED: "outline",
};

interface Props {
  template?: WaTemplate;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function TemplateForm({ template, onGuardado, onCancelar }: Props) {
  const [nombre, setNombre] = useState(template?.nombre ?? "");
  const [categoria, setCategoria] = useState<CategoriaWaTemplate>(template?.categoria ?? "MARKETING");
  const [idioma, setIdioma] = useState(template?.idioma ?? "es_MX");
  const [header, setHeader] = useState(
    template?.componentes.find((c) => c.type === "HEADER")?.text ?? ""
  );
  const [body, setBody] = useState(
    template?.componentes.find((c) => c.type === "BODY")?.text ?? ""
  );
  const [footer, setFooter] = useState(
    template?.componentes.find((c) => c.type === "FOOTER")?.text ?? ""
  );
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function buildComponentes() {
    const comps = [];
    if (header.trim()) comps.push({ type: "HEADER", format: "TEXT", text: header.trim() });
    if (body.trim()) comps.push({ type: "BODY", text: body.trim() });
    if (footer.trim()) comps.push({ type: "FOOTER", text: footer.trim() });
    return comps;
  }

  async function guardar() {
    if (!nombre.trim() || !body.trim()) {
      toast.error("Nombre y cuerpo son obligatorios");
      return;
    }
    setGuardando(true);
    const tid = toast.loading(template ? "Guardando…" : "Creando template…");
    const payload = { nombre, categoria, idioma, componentes: buildComponentes() };
    const res = await fetch(
      template ? `/api/admin/plantillas-wa/${template.id}` : "/api/admin/plantillas-wa",
      {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) {
      toast.success(template ? "Template guardado" : "Template creado", { id: tid });
      onGuardado();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Error", { id: tid });
    }
    setGuardando(false);
  }

  async function enviarMeta() {
    if (!template) return;
    setEnviando(true);
    const tid = toast.loading("Enviando a Meta…");
    const res = await fetch(`/api/admin/plantillas-wa/${template.id}/enviar-meta`, { method: "POST" });
    if (res.ok) {
      toast.success("Template enviado. Estado: PENDING", { id: tid });
      onGuardado();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Error al enviar a Meta", { id: tid });
    }
    setEnviando(false);
  }

  async function eliminar() {
    if (!template || !confirm(`¿Eliminar el template "${template.nombre}"?`)) return;
    const tid = toast.loading("Eliminando…");
    const res = await fetch(`/api/admin/plantillas-wa/${template.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Template eliminado", { id: tid }); onGuardado(); }
    else toast.error("Error al eliminar", { id: tid });
  }

  return (
    <div className="space-y-4 border rounded-lg bg-card p-5">
      <div className="flex items-center gap-2">
        <p className="font-medium text-sm flex-1">{template ? "Editar template" : "Nuevo template"}</p>
        {template && (
          <Badge variant={ESTADO_COLORS[template.estado_meta] as "default" | "secondary" | "outline" | "destructive"}>
            {template.estado_meta}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre del template</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="ej. bienvenida_leads"
            className="text-sm border rounded-md px-3 py-2 bg-background w-full" />
          <p className="text-[10px] text-muted-foreground">Se normaliza a snake_case para Meta.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaWaTemplate)}
              className="text-sm border rounded-md px-3 py-2 bg-background w-full">
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Auth</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Idioma</label>
            <input value={idioma} onChange={(e) => setIdioma(e.target.value)}
              className="text-sm border rounded-md px-3 py-2 bg-background w-full" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Header (opcional)</label>
          <input value={header} onChange={(e) => setHeader(e.target.value)}
            placeholder="Texto del encabezado"
            className="text-sm border rounded-md px-3 py-2 bg-background w-full" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Body *</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Hola {{1}}, te contactamos desde Centro ECM…"
            rows={4}
            className="text-sm border rounded-md px-3 py-2 bg-background w-full resize-y" />
          <p className="text-[10px] text-muted-foreground">Variables: {"{{1}}"}, {"{{2}}"}, etc.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Footer (opcional)</label>
          <input value={footer} onChange={(e) => setFooter(e.target.value)}
            placeholder="Centro ECM · ceecm.mx"
            className="text-sm border rounded-md px-3 py-2 bg-background w-full" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={guardar} disabled={guardando}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {template && template.estado_meta === "DRAFT" || template?.estado_meta === "REJECTED" ? (
          <button onClick={enviarMeta} disabled={enviando}
            className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700">
            {enviando ? "Enviando…" : "Enviar a Meta"}
          </button>
        ) : null}
        {template && (
          <button onClick={eliminar}
            className="px-4 py-2 rounded-md border text-sm font-medium text-red-600 hover:bg-red-50">
            Eliminar
          </button>
        )}
        <button onClick={onCancelar}
          className="px-4 py-2 rounded-md border text-sm font-medium text-muted-foreground hover:bg-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}
