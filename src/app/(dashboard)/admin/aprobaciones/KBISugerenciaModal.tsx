"use client";

// Modal de revisión para kbi_sugerencias pendientes.
// Muestra antes/después para 'actualizar', draft para 'crear', confirmación para 'desactivar'.
// Siempre resulta en un cambio real al KB (invariante del aplicador).

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { KBISugerenciaItem } from "./KBISugerenciaCard";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoKBI } from "@/services/kbi/aplicador";

export interface RecursoActual {
  titulo: string;
  contenido: string;
}

interface Props {
  item: KBISugerenciaItem | null;
  recursoActual: RecursoActual | null;
  onClose: () => void;
  onAprobar: (id: string, override?: { titulo?: string; contenido?: string }) => Promise<ActionResult<ResultadoKBI>>;
  onRechazar: (id: string, feedback: string) => Promise<ActionResult>;
}

function mensajeExito(r: ResultadoKBI): string {
  if (r.accion === "creado")     return `Recurso creado: "${r.titulo}"`;
  if (r.accion === "actualizado") return `KB actualizado: "${r.titulo}"`;
  return "Recurso desactivado del KB";
}

export function KBISugerenciaModal({ item, recursoActual, onClose, onAprobar, onRechazar }: Props) {
  const [titulo,   setTitulo]   = useState("");
  const [contenido, setContenido] = useState("");
  const [feedback,  setFeedback]  = useState("");
  const [modoEdicion,  setModoEdicion]  = useState(false);
  const [modoRechazar, setModoRechazar] = useState(false);
  const [pending, startTransition] = useTransition();

  // Reinicia los campos editables cada vez que cambia el item activo
  useEffect(() => {
    if (item) {
      setTitulo(item.titulo_propuesto);
      setContenido(item.contenido_propuesto);
      setFeedback(""); setModoEdicion(false); setModoRechazar(false);
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setModoEdicion(false); setModoRechazar(false); setFeedback("");
    onClose();
  }

  function handleAprobar(withOverride?: boolean) {
    if (!item) return;
    const override = withOverride ? { titulo: titulo.trim(), contenido: contenido.trim() } : undefined;
    const t = toast.loading("Aplicando al KB…");
    startTransition(async () => {
      const r = await onAprobar(item.id, override);
      if (r.error) toast.error(r.error, { id: t });
      else { toast.success(mensajeExito(r.data!), { id: t }); handleClose(); }
    });
  }

  function handleRechazar() {
    if (!item || !feedback.trim()) return;
    const t = toast.loading("Rechazando…");
    startTransition(async () => {
      const r = await onRechazar(item.id, feedback.trim());
      if (r.error) toast.error(r.error, { id: t });
      else { toast.success("Sugerencia rechazada", { id: t }); handleClose(); }
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" showCloseButton>
        {item && (<>
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs rounded border px-1.5 py-0.5 font-medium
                ${item.tipo_accion === "crear"      ? "bg-green-100 text-green-700 border-green-200"   :
                  item.tipo_accion === "actualizar" ? "bg-violet-100 text-violet-700 border-violet-200" :
                                                      "bg-red-100 text-red-700 border-red-200"}`}>
                KBI · {item.tipo_accion === "crear" ? "Crear" : item.tipo_accion === "actualizar" ? "Actualizar" : "Desactivar"}
              </span>
              {item.tipo_recurso_nuevo && (
                <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                  {item.tipo_recurso_nuevo}
                </span>
              )}
            </div>
            <DialogTitle>{item.titulo_propuesto}</DialogTitle>
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2 mt-1">
              <span className="font-medium text-amber-700">Razón detectada:</span>{" "}{item.razon}
            </p>
          </DialogHeader>

          {/* ── Vista principal ───────────────────────────────── */}
          {!modoEdicion && !modoRechazar && (
            <div className="space-y-3">

              {/* ACTUALIZAR — antes / después */}
              {item.tipo_accion === "actualizar" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border bg-gray-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Versión actual</p>
                    <p className="text-sm font-medium">{recursoActual?.titulo ?? "—"}</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {recursoActual?.contenido ?? "(cargando…)"}
                    </p>
                  </div>
                  <div className="rounded border bg-violet-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Versión propuesta</p>
                    <p className="text-sm font-medium">{item.titulo_propuesto}</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{item.contenido_propuesto}</p>
                  </div>
                </div>
              )}

              {/* CREAR — draft */}
              {item.tipo_accion === "crear" && (
                <div className="rounded border bg-green-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Draft generado</p>
                  <p className="text-sm font-medium">{item.titulo_propuesto}</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{item.contenido_propuesto}</p>
                </div>
              )}

              {/* DESACTIVAR — recurso actual */}
              {item.tipo_accion === "desactivar" && (
                <div className="rounded border bg-red-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Recurso a desactivar</p>
                  <p className="text-sm font-medium">{recursoActual?.titulo ?? item.titulo_propuesto}</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {recursoActual?.contenido ?? item.contenido_propuesto}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Modo edición ───────────────────────────────────── */}
          {modoEdicion && (
            <div className="space-y-2 p-3 rounded bg-gray-50 border">
              <input className="w-full rounded border px-2 py-1 text-sm"
                placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <textarea className="w-full rounded border px-2 py-1 text-sm min-h-[100px] resize-y"
                placeholder="Contenido" value={contenido} onChange={(e) => setContenido(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => handleAprobar(true)} disabled={pending || !titulo.trim() || !contenido.trim()}
                  className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                  {pending ? "Guardando…" : "Guardar y aplicar"}
                </button>
                <button onClick={() => setModoEdicion(false)}
                  className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Cancelar</button>
              </div>
            </div>
          )}

          {/* ── Modo rechazar ──────────────────────────────────── */}
          {modoRechazar && (
            <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-medium text-red-700">¿Por qué rechazas esta sugerencia?</p>
              <textarea autoFocus className="w-full rounded border border-red-300 px-2 py-1 text-xs min-h-[56px] resize-none bg-white"
                placeholder="Razón del rechazo (obligatorio)" value={feedback}
                onChange={(e) => setFeedback(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={handleRechazar} disabled={pending || !feedback.trim()}
                  className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                  Confirmar rechazo
                </button>
                <button onClick={() => setModoRechazar(false)}
                  className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Cancelar</button>
              </div>
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────── */}
          {!modoEdicion && !modoRechazar && (
            <DialogFooter>
              <button onClick={() => setModoRechazar(true)} disabled={pending}
                className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50 mr-auto">
                Rechazar
              </button>

              {item.tipo_accion !== "desactivar" && (
                <button onClick={() => setModoEdicion(true)} disabled={pending}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
                  Editar antes de aplicar
                </button>
              )}

              <button onClick={() => handleAprobar(false)} disabled={pending}
                className={`rounded px-4 py-1.5 text-xs text-white disabled:opacity-50
                  ${item.tipo_accion === "desactivar" ? "bg-red-600 hover:bg-red-700" : "bg-sky-600 hover:bg-sky-700"}`}>
                {pending ? "Aplicando…" :
                  item.tipo_accion === "crear"      ? "Crear recurso" :
                  item.tipo_accion === "actualizar" ? "Aplicar cambio" :
                                                      "Desactivar recurso"}
              </button>
            </DialogFooter>
          )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}
