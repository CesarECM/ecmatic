"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ModoPosponer } from "@/app/(dashboard)/admin/leads/[id]/actions-seguimiento";

type Chip = { label: string; modo: "horas" | "dias"; valor: string };

const CHIPS: Chip[] = [
  { label: "2h",  modo: "horas", valor: "2"  },
  { label: "4h",  modo: "horas", valor: "4"  },
  { label: "8h",  modo: "horas", valor: "8"  },
  { label: "12h", modo: "horas", valor: "12" },
  { label: "1d",  modo: "dias",  valor: "1"  },
  { label: "3d",  modo: "dias",  valor: "3"  },
  { label: "7d",  modo: "dias",  valor: "7"  },
  { label: "14d", modo: "dias",  valor: "14" },
];

interface Props {
  onPosponer: (modo: ModoPosponer, valor?: string) => Promise<{ error?: string } | undefined>;
  mostrarListaNegra?: boolean;
}

export function PosponerSeguimientoWidget({ onPosponer, mostrarListaNegra = true }: Props) {
  const [pending, startTransition] = useTransition();
  const [fechaCustom, setFechaCustom]   = useState("");
  const [confirmar, setConfirmar]       = useState<"inactivos" | "negra" | null>(null);

  function ejecutar(modo: ModoPosponer, valor?: string) {
    const id = toast.loading("Posponiendo...");
    startTransition(async () => {
      const res = await onPosponer(modo, valor);
      if (res?.error) toast.error(res.error, { id });
      else {
        const labels: Record<ModoPosponer, string> = {
          horas: `Pospuesto ${valor}h`,
          dias: `Pospuesto ${valor} día${Number(valor) > 1 ? "s" : ""}`,
          fecha: "Reprogramado",
          inactivos: "Lead movido a inactivos",
          negra: "Lead añadido a lista negra",
        };
        toast.success(labels[modo], { id });
      }
    });
    setConfirmar(null);
    setFechaCustom("");
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Chips rápidos */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Posponer</p>
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              disabled={pending}
              onClick={() => ejecutar(c.modo, c.valor)}
              className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fecha personalizada */}
      <div className="flex gap-2 items-center">
        <input
          type="datetime-local"
          value={fechaCustom}
          onChange={(e) => setFechaCustom(e.target.value)}
          className="flex-1 rounded border px-2 py-1 text-xs bg-background"
        />
        <button
          disabled={pending || !fechaCustom}
          onClick={() => ejecutar("fecha", new Date(fechaCustom).toISOString())}
          className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40 whitespace-nowrap"
        >
          Aplicar fecha
        </button>
      </div>

      {/* Acciones graves — solo si mostrarListaNegra=true */}
      {mostrarListaNegra && (
        <div className="pt-1 border-t space-y-1.5">
          {confirmar === null ? (
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => setConfirmar("inactivos")}
                className="rounded px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
              >
                Lista inactivos
              </button>
              <button
                disabled={pending}
                onClick={() => setConfirmar("negra")}
                className="rounded px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
              >
                Lista negra
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {confirmar === "negra"
                  ? "¿Seguro? Bloqueará al lead permanentemente."
                  : "¿Archivar este lead como inactivo?"}
              </span>
              <button
                disabled={pending}
                onClick={() => ejecutar(confirmar)}
                className={`rounded px-2.5 py-1 font-medium ${
                  confirmar === "negra"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                } disabled:opacity-50`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmar(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
