"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@supabase/ssr";

interface Sugerencia {
  id: string;
  titulo: string;
  descripcion: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Props { servicioId: string; sugerencias: Sugerencia[] }

const URGENCIA_COLOR: Record<string, string> = {
  alta:  "bg-red-100 text-red-700",
  media: "bg-yellow-100 text-yellow-700",
  baja:  "bg-blue-100 text-blue-700",
};

const ACCION_LABEL: Record<string, string> = {
  separar:         "✂️ Separar",
  unir:            "🔗 Unir",
  crear:           "➕ Crear",
  editar:          "✏️ Editar",
  eliminar:        "🗑️ Eliminar",
  completar_campo: "📝 Completar",
};

export function AuditoriaCard({ servicioId, sugerencias }: Props) {
  const [pending, startTransition] = useTransition();

  function handleAprobacion(id: string, aprobado: boolean) {
    const tid = toast.loading(aprobado ? "Aprobando…" : "Rechazando…");
    startTransition(async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("sugerencias_ia").update({ aprobado }).eq("id", id);
        toast.success(aprobado ? "Aprobada" : "Rechazada", { id: tid });
        window.location.reload();
      } catch { toast.error("Error", { id: tid }); }
    });
  }

  function handleDisparar() {
    const tid = toast.loading("Solicitando auditoría…");
    startTransition(async () => {
      try {
        await fetch(`/api/admin/auditor-servicios?servicioId=${servicioId}&secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`, {
          method: "POST",
        });
        toast.success("Auditoría en proceso — recarga en unos segundos", { id: tid });
      } catch { toast.error("Error", { id: tid }); }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Auditoría IA
            {sugerencias.length > 0 && (
              <Badge className="ml-2 text-xs" variant="destructive">{sugerencias.length}</Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleDisparar} disabled={pending}>
            Re-auditar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sugerencias.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin sugerencias pendientes para este servicio.</p>
        ) : (
          sugerencias.map((s) => {
            const urgencia = s.metadata?.urgencia as string | undefined;
            const accion   = s.metadata?.accion   as string | undefined;
            return (
              <div key={s.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {accion && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {ACCION_LABEL[accion] ?? accion}
                    </span>
                  )}
                  {urgencia && (
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${URGENCIA_COLOR[urgencia] ?? "bg-muted"}`}>
                      {urgencia}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium">{s.titulo}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.descripcion}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleAprobacion(s.id, true)}  disabled={pending} className="text-xs text-green-600 hover:underline">Marcar revisada</button>
                  <button onClick={() => handleAprobacion(s.id, false)} disabled={pending} className="text-xs text-red-600 hover:underline">Descartar</button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
