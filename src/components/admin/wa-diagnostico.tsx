"use client";
// S27.5/S27.6 — Panel de diagnóstico WhatsApp con botón de prueba
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface WADiagnostico {
  phoneId: string;
  displayPhone: string;
  verifiedName: string;
  qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  status: string;
  verificado: boolean;
}

const QUALITY_COLOR: Record<string, string> = {
  GREEN: "text-green-600",
  YELLOW: "text-yellow-600",
  RED: "text-red-600",
  UNKNOWN: "text-gray-400",
};

const QUALITY_LABEL: Record<string, string> = {
  GREEN: "Alta calidad ✓",
  YELLOW: "Calidad media",
  RED: "Calidad baja",
  UNKNOWN: "Desconocido",
};

export function WADiagnosticoPanel() {
  const [data, setData] = useState<WADiagnostico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/admin/whatsapp-diagnostico")
      .then((r) => r.json())
      .then((d: WADiagnostico & { error?: string }) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Error de red"))
      .finally(() => setCargando(false));
  }, []);

  async function enviarPrueba() {
    setEnviando(true);
    const tid = toast.loading("Enviando mensaje de prueba…");
    try {
      const res = await fetch("/api/admin/whatsapp-diagnostico", { method: "POST" });
      const d = await res.json() as { ok?: boolean; error?: string; destino?: string };
      if (!res.ok) toast.error(d.error ?? "Error al enviar", { id: tid });
      else toast.success(`Mensaje enviado a ${d.destino}`, { id: tid });
    } catch {
      toast.error("Error de red", { id: tid });
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-xs text-muted-foreground">Consultando Meta API…</p>;

  if (error) {
    return (
      <div className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const conectado = data.status === "CONNECTED";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Número</span>
        <span className="font-mono font-medium">{data.displayPhone}</span>

        <span className="text-muted-foreground">Nombre verificado</span>
        <span>{data.verifiedName}</span>

        <span className="text-muted-foreground">Estado</span>
        <span className={conectado ? "text-green-600 font-medium" : "text-red-600"}>
          {data.status}
        </span>

        <span className="text-muted-foreground">Calidad</span>
        <span className={`font-medium ${QUALITY_COLOR[data.qualityRating]}`}>
          {QUALITY_LABEL[data.qualityRating]}
        </span>

        <span className="text-muted-foreground">Phone ID</span>
        <span className="font-mono text-xs text-muted-foreground">{data.phoneId}</span>
      </div>

      <button
        onClick={enviarPrueba}
        disabled={enviando || !conectado}
        className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Enviar mensaje de prueba a ADMIN_WHATSAPP"}
      </button>

      {!conectado && (
        <p className="text-xs text-red-600">El número no está conectado — revisa Meta Business Manager.</p>
      )}
    </div>
  );
}
