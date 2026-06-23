"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { dispararCronAction } from "./actions";
import type { DefinicionCron } from "@/lib/automatizaciones/registry";
import type { EntradaCronLog } from "@/services/cron-log";

function fmtFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function CronRow({
  cron,
  ultima,
}: {
  cron: DefinicionCron;
  ultima: EntradaCronLog | null;
}) {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  function disparar() {
    const tid = toast.loading(`Ejecutando ${cron.label}…`);
    startTransition(async () => {
      const r = await dispararCronAction(cron.path);
      if (r.ok) {
        toast.success("Ejecutado correctamente", { id: tid });
        setResultado(r.mensaje);
      } else {
        toast.error(r.mensaje, { id: tid });
        setResultado(`Error: ${r.mensaje}`);
      }
    });
  }

  return (
    <div className="border rounded-lg bg-card px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{cron.label}</span>
            <Badge variant="outline" className="text-[10px] font-mono">{cron.schedule}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{cron.descripcion}</p>
        </div>
        <button
          onClick={disparar}
          disabled={pending}
          className="shrink-0 text-xs px-3 py-1.5 rounded-md border font-medium hover:bg-muted disabled:opacity-40 transition-colors"
        >
          {pending ? "Ejecutando…" : "▶ Ejecutar"}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {ultima ? (
          <>
            <span>Última ejecución: {fmtFecha(ultima.ejecutado_at)}</span>
            {ultima.resultado && (
              <span className="font-mono text-[10px] text-green-700 bg-green-50 rounded px-1">
                {JSON.stringify(ultima.resultado).slice(0, 80)}
              </span>
            )}
          </>
        ) : (
          <span className="italic">Sin ejecuciones registradas</span>
        )}
      </div>

      {resultado && (
        <pre className="text-[10px] bg-muted rounded px-2 py-1 overflow-x-auto">{resultado}</pre>
      )}
    </div>
  );
}

interface Props {
  crons: DefinicionCron[];
  ultimas: Record<string, EntradaCronLog>;
}

export function AutomatizacionesClient({ crons, ultimas }: Props) {
  const [filtro, setFiltro] = useState("");
  const cronsFiltrados = filtro
    ? crons.filter(
        (c) =>
          c.label.toLowerCase().includes(filtro.toLowerCase()) ||
          c.descripcion.toLowerCase().includes(filtro.toLowerCase())
      )
    : crons;

  return (
    <div className="space-y-4">
      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar automatización…"
        className="w-full text-sm border rounded-md px-3 py-2 bg-background max-w-sm"
      />
      <p className="text-xs text-muted-foreground">{cronsFiltrados.length} automatizaciones</p>
      <div className="space-y-2">
        {cronsFiltrados.map((c) => (
          <CronRow key={c.name} cron={c} ultima={ultimas[c.name] ?? null} />
        ))}
      </div>
    </div>
  );
}
