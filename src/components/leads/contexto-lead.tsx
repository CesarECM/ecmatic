"use client";

// S23.2 — Card de Contexto en perfil del lead: visualización + entrada manual humana
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { agregarEntradaManualAction } from "@/app/(dashboard)/admin/leads/[id]/actions";
import type { EntradaContexto } from "@/lib/supabase/types";

interface ContextoLeadProps {
  leadId: string;
  contexto: string | null;
  historial: EntradaContexto[];
  contextoFecha: string | null;
}

export function ContextoLead({ leadId, contexto, historial, contextoFecha }: ContextoLeadProps) {
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Contexto</CardTitle>
          <div className="flex gap-1">
            {historial.length > 0 && (
              <Button
                size="sm" variant="ghost" className="text-xs h-7"
                onClick={() => setMostrarHistorial(!mostrarHistorial)}
              >
                {mostrarHistorial ? "Ocultar" : `Historial (${historial.length})`}
              </Button>
            )}
            <Button
              size="sm" variant="ghost" className="text-xs h-7"
              onClick={() => setMostrarForm(!mostrarForm)}
            >
              + Nota
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {contexto ? (
          <p className="text-sm leading-relaxed">{contexto}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Sin contexto aún. Se generará automáticamente con la primera interacción.
          </p>
        )}
        {contextoFecha && (
          <p className="text-xs text-muted-foreground">
            Actualizado: {new Date(contextoFecha).toLocaleString("es-MX")}
          </p>
        )}

        {/* S23.1 — Historial versionado colapsable */}
        {mostrarHistorial && historial.length > 0 && (
          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Versiones anteriores</p>
            {[...historial].reverse().map((e) => (
              <div key={e.id} className="border-l-2 border-muted pl-3 space-y-0.5">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{new Date(e.timestamp).toLocaleString("es-MX")}</span>
                  <span className={e.origen === "humano" ? "text-blue-600 font-medium" : "text-orange-600"}>
                    {e.origen === "humano" ? `Manual — ${e.autor ?? "admin"}` : (e.accion ?? "ia")}
                  </span>
                </div>
                <p className="text-xs text-foreground">{e.contenido}</p>
              </div>
            ))}
          </div>
        )}

        {/* S23.2 — Formulario de entrada manual humana */}
        {mostrarForm && (
          <form action={agregarEntradaManualAction} className="border-t pt-3 space-y-2">
            <input type="hidden" name="leadId" value={leadId} />
            <textarea
              name="nota"
              required
              rows={3}
              placeholder="Agrega una nota o contexto adicional que la IA debe incorporar..."
              className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">Guardar nota</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
