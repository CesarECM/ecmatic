"use client";

// MPS-14 S52 — Card expandida para sugerencias tipo kb_calidad.
// Muestra el recurso KB afectado y aplica el cambio directamente al KB al aprobar.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoAplicacion } from "@/services/aplicar-sugerencia-kb";
import type { SugerenciaItem } from "./ColaSugerenciasSeccion";

export interface RecursoKBResumen {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
}

interface MetaKB {
  source?: string;
  recurso_id?: string;
  recurso_ids?: string[];
  id_a?: string;
  id_b?: string;
  categoria_suciedad?: string;
  que_cambiar?: string;
  mensaje_ia?: string;
  razon_edicion?: string;
}

interface Props {
  item: SugerenciaItem;
  recursosKB: Record<string, RecursoKBResumen>;
  onAplicar: (override?: { titulo: string; contenido: string; razon_edicion?: string }) => Promise<ActionResult<ResultadoAplicacion>>;
  onEliminar: (feedback: string) => Promise<ActionResult>;
}

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-300 text-gray-700",
};

function diasDesde(f: string) {
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
}

function mensajeExito(r: ResultadoAplicacion): string {
  if (r.accion === "recurso_creado")     return `FAQ creado: "${r.titulo}" — revísalo en la cola KB`;
  if (r.accion === "recurso_actualizado") return `KB actualizado: "${r.titulo}"`;
  if (r.accion === "recurso_desactivado") return "Duplicado desactivado del KB";
  return "Sugerencia procesada";
}

function EtiquetaTipo({ meta }: { meta: MetaKB }) {
  if (meta.source === "ghl_edicion")
    return <span className="text-xs rounded border px-1.5 py-0.5 bg-violet-100 text-violet-700 border-violet-200">Edición GHL</span>;
  if (meta.source === "ghl_edicion_patron")
    return <span className="text-xs rounded border px-1.5 py-0.5 bg-red-100 text-red-700 border-red-200">Patrón GHL ⚡</span>;
  if (meta.categoria_suciedad === "Huérfano de cobertura")
    return <span className="text-xs rounded border px-1.5 py-0.5 bg-green-100 text-green-700 border-green-200">FAQ faltante</span>;
  if (meta.categoria_suciedad === "Obsolescencia parcial")
    return <span className="text-xs rounded border px-1.5 py-0.5 bg-orange-100 text-orange-700 border-orange-200">Desactualizado</span>;
  if (meta.categoria_suciedad === "Duplicado semántico")
    return <span className="text-xs rounded border px-1.5 py-0.5 bg-amber-100 text-amber-700 border-amber-200">Duplicado</span>;
  return <span className="text-xs rounded border px-1.5 py-0.5 bg-blue-100 text-blue-700 border-blue-200">KB</span>;
}

function EditorInline({ titulo: t0, contenido: c0, onConfirmar, onCancelar, pending }: {
  titulo: string; contenido: string;
  onConfirmar: (t: string, c: string, razon: string) => void;
  onCancelar: () => void;
  pending: boolean;
}) {
  const [titulo, setTitulo] = useState(t0);
  const [contenido, setContenido] = useState(c0);
  const [razon, setRazon] = useState("");
  const valido = titulo.trim() && contenido.trim() && razon.trim();
  return (
    <div className="space-y-2 mt-2 p-3 rounded bg-gray-50 border">
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        placeholder="Título del recurso"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <textarea
        className="w-full rounded border px-2 py-1 text-sm min-h-[90px] resize-y"
        placeholder="Contenido"
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <textarea
        className="w-full rounded border px-2 py-1 text-xs min-h-[48px] resize-none bg-yellow-50 border-yellow-300"
        placeholder="¿Por qué editaste esto? (obligatorio)"
        value={razon}
        onChange={(e) => setRazon(e.target.value)}
      />
      <div className="flex gap-1">
        <button
          onClick={() => onConfirmar(titulo, contenido, razon)}
          disabled={pending || !valido}
          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
        >
          Guardar → Aplicar al KB
        </button>
        <button onClick={onCancelar} className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function SugerenciaKBCard({ item, recursosKB, onAplicar, onEliminar }: Props) {
  const [expandido, setExpandido] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [modoDescartar, setModoDescartar] = useState(false);
  const [feedbackDescarte, setFeedbackDescarte] = useState("");
  const [pending, startTransition] = useTransition();

  const meta = item.metadata as MetaKB;
  const recursoPrincipal = (() => {
    const id = meta.recurso_ids?.[0] ?? meta.recurso_id ?? meta.id_a;
    return id ? recursosKB[id] : undefined;
  })();
  const recursoB = meta.id_b ? recursosKB[meta.id_b] : undefined;

  const esGHL = meta.source === "ghl_edicion" && !!meta.que_cambiar;
  const esGap  = meta.categoria_suciedad === "Huérfano de cobertura";
  const esObs  = meta.categoria_suciedad === "Obsolescencia parcial";
  const esDup  = meta.categoria_suciedad === "Duplicado semántico" && !!meta.id_b;

  function handleAplicar(override?: { titulo: string; contenido: string; razon_edicion?: string }) {
    const t = toast.loading("Aplicando al KB...");
    startTransition(async () => {
      const result = await onAplicar(override);
      if (result.error) toast.error(result.error, { id: t });
      else toast.success(mensajeExito(result.data!), { id: t });
      setModoEdicion(false);
    });
  }

  function handleEliminarConfirmar() {
    if (!feedbackDescarte.trim()) return;
    const t = toast.loading("Descartando...");
    startTransition(async () => {
      const result = await onEliminar(feedbackDescarte.trim());
      if (result.error) toast.error(result.error, { id: t });
      else toast.success("Sugerencia descartada", { id: t });
      setModoDescartar(false);
      setFeedbackDescarte("");
    });
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50/20 p-4 space-y-2">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <EtiquetaTipo meta={meta} />
            <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[item.prioridad] ?? PRIORIDAD_COLOR.puede_esperar}`}>
              {item.prioridad.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
          </div>
          <p className="font-medium text-sm mt-1">{item.titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</p>
        </div>

        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          {/* Edición GHL: IA automática o editar antes */}
          {esGHL && !modoEdicion && (<>
            <button onClick={() => handleAplicar()} disabled={pending}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
              Aplicar IA
            </button>
            {recursoPrincipal && (
              <button onClick={() => setModoEdicion(true)} disabled={pending}
                className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50">
                Editar
              </button>
            )}
          </>)}

          {/* Gap: generar FAQ con IA o escribir manualmente */}
          {esGap && !modoEdicion && (<>
            <button onClick={() => handleAplicar()} disabled={pending}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
              Generar FAQ
            </button>
            <button onClick={() => setModoEdicion(true)} disabled={pending}
              className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50">
              Manual
            </button>
          </>)}

          {/* Obsolescencia: siempre requiere edición manual */}
          {esObs && !modoEdicion && (
            <button onClick={() => setModoEdicion(true)} disabled={pending}
              className="rounded bg-orange-500 px-3 py-1 text-xs text-white hover:bg-orange-600 disabled:opacity-50">
              Actualizar KB
            </button>
          )}

          {/* Duplicado: desactivar el recurso secundario */}
          {esDup && !modoEdicion && (
            <button onClick={() => handleAplicar()} disabled={pending}
              className="rounded bg-amber-500 px-3 py-1 text-xs text-white hover:bg-amber-600 disabled:opacity-50">
              Desactivar duplicado
            </button>
          )}

          {/* Genérico kb_calidad sin categoría conocida */}
          {!esGHL && !esGap && !esObs && !esDup && !modoEdicion && (
            <button onClick={() => handleAplicar()} disabled={pending}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
              Aplicar
            </button>
          )}

          <button onClick={() => setExpandido((v) => !v)}
            className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">
            {expandido ? "▴" : "▾"}
          </button>
          {!modoDescartar && (
            <button onClick={() => setModoDescartar(true)} disabled={pending}
              className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
              title="Descartar permanentemente">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Contexto expandible */}
      {expandido && (
        <div className="pl-2 border-l-2 border-green-300 space-y-2">
          {meta.que_cambiar && (
            <div className="rounded bg-violet-50 border border-violet-200 p-2 text-xs">
              <p className="font-medium text-violet-700 mb-0.5">Qué cambiar en el KB</p>
              <p className="text-violet-900">{meta.que_cambiar}</p>
            </div>
          )}
          {meta.razon_edicion && (
            <div className="rounded bg-gray-50 border p-2 text-xs">
              <p className="font-medium text-gray-600 mb-0.5">Razón del admin al editar</p>
              <p className="text-gray-700">"{meta.razon_edicion}"</p>
            </div>
          )}
          {recursoPrincipal && (
            <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs">
              <p className="font-medium text-blue-700 mb-0.5">
                Recurso KB afectado
                <span className="ml-1 font-normal text-blue-500">({recursoPrincipal.tipo})</span>
              </p>
              <p className="font-medium text-blue-900">{recursoPrincipal.titulo}</p>
              <p className="text-blue-800 line-clamp-4 mt-0.5">{recursoPrincipal.contenido}</p>
            </div>
          )}
          {recursoB && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs">
              <p className="font-medium text-amber-700 mb-0.5">Se desactivará este recurso (duplicado)</p>
              <p className="font-medium text-amber-900">{recursoB.titulo}</p>
              <p className="text-amber-800 line-clamp-2 mt-0.5">{recursoB.contenido}</p>
            </div>
          )}
        </div>
      )}

      {/* Editor inline con razón de edición obligatoria */}
      {modoEdicion && (
        <EditorInline
          titulo={esGap ? "" : (recursoPrincipal?.titulo ?? "")}
          contenido={esGap ? "" : (recursoPrincipal?.contenido ?? "")}
          onConfirmar={(t, c, razon) => handleAplicar({ titulo: t, contenido: c, razon_edicion: razon })}
          onCancelar={() => setModoEdicion(false)}
          pending={pending}
        />
      )}

      {/* Confirmar descarte con feedback obligatorio */}
      {modoDescartar && (
        <div className="mt-2 p-3 rounded bg-red-50 border border-red-200 space-y-2">
          <p className="text-xs font-medium text-red-700">¿Por qué descartás esta sugerencia?</p>
          <textarea
            autoFocus
            className="w-full rounded border border-red-300 px-2 py-1 text-xs min-h-[52px] resize-none bg-white"
            placeholder="Razón del descarte (obligatorio)"
            value={feedbackDescarte}
            onChange={(e) => setFeedbackDescarte(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              onClick={handleEliminarConfirmar}
              disabled={pending || !feedbackDescarte.trim()}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar descarte
            </button>
            <button
              onClick={() => { setModoDescartar(false); setFeedbackDescarte(""); }}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!modoEdicion && (
        <p className="text-xs text-green-700/60 pt-0.5">
          ✓ Al aplicar se actualiza el KB directamente — la IA mejorará sus respuestas.
        </p>
      )}
    </div>
  );
}
