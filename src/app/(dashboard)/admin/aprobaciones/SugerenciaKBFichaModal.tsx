"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { EditorInline } from "./EditorInline";
import {
  clasificarAccionKB, TIPO_LABEL, TIPO_COLOR,
  type MetaKB, type RecursoKBResumen,
} from "./SugerenciaKBCard";
import type { SugerenciaItem } from "./ColaSugerenciasSeccion";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoAplicacion } from "@/services/aplicar-sugerencia-kb";

interface Props {
  item: SugerenciaItem | null;
  recursosKB: Record<string, RecursoKBResumen>;
  onClose: () => void;
  onAplicar: (id: string, override?: { titulo: string; contenido: string; razon_edicion?: string }) => Promise<ActionResult<ResultadoAplicacion>>;
  onEliminar: (id: string, feedback: string) => Promise<ActionResult>;
  onPrevisualizar: (id: string) => Promise<ActionResult<{ titulo: string; contenido: string }>>;
}

const PRIORIDAD_STYLE: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-200 text-gray-700",
};

function mensajeExito(r: ResultadoAplicacion): string {
  if (r.accion === "recurso_creado")      return `FAQ creado: "${r.titulo}"`;
  if (r.accion === "recurso_actualizado") return `KB actualizado: "${r.titulo}"`;
  if (r.accion === "recurso_desactivado") return "Duplicado desactivado del KB";
  return "Sugerencia procesada";
}

export function SugerenciaKBFichaModal({
  item, recursosKB, onClose, onAplicar, onEliminar, onPrevisualizar,
}: Props) {
  const [vistaPrevia, setVistaPrevia]   = useState<{ titulo: string; contenido: string } | null>(null);
  const [generando, setGenerando]       = useState(false);
  const [modoEdicion, setModoEdicion]   = useState(false);
  const [modoDescartar, setModoDescartar] = useState(false);
  const [feedback, setFeedback]         = useState("");
  const [pending, startTransition]      = useTransition();

  const meta = (item?.metadata ?? {}) as MetaKB;
  const tipo = item ? clasificarAccionKB(meta) : "actualizar_faq";

  const recursoPrincipal = (() => {
    const id = meta.recurso_ids?.[0] ?? meta.recurso_id ?? meta.id_a;
    return id ? recursosKB[id] : undefined;
  })();
  const recursoB = meta.id_b ? recursosKB[meta.id_b] : undefined;

  function resetY(cb: () => void) {
    setVistaPrevia(null); setGenerando(false);
    setModoEdicion(false); setModoDescartar(false); setFeedback("");
    cb();
  }

  async function handlePrevisualizar() {
    if (!item) return;
    setGenerando(true);
    const r = await onPrevisualizar(item.id);
    setGenerando(false);
    if (r.error) toast.error(r.error);
    else setVistaPrevia(r.data!);
  }

  function handleAplicar(override?: { titulo: string; contenido: string; razon_edicion?: string }) {
    if (!item) return;
    const t = toast.loading("Aplicando al KB…");
    startTransition(async () => {
      const r = await onAplicar(item.id, override);
      if (r.error) toast.error(r.error, { id: t });
      else { toast.success(mensajeExito(r.data!), { id: t }); resetY(onClose); }
    });
  }

  function handleDescartar() {
    if (!item || !feedback.trim()) return;
    const t = toast.loading("Descartando…");
    startTransition(async () => {
      const r = await onEliminar(item.id, feedback.trim());
      if (r.error) toast.error(r.error, { id: t });
      else { toast.success("Sugerencia descartada", { id: t }); resetY(onClose); }
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) resetY(onClose); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" showCloseButton>
        {item && (<>
          {/* Cabecera */}
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs rounded border px-2 py-0.5 font-medium ${TIPO_COLOR[tipo]}`}>
                {TIPO_LABEL[tipo]}
              </span>
              <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_STYLE[item.prioridad] ?? PRIORIDAD_STYLE.puede_esperar}`}>
                {item.prioridad.replace("_", " ")}
              </span>
            </div>
            <DialogTitle>{item.titulo}</DialogTitle>
            {item.descripcion && (
              <p className="text-xs text-muted-foreground">{item.descripcion}</p>
            )}
          </DialogHeader>

          {/* Cuerpo: vistas según tipo de acción */}
          {!modoEdicion && !modoDescartar && (
            <div className="space-y-3">

              {/* ACTUALIZAR FAQ — antes / después */}
              {tipo === "actualizar_faq" && recursoPrincipal && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border bg-gray-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Versión actual</p>
                    <p className="text-sm font-medium">{recursoPrincipal.titulo}</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{recursoPrincipal.contenido}</p>
                  </div>
                  <div className="rounded border bg-green-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Versión propuesta</p>
                    {vistaPrevia ? (
                      <>
                        <p className="text-sm font-medium">{vistaPrevia.titulo}</p>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{vistaPrevia.contenido}</p>
                      </>
                    ) : (
                      <div className="space-y-2 pt-1">
                        {meta.que_cambiar && (
                          <p className="text-xs text-gray-600 italic border-l-2 border-green-300 pl-2">
                            "{meta.que_cambiar}"
                          </p>
                        )}
                        <button onClick={handlePrevisualizar} disabled={generando}
                          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                          {generando ? "Generando…" : "Generar vista previa"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* NUEVA FAQ */}
              {tipo === "nueva_faq" && (
                <div className="rounded border bg-green-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Nueva entrada en el KB</p>
                  {vistaPrevia ? (
                    <>
                      <p className="text-sm font-medium">{vistaPrevia.titulo}</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{vistaPrevia.contenido}</p>
                    </>
                  ) : (
                    <button onClick={handlePrevisualizar} disabled={generando}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                      {generando ? "Generando…" : "Previsualizar FAQ"}
                    </button>
                  )}
                </div>
              )}

              {/* UNIR FAQs */}
              {tipo === "unir_faqs" && recursoPrincipal && recursoB && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border bg-gray-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Se conserva</p>
                    <p className="text-sm font-medium">{recursoPrincipal.titulo}</p>
                    <p className="text-xs text-gray-700">{recursoPrincipal.contenido}</p>
                  </div>
                  <div className="rounded border bg-red-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Se desactivará</p>
                    <p className="text-sm font-medium">{recursoB.titulo}</p>
                    <p className="text-xs text-gray-700">{recursoB.contenido}</p>
                  </div>
                </div>
              )}

              {/* Contexto de la edición del admin */}
              {(meta.razon_edicion || meta.mensaje_ia) && (
                <div className="rounded border bg-amber-50 p-3 space-y-1.5 text-xs">
                  {meta.razon_edicion && (
                    <p><span className="font-medium text-amber-700">Razón del admin:</span>{" "}
                      <span className="text-amber-900">"{meta.razon_edicion}"</span></p>
                  )}
                  {meta.mensaje_ia && (
                    <p><span className="font-medium text-amber-700">Respuesta IA original:</span>{" "}
                      <span className="text-amber-900">{meta.mensaje_ia}</span></p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Modo edición */}
          {modoEdicion && recursoPrincipal && (
            <EditorInline
              titulo={vistaPrevia?.titulo ?? recursoPrincipal.titulo}
              contenido={vistaPrevia?.contenido ?? recursoPrincipal.contenido}
              onConfirmar={(t, c, r) => handleAplicar({ titulo: t, contenido: c, razon_edicion: r })}
              onCancelar={() => setModoEdicion(false)}
              pending={pending}
            />
          )}

          {/* Modo descartar */}
          {modoDescartar && (
            <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-medium text-red-700">¿Por qué descartás esta sugerencia?</p>
              <textarea autoFocus
                className="w-full rounded border border-red-300 px-2 py-1 text-xs min-h-[56px] resize-none bg-white"
                placeholder="Razón del descarte (obligatorio)"
                value={feedback} onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={handleDescartar} disabled={pending || !feedback.trim()}
                  className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                  Confirmar descarte
                </button>
                <button onClick={() => setModoDescartar(false)}
                  className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Footer de acciones */}
          {!modoEdicion && !modoDescartar && (
            <DialogFooter>
              <button onClick={() => setModoDescartar(true)} disabled={pending}
                className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50 mr-auto">
                Descartar
              </button>

              {tipo === "actualizar_faq" && (<>
                {recursoPrincipal && (
                  <button onClick={() => setModoEdicion(true)} disabled={pending}
                    className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">
                    Editar antes de aplicar
                  </button>
                )}
                <button onClick={() => handleAplicar()} disabled={pending}
                  className="rounded bg-green-600 px-4 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                  {pending ? "Aplicando…" : "Aplicar con IA"}
                </button>
              </>)}

              {tipo === "nueva_faq" && (
                <button onClick={() => handleAplicar(vistaPrevia ?? undefined)} disabled={pending}
                  className="rounded bg-green-600 px-4 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                  {pending ? "Creando…" : vistaPrevia ? "Crear FAQ" : "Generar y crear FAQ"}
                </button>
              )}

              {tipo === "unir_faqs" && (
                <button onClick={() => handleAplicar()} disabled={pending}
                  className="rounded bg-amber-500 px-4 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-50">
                  {pending ? "Aplicando…" : "Desactivar duplicado"}
                </button>
              )}
            </DialogFooter>
          )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}
