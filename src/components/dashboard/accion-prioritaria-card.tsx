// S21.4 — Tarjeta de acción prioritaria y chips de pendientes para el panel principal.

import Link from "next/link";
import type { AccionPrioritaria, ResumenPendientes } from "@/services/accion-prioritaria";

function urgenciaEstilos(u: number) {
  if (u >= 90) return { border: "border-red-500",    bg: "bg-red-50",    text: "text-red-700",    badge: "bg-red-600 text-white" };
  if (u >= 70) return { border: "border-orange-500", bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-500 text-white" };
  if (u >= 50) return { border: "border-amber-500",  bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-400 text-amber-900" };
  return       { border: "border-blue-400",   bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-500 text-white" };
}

interface Props {
  accion: AccionPrioritaria | null;
  resumen: ResumenPendientes | null;
}

export function AccionPrioritariaCard({ accion, resumen }: Props) {
  const e = accion ? urgenciaEstilos(accion.urgencia) : null;

  return (
    <div className="space-y-3">
      {/* Tarjeta acción prioritaria */}
      {accion && e && (
        <div className={`rounded-lg border-l-4 p-4 ${e.border} ${e.bg}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-medium rounded px-2 py-0.5 ${e.badge}`}>
                  Urgencia {accion.urgencia}
                </span>
                <span className={`text-xs font-medium ${e.text}`}>
                  {accion.tipo.replace("_", " ")}
                </span>
                {accion.leadNombre && (
                  <span className="text-xs text-muted-foreground">· {accion.leadNombre}</span>
                )}
              </div>
              <p className={`font-semibold ${e.text}`}>{accion.titulo}</p>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {accion.descripcion}
              </p>
            </div>
            <Link
              href={accion.url}
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 ${e.badge}`}
            >
              Resolver →
            </Link>
          </div>
        </div>
      )}

      {/* Chips de resumen */}
      {resumen && resumen.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {resumen.comprobantes > 0 && (
            <Link href="/admin/aprobaciones"
              className="text-xs rounded-full border px-3 py-1 bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition-colors">
              {resumen.comprobantes} comprobante{resumen.comprobantes > 1 ? "s" : ""}
            </Link>
          )}
          {resumen.tareasCierre > 0 && (
            <Link href="/admin/leads"
              className="text-xs rounded-full border px-3 py-1 bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 transition-colors">
              {resumen.tareasCierre} cierre{resumen.tareasCierre > 1 ? "s" : ""} pendiente{resumen.tareasCierre > 1 ? "s" : ""}
            </Link>
          )}
          {resumen.mensajesCola > 0 && (
            <Link href="/admin/aprobaciones"
              className="text-xs rounded-full border px-3 py-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors">
              {resumen.mensajesCola} mensaje{resumen.mensajesCola > 1 ? "s" : ""} en cola
            </Link>
          )}
          {resumen.sugerenciasUrgentes > 0 && (
            <Link href="/admin/aprobaciones"
              className="text-xs rounded-full border px-3 py-1 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 transition-colors">
              {resumen.sugerenciasUrgentes} sugerencia{resumen.sugerenciasUrgentes > 1 ? "s" : ""} urgente{resumen.sugerenciasUrgentes > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
