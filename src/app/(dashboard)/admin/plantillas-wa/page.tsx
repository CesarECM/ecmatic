"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { TemplateForm } from "./TemplateForm";
import type { WaTemplate } from "@/services/wa-templates";

export const dynamic = "force-dynamic";

const ESTADO_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  PAUSED: "outline",
};

const ESTADO_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  PAUSED: "Pausado",
};

const CATEGORIA_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Auth",
};

export default function PlantillasWAPage() {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<WaTemplate | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await fetch("/api/admin/plantillas-wa");
    if (res.ok) { const d = await res.json(); setTemplates(d.templates ?? []); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function onGuardado() {
    setEditando(null);
    cargar();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Plantillas WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Crea templates aprobados por Meta para usar en prospección secuencial.
          </p>
        </div>
        {!editando && (
          <button
            onClick={() => setEditando("nuevo")}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Nuevo template
          </button>
        )}
      </div>

      {editando === "nuevo" && (
        <TemplateForm onGuardado={onGuardado} onCancelar={() => setEditando(null)} />
      )}

      {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!cargando && !templates.length && !editando && (
        <div className="border rounded-lg bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Sin templates aún.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Crea uno, completa los campos y envíalo a Meta para aprobación.
          </p>
        </div>
      )}

      {templates.map((t) =>
        editando && typeof editando === "object" && editando.id === t.id ? (
          <TemplateForm key={t.id} template={t} onGuardado={onGuardado} onCancelar={() => setEditando(null)} />
        ) : (
          <div key={t.id} className="border rounded-lg bg-card px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{t.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {CATEGORIA_LABELS[t.categoria]} · {t.idioma}
                {t.enviado_a_meta_at && (
                  <span className="ml-2">
                    · Enviado {new Date(t.enviado_a_meta_at).toLocaleDateString("es-MX")}
                  </span>
                )}
                {t.aprobado_at && (
                  <span className="ml-2">
                    · Aprobado {new Date(t.aprobado_at).toLocaleDateString("es-MX")}
                  </span>
                )}
              </p>
            </div>
            <Badge variant={ESTADO_BADGE[t.estado_meta]}>{ESTADO_LABELS[t.estado_meta]}</Badge>
            <button
              onClick={() => setEditando(t)}
              className="text-xs text-primary hover:underline shrink-0"
            >
              Editar
            </button>
          </div>
        )
      )}
    </div>
  );
}
