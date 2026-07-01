"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ItemAprobacionGHL } from "@/services/ghl-aprobacion";
import {
  aprobarMensajeGHLAction,
  editarAprobarMensajeGHLAction,
  rechazarMensajeGHLAction,
  marcarEnviadoManualmenteGHLAction,
} from "@/app/(dashboard)/admin/leads/[id]/actions";

interface Props {
  item: ItemAprobacionGHL;
  leadId: string;
}

function ScoreChip({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 80 ? "bg-green-100 text-green-700" :
    pct >= 60 ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700";
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>
      IA {pct}%
    </span>
  );
}

// MPS-19 S72.5 — Banner para items que requieren template WA (ventana 24h cerrada).
// El admin ve el texto sugerido como referencia, va a GHL a enviar el template,
// y regresa a ECMatic para cerrar el loop con "Marcar como enviado".
function BannerTemplate({ item, leadId }: Props) {
  const [pending, startTransition] = useTransition();

  function marcarEnviado() {
    startTransition(async () => {
      const id = toast.loading("Registrando…");
      const r = await marcarEnviadoManualmenteGHLAction(item.id, item.campana, leadId);
      if (r.error) toast.error(r.error, { id });
      else toast.success("Marcado como enviado — nivel avanzado", { id });
    });
  }

  function rechazar() {
    startTransition(async () => {
      const id = toast.loading("Rechazando…");
      const r = await rechazarMensajeGHLAction(item.id, item.campana, leadId);
      if (r.error) toast.error(r.error, { id });
      else toast.success("Seguimiento rechazado", { id });
    });
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border-2 border-orange-300 bg-orange-50 p-3 space-y-2 text-sm shrink-0">
      {/* Cabecera */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-orange-800 text-xs uppercase tracking-wide">
          ⚠️ Fuera de ventana WA — Requiere template
        </span>
      </div>

      {/* Instrucción */}
      <p className="text-xs text-orange-700 leading-relaxed">
        La ventana de sesión de 24h está cerrada. WhatsApp no permite mensajes libres.
        Usa el texto de abajo como referencia, envía el template desde GHL y luego marca como enviado.
      </p>

      {/* Texto sugerido (solo referencia) */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Texto sugerido (referencia):</p>
        <div className="bg-white rounded border border-orange-200 p-2 text-sm whitespace-pre-wrap text-muted-foreground">
          {item.mensaje_ia}
        </div>
      </div>

      {/* Pasos */}
      <ol className="text-xs text-orange-800 space-y-0.5 list-decimal list-inside">
        <li>Copia el texto de referencia</li>
        <li>Ve a GHL → busca el contacto → envía el template de WA</li>
        <li>Regresa aquí y haz clic en "Marcar como enviado"</li>
      </ol>

      {/* Acciones */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={marcarEnviado}
          disabled={pending}
          className="rounded bg-orange-600 px-3 py-1.5 text-xs text-white hover:bg-orange-700 disabled:opacity-50 font-medium"
        >
          ✓ Marcar como enviado
        </button>
        <button
          onClick={rechazar}
          disabled={pending}
          className="rounded bg-gray-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          ✗ Omitir este seguimiento
        </button>
      </div>
    </div>
  );
}

export function BannerAprobacionGHL({ item, leadId }: Props) {
  // MPS-19: derivar hacia el banner de template si aplica
  if (item.requiere_template) {
    return <BannerTemplate item={item} leadId={leadId} />;
  }

  return <BannerAprobacionLibre item={item} leadId={leadId} />;
}

// Banner original para mensajes libres (dentro de ventana WA)
function BannerAprobacionLibre({ item, leadId }: Props) {
  const [modo, setModo] = useState<"ver" | "editar" | "rechazar">("ver");
  const [texto, setTexto] = useState(item.mensaje_ia);
  const [razon, setRazon] = useState("");
  const [pending, startTransition] = useTransition();

  function aprobar() {
    startTransition(async () => {
      const id = toast.loading("Enviando…");
      const r = await aprobarMensajeGHLAction(
        item.id, item.conv_id, item.ghl_contact_id,
        item.mensaje_ia, item.lead_ecmatic_id, item.campana, leadId
      );
      if (r.error) toast.error(r.error, { id });
      else toast.success("Mensaje enviado", { id });
    });
  }

  function enviarEditado() {
    if (!razon.trim()) { toast.error("Indica la razón de la edición"); return; }
    startTransition(async () => {
      const id = toast.loading("Enviando editado…");
      const r = await editarAprobarMensajeGHLAction(
        item.id, item.conv_id, item.ghl_contact_id,
        texto, razon, item.lead_ecmatic_id, item.campana, leadId
      );
      if (r.error) toast.error(r.error, { id });
      else toast.success("Mensaje editado y enviado", { id });
    });
  }

  function rechazar() {
    startTransition(async () => {
      const id = toast.loading("Rechazando…");
      const r = await rechazarMensajeGHLAction(item.id, item.campana, leadId);
      if (r.error) toast.error(r.error, { id });
      else toast.success("Mensaje rechazado", { id });
    });
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border-2 border-violet-300 bg-violet-50 p-3 space-y-2 text-sm shrink-0">
      {/* Cabecera */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-violet-800 text-xs uppercase tracking-wide">
          ⏳ Respuesta IA pendiente
        </span>
        {item.score_ia !== null && <ScoreChip score={item.score_ia} />}
        {item.razon_score && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={item.razon_score}>
            {item.razon_score}
          </span>
        )}
      </div>

      {/* Mensaje del lead */}
      <div className="text-xs bg-white rounded border p-2 text-muted-foreground">
        <span className="font-medium text-foreground">Lead: </span>
        {item.mensaje_lead.slice(0, 200)}{item.mensaje_lead.length > 200 ? "…" : ""}
      </div>

      {/* Mensaje IA / Editor */}
      {modo === "editar" ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border px-2 py-1.5 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-violet-400"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <input
            className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
            placeholder="¿Por qué editaste? (ayuda a mejorar la IA)"
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
          />
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={enviarEditado}
              disabled={pending || !texto.trim()}
              className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Enviar editado
            </button>
            <button
              onClick={() => { setTexto(item.mensaje_ia); setRazon(""); setModo("ver"); }}
              className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : modo === "rechazar" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            El lead no recibirá respuesta. ¿Confirmas el rechazo?
          </p>
          <div className="flex gap-1">
            <button
              onClick={rechazar}
              disabled={pending}
              className="rounded bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
            >
              Confirmar rechazo
            </button>
            <button onClick={() => setModo("ver")} className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded border p-2 text-sm whitespace-pre-wrap">
            {item.mensaje_ia}
          </div>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={aprobar}
              disabled={pending}
              className="rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50 font-medium"
            >
              ✓ Aprobar y enviar
            </button>
            <button
              onClick={() => setModo("editar")}
              disabled={pending}
              className="rounded bg-gray-100 px-3 py-1.5 text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => setModo("rechazar")}
              disabled={pending}
              className="rounded bg-gray-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              ✗ Rechazar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
