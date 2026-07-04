"use client";

import { useState } from "react";
import type { FollowupTemplate } from "@/services/followup-templates";
import {
  promoverTemplateAction, conectarWorkflowAction,
  desconectarWorkflowAction, eliminarTemplateSugeridoAction,
  eliminarTemplateAction, degradarEstadoAction,
} from "./actions";

const ESTADO_CONFIG = {
  sugerido:  { label: "Sugerido",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  aprobado:  { label: "Aprobado",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  conectado: { label: "Conectado", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
} as const;

const TIPO_LABEL: Record<string, string> = {
  nurturing: "Nurturing", conversational: "Conversacional",
  payment: "Pago", demo_agendado: "Post-Demo",
};

const DEGRADAR_LABEL: Record<string, string> = {
  conectado: "← Desconectar (→ Aprobado)",
  aprobado:  "← Bajar a Sugerido",
};

interface Props {
  template: FollowupTemplate & { angulo?: { codigo: string; nombre: string } | null };
}

export function TemplateCard({ template }: Props) {
  const [editandoTexto,   setEditandoTexto]   = useState(false);
  const [texto,           setTexto]           = useState(template.texto);
  const [workflowInput,   setWorkflowInput]   = useState(template.ghl_workflow_id ?? "");
  const [mostrarWorkflow, setMostrarWorkflow] = useState(false);
  const [confirmarElim,   setConfirmarElim]   = useState(false);

  const cfg      = ESTADO_CONFIG[template.estado];
  const tasaResp = template.uso_count > 0
    ? `${Math.round((template.respuesta_count / template.uso_count) * 100)}%`
    : "—";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs rounded px-2 py-0.5 font-medium ${cfg.cls}`}>{cfg.label}</span>
          <span className="text-xs rounded bg-muted px-2 py-0.5 text-muted-foreground">
            {TIPO_LABEL[template.tipo] ?? template.tipo}
          </span>
          {template.angulo && (
            <span className="text-xs text-muted-foreground">{template.angulo.nombre}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{template.uso_count} usos</span>
          <span>{tasaResp} respuesta</span>
        </div>
      </div>

      {/* ── Texto ── */}
      {editandoTexto ? (
        <form action={promoverTemplateAction} className="space-y-2">
          <input type="hidden" name="templateId" value={template.id} />
          <textarea
            name="texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            className="w-full rounded border bg-background p-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button type="submit"
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
              {template.estado === "sugerido" ? "Guardar y promover" : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditandoTexto(false)}
              className="rounded bg-muted px-3 py-1 text-xs hover:bg-muted/80">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{texto}</p>
      )}

      {/* ── Workflow ID (Aprobado o Conectado) ── */}
      {(template.estado === "aprobado" || template.estado === "conectado") && (
        <div className="border-t pt-2">
          {template.estado === "conectado" && template.ghl_workflow_id ? (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-green-700 dark:text-green-400 font-medium">Workflow:</span>
              <code className="bg-muted px-1.5 py-0.5 rounded">{template.ghl_workflow_id}</code>
              <form action={desconectarWorkflowAction} className="inline">
                <input type="hidden" name="templateId" value={template.id} />
                <button type="submit" className="text-red-500 hover:underline">Desconectar</button>
              </form>
            </div>
          ) : mostrarWorkflow ? (
            <form action={conectarWorkflowAction} className="flex gap-2 flex-wrap">
              <input type="hidden" name="templateId" value={template.id} />
              <input
                name="workflowId"
                value={workflowInput}
                onChange={(e) => setWorkflowInput(e.target.value)}
                placeholder="ID del workflow GHL"
                className="flex-1 min-w-[200px] rounded border bg-background px-2 py-1 text-xs"
              />
              <button type="submit"
                className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">
                Conectar
              </button>
              <button type="button" onClick={() => setMostrarWorkflow(false)}
                className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80">
                ✕
              </button>
            </form>
          ) : (
            <button onClick={() => setMostrarWorkflow(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              + Vincular workflow GHL (→ Conectado)
            </button>
          )}
        </div>
      )}

      {/* ── Acciones ── */}
      <div className="flex gap-2 border-t pt-2 flex-wrap items-center">

        {/* Editar texto */}
        {!editandoTexto && (
          <button onClick={() => setEditandoTexto(true)}
            className="rounded bg-muted px-3 py-1 text-xs hover:bg-muted/80">
            {template.estado === "sugerido" ? "Editar y promover" : "Editar texto"}
          </button>
        )}

        {/* Degradar estado */}
        {(template.estado === "conectado" || template.estado === "aprobado") && (
          <form action={degradarEstadoAction} className="inline">
            <input type="hidden" name="templateId"   value={template.id} />
            <input type="hidden" name="estadoActual" value={template.estado} />
            <button type="submit"
              className="rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-3 py-1 text-xs hover:bg-yellow-200">
              {DEGRADAR_LABEL[template.estado]}
            </button>
          </form>
        )}

        {/* Eliminar sugerido (directo) */}
        {template.estado === "sugerido" && (
          <form action={eliminarTemplateSugeridoAction} className="inline">
            <input type="hidden" name="templateId" value={template.id} />
            <button type="submit"
              className="rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 text-xs hover:bg-red-200">
              Eliminar
            </button>
          </form>
        )}

        {/* Eliminar aprobado/conectado — requiere confirmación */}
        {(template.estado === "aprobado" || template.estado === "conectado") && (
          confirmarElim ? (
            <form action={eliminarTemplateAction} className="inline flex items-center gap-1">
              <input type="hidden" name="templateId" value={template.id} />
              <button type="submit"
                className="rounded bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700">
                Confirmar eliminación
              </button>
              <button type="button" onClick={() => setConfirmarElim(false)}
                className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80">
                No
              </button>
            </form>
          ) : (
            <button onClick={() => setConfirmarElim(true)}
              className="rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 text-xs hover:bg-red-200">
              Eliminar
            </button>
          )
        )}
      </div>
    </div>
  );
}
