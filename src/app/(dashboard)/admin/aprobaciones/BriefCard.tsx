"use client";

// S33.5 — Tarjeta visual de Brief de Diseño en cola de aprobaciones.
// Muestra dimensiones, concepto, textos y enlace directo a subir imagen.

import type { BriefDiseno } from "@/lib/ai/brief-diseno";
import Link from "next/link";

interface Props {
  brief: BriefDiseno;
  servicioId: string | null;
}

const CANAL_COLOR: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-700 border-green-200",
  email:    "bg-blue-100 text-blue-700 border-blue-200",
  landing:  "bg-orange-100 text-orange-700 border-orange-200",
};

export function BriefCard({ brief, servicioId }: Props) {
  return (
    <div className="mt-2 rounded border border-dashed border-purple-300 bg-purple-50 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-purple-700">Brief de diseño</span>
        <span className={`rounded border px-1.5 py-0.5 font-mono ${CANAL_COLOR[brief.canal_uso] ?? "bg-gray-100"}`}>
          {brief.canal_uso}
        </span>
        <span className="text-muted-foreground">{brief.dimensiones} · {brief.formato}</span>
      </div>

      <p className="text-gray-700 leading-relaxed">{brief.concepto_creativo}</p>

      {brief.uso_especifico && (
        <p className="text-muted-foreground italic">{brief.uso_especifico}</p>
      )}

      {brief.textos_requeridos?.length > 0 && (
        <div>
          <span className="font-medium text-purple-700">Textos requeridos:</span>
          <ul className="mt-0.5 space-y-0.5 list-disc list-inside">
            {brief.textos_requeridos.map((t, i) => (
              <li key={i} className="text-gray-600">{t}</li>
            ))}
          </ul>
        </div>
      )}

      {servicioId && (
        <Link
          href={`/admin/servicios/${servicioId}`}
          className="inline-block mt-1 rounded bg-purple-600 px-2.5 py-1 text-white hover:bg-purple-700"
        >
          Subir imagen resultante →
        </Link>
      )}
    </div>
  );
}
