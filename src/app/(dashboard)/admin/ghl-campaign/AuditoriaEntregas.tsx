"use client";

import { useState, useTransition } from "react";
import type { AuditoriaItem, AccionAuditoria } from "@/services/ghl-auditoria-entregas";
import { auditarEntregasAction, repararEntregasAction } from "./actions";

const PAGE_SIZE = 25;

function chipAccion(accion: AccionAuditoria, status: string | null) {
  const cfg: Record<AccionAuditoria, { label: string; cls: string }> = {
    entregado:   { label: status ?? "entregado",   cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
    fallido:     { label: status ?? "fallido",      cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
    sin_mensaje: { label: "sin mensaje",            cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
    revisar:     { label: status ?? "revisar",      cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  };
  const { label, cls } = cfg[accion];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function horaCDMX(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function AuditoriaEntregas({
  totalCandidatos,
  since,
}: {
  totalCandidatos: number;
  since: string;
}) {
  const [abierto, setAbierto]         = useState(false);
  const [estado, setEstado]           = useState<"idle" | "cargando" | "listo" | "reparando">("idle");
  const [items, setItems]             = useState<AuditoriaItem[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [feedback, setFeedback]       = useState<string | null>(null);
  const [, startTransition]           = useTransition();

  async function cargar(p: number) {
    setEstado("cargando");
    setFeedback(null);
    try {
      const res = await auditarEntregasAction(since, p, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
      setEstado("listo");
    } catch {
      setFeedback("Error al consultar GHL. Intenta de nuevo.");
      setEstado("idle");
    }
  }

  function handleAbrir() {
    setAbierto((v) => {
      if (!v && estado === "idle") cargar(1);
      return !v;
    });
  }

  const paraLimpiar  = items.filter((i) => i.accion === "fallido" || i.accion === "sin_mensaje");
  const paraRevisar  = items.filter((i) => i.accion === "revisar");
  const entregados   = items.filter((i) => i.accion === "entregado");
  const totalPaginas = Math.ceil(total / PAGE_SIZE);
  const isCargando   = estado === "cargando";
  const isReparando  = estado === "reparando";
  const isListo      = estado === "listo";

  function handleReparar() {
    if (!paraLimpiar.length) return;
    startTransition(async () => {
      setEstado("reparando");
      try {
        const ids = paraLimpiar.map((i) => i.ghl_contact_id);
        const res = await repararEntregasAction(ids, false);
        setFeedback(`${res.reparados} registros limpiados — quedarán disponibles para el próximo run de campaña.`);
        // Recargar misma página
        await cargar(page);
      } catch {
        setFeedback("Error al reparar. Intenta de nuevo.");
        setEstado("listo");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Cabecera colapsable */}
      <button
        onClick={handleAbrir}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Auditoría de entregas
          </span>
          {totalCandidatos > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-400 text-xs font-semibold">
              {totalCandidatos.toLocaleString("es-MX")} sin confirmar
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{abierto ? "▲ Cerrar" : "▼ Ver"}</span>
      </button>

      {abierto && (
        <div className="border-t px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground pt-3">
            Contactos marcados como enviados pero sin respuesta. Consulta GHL para verificar si el mensaje realmente se entregó.
          </p>

          {/* Feedback */}
          {feedback && (
            <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              {feedback}
            </div>
          )}

          {/* Estado de carga */}
          {isCargando && (
            <p className="text-xs text-muted-foreground py-4 text-center animate-pulse">
              Consultando GHL… esto puede tardar unos segundos
            </p>
          )}

          {/* Resumen de página */}
          {isListo && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Página {page} de {totalPaginas} · {total} candidatos totales</span>
              <span className="text-green-600 dark:text-green-400">{entregados.length} entregados</span>
              <span className="text-red-600 dark:text-red-400">{paraLimpiar.length} para limpiar</span>
              <span className="text-yellow-600 dark:text-yellow-400">{paraRevisar.length} para revisar</span>
            </div>
          )}

          {/* Tabla */}
          {isListo && (
            <>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sin candidatos en esta página.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {["Nombre", "Enviado (CDMX)", "Var.", "Status GHL", "Mensaje"].map((h) => (
                          <th key={h} className="text-left p-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((item) => (
                        <tr
                          key={item.ghl_contact_id}
                          className={`hover:bg-muted/30 ${
                            item.accion === "fallido" || item.accion === "sin_mensaje"
                              ? "bg-red-500/5"
                              : item.accion === "entregado"
                              ? "bg-green-500/5"
                              : ""
                          }`}
                        >
                          <td className="p-2 max-w-[140px] truncate font-medium">
                            {item.nombre}
                          </td>
                          <td className="p-2 tabular-nums text-muted-foreground">
                            {horaCDMX(item.enviado_at)}
                          </td>
                          <td className="p-2">
                            {item.variante
                              ? <span className={item.variante === "a" ? "text-green-500 font-bold" : "text-blue-500 font-bold"}>
                                  {item.variante.toUpperCase()}
                                </span>
                              : "—"}
                          </td>
                          <td className="p-2">
                            {chipAccion(item.accion, item.status_ghl)}
                          </td>
                          <td className="p-2 max-w-[200px] truncate text-muted-foreground" title={item.cuerpo_mensaje ?? ""}>
                            {item.cuerpo_mensaje ?? <span className="italic">sin mensaje</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Acciones de página */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  {paraLimpiar.length > 0 && (
                    <button
                      onClick={handleReparar}
                      disabled={isReparando}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {isReparando ? "Limpiando…" : `Limpiar ${paraLimpiar.length} fallidos`}
                    </button>
                  )}
                  {paraLimpiar.length === 0 && items.length > 0 && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Sin fallidos en esta página
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <button
                      onClick={() => cargar(page - 1)}
                      disabled={isCargando}
                      className="h-8 px-3 text-xs rounded-lg border hover:bg-muted/50 disabled:opacity-50"
                    >
                      ← Anterior
                    </button>
                  )}
                  {page < totalPaginas && (
                    <button
                      onClick={() => cargar(page + 1)}
                      disabled={isCargando}
                      className="h-8 px-3 text-xs rounded-lg border hover:bg-muted/50 disabled:opacity-50"
                    >
                      Siguiente →
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
