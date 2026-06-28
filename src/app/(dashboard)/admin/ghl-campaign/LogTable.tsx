"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarLogCampanaAction } from "./actions";

export type LogRow = {
  ghl_contact_id: string;
  nombre: string | null;
  categoria_sbc: string;
  variante: "a" | "b" | null;
  enviado: boolean;
  enviado_at: string | null;
  respuesta_tipo: string | null;
  convirtio: boolean | null;
  updated_at: string;
};

function categoriaBadge(cat: string): string {
  if (cat.includes("caliente"))    return "text-orange-500 font-medium";
  if (cat.includes("tibio"))       return "text-yellow-500";
  if (cat.includes("ya_compro"))   return "text-green-500";
  if (cat.includes("descartado"))  return "text-red-500";
  return "text-muted-foreground";
}

export function LogTable({ logs: inicial }: { logs: LogRow[] }) {
  const [rows, setRows]         = useState(inicial);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleEliminar(ghlContactId: string) {
    startTransition(async () => {
      await eliminarLogCampanaAction(ghlContactId);
      setRows((prev) => prev.filter((r) => r.ghl_contact_id !== ghlContactId));
      setConfirmId(null);
      router.refresh(); // recalcula stats en el servidor
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Actividad reciente ({rows.length} registros)
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin registros todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Nombre", "Categoría", "Var.", "Enviado", "Respuesta", "Convirtió", ""].map((h) => (
                  <th key={h} className="text-left p-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((log) => (
                <tr key={log.ghl_contact_id} className="hover:bg-muted/30">
                  <td className="p-2 max-w-[160px] truncate">
                    {log.nombre ?? log.ghl_contact_id.slice(-6)}
                  </td>
                  <td className="p-2">
                    <span className={categoriaBadge(log.categoria_sbc)}>
                      {log.categoria_sbc.replace("ecm_sbc_", "")}
                    </span>
                  </td>
                  <td className="p-2">
                    {log.variante
                      ? <span className={log.variante === "a" ? "text-green-500 font-bold" : "text-blue-500 font-bold"}>
                          {log.variante.toUpperCase()}
                        </span>
                      : "—"}
                  </td>
                  <td className="p-2">{log.enviado ? "✓" : "—"}</td>
                  <td className="p-2">{log.respuesta_tipo ?? "—"}</td>
                  <td className="p-2">
                    {log.convirtio === true ? "✓" : log.convirtio === false ? "✗" : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {confirmId === log.ghl_contact_id ? (
                      <span className="inline-flex gap-1">
                        <button
                          onClick={() => handleEliminar(log.ghl_contact_id)}
                          disabled={pending}
                          className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          {pending ? "…" : "Confirmar"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-2 py-0.5 rounded bg-muted hover:bg-muted/70"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmId(log.ghl_contact_id)}
                        className="px-2 py-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Eliminar de campaña"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
