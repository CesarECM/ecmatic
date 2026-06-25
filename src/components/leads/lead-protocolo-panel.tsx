"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  descartarLeadProtocoloAction,
  pausarReanudarProtocoloAction,
  registrarResultadoToqueAction,
} from "@/app/(dashboard)/admin/protocolos/actions";
import type { LeadProtocolo, ToqueRegistro } from "@/services/lead-protocolo";
import type { LlamadaPendienteProtocolo } from "@/services/llamadas";

const RESULTADO_COLOR: Record<string, string> = {
  pendiente:         "bg-yellow-100 text-yellow-700 border-yellow-300",
  en_aprobacion:    "bg-violet-100 text-violet-700 border-violet-300",
  enviado:           "bg-green-100 text-green-700 border-green-300",
  contesto:          "bg-green-100 text-green-700 border-green-300",
  no_contesto:      "bg-orange-100 text-orange-700 border-orange-300",
  respondio_positivo: "bg-emerald-100 text-emerald-700 border-emerald-300",
  respondio_negativo: "bg-red-100 text-red-700 border-red-300",
  descartado:        "bg-gray-100 text-gray-500 border-gray-300",
};

const CANAL_ICON: Record<string, string> = {
  whatsapp: "💬", llamada: "📞", email: "✉️",
};

const ESTADO_LLAMADA: Record<string, string> = {
  pendiente:  "bg-orange-100 text-orange-700 border-orange-300",
  completada: "bg-green-100 text-green-700 border-green-300",
};

const RESULTADO_LLAMADA: Record<string, string> = {
  exitoso:       "Exitoso",
  "no-contesta": "No contestó",
  seguimiento:   "Seguimiento",
  perdido:       "Perdido",
};

interface Props {
  leadId: string;
  leadProtocolo: (LeadProtocolo & { protocolo_nombre: string }) | null;
  historial: ToqueRegistro[];
  llamadas?: LlamadaPendienteProtocolo[];
  eliminarLlamadaAction?: (formData: FormData) => Promise<void>;
}

export function LeadProtocoloPanel({ leadId, leadProtocolo: lp, historial, llamadas = [], eliminarLlamadaAction }: Props) {
  const [registrandoId, setRegistrandoId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [resultado, setResultado] = useState("contesto");
  const [guardando, setGuardando] = useState(false);

  if (!lp && historial.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">Este lead no está en ningún protocolo de seguimiento.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Para iniciarlo, regístralo en Depuración con canal "No-show".
          </p>
        </CardContent>
      </Card>
    );
  }

  async function handlePausarReanudar() {
    if (!lp) return;
    const nuevoEstado = lp.estado === "activo" ? "pausado" : "activo";
    await pausarReanudarProtocoloAction(lp.id, nuevoEstado, leadId);
  }

  async function handleDescartar() {
    if (!lp) return;
    const etiqueta = prompt("Etiqueta de descarte (ej. Sin respuesta, No le interesa):");
    if (!etiqueta) return;
    await descartarLeadProtocoloAction(lp.id, etiqueta, leadId);
  }

  async function handleRegistrarResultado(toqueRegistroId: string) {
    setGuardando(true);
    await registrarResultadoToqueAction(toqueRegistroId, resultado, notas, leadId);
    setRegistrandoId(null);
    setNotas("");
    setGuardando(false);
  }

  return (
    <div className="space-y-3 p-4">
      {/* Estado actual */}
      {lp && (
        <Card className={lp.estado === "activo" ? "border-primary/40" : "border-muted"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Protocolo activo
              <Badge className={`text-xs py-0 border ${lp.estado === "activo" ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {lp.estado}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{lp.protocolo_nombre}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Toque actual: <strong>{lp.toque_actual}</strong></span>
              {lp.proximo_toque_at && (
                <span>
                  Próximo:{" "}
                  <strong>
                    {new Date(lp.proximo_toque_at).toLocaleDateString("es-MX", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </strong>
                </span>
              )}
            </div>
            {lp.etiqueta_aplicada && (
              <p className="text-xs">
                Etiqueta: <span className="font-medium text-muted-foreground">{lp.etiqueta_aplicada}</span>
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={handlePausarReanudar}>
                {lp.estado === "activo" ? "Pausar" : "Reanudar"}
              </Button>
              {lp.estado === "activo" && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={handleDescartar}>
                  Descartar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Llamadas — solo visible si el admin pasó la action de eliminar */}
      {eliminarLlamadaAction && llamadas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Llamadas
              <span className="text-xs font-normal text-muted-foreground">({llamadas.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {llamadas.map((ll) => {
              const lead = ll.leads as { nombre: string | null; telefono: string | null } | undefined;
              const toque = ll.protocolo_toques;
              const proto = ll.protocolos_seguimiento;

              return (
                <div key={ll.id} className="rounded-md border p-2.5 text-sm space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">📞 {lead?.nombre ?? lead?.telefono ?? "Lead"}</span>
                        <Badge className={`text-xs py-0 border ${ESTADO_LLAMADA[ll.estado] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {ll.estado}
                        </Badge>
                        {ll.resultado && (
                          <Badge className="text-xs py-0 border bg-muted text-muted-foreground border-muted">
                            {RESULTADO_LLAMADA[ll.resultado] ?? ll.resultado}
                          </Badge>
                        )}
                      </div>
                      {proto && toque && (
                        <p className="text-xs text-muted-foreground">
                          {proto.nombre} · {toque.nombre}
                        </p>
                      )}
                      {ll.notas && (
                        <p className="text-xs italic text-muted-foreground truncate">{ll.notas}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(ll.created_at).toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {ll.duracion_min ? ` · ${ll.duracion_min} min` : ""}
                      </p>
                    </div>

                    {/* Botón eliminar — solo para admin (cuando viene la action) */}
                    <form action={eliminarLlamadaAction}>
                      <input type="hidden" name="llamada_id" value={ll.id} />
                      <input type="hidden" name="leadId" value={leadId} />
                      <button
                        type="submit"
                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-1 transition-colors"
                        title="Eliminar llamada"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Historial de toques */}
      {historial.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historial de toques</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {historial.map((reg) => {
              const canal = (reg.protocolo_toques as any)?.canal ?? "";
              const nombre = (reg.protocolo_toques as any)?.nombre ?? "Toque";
              const resultado = reg.resultado;
              const esLlamada = canal === "llamada";
              const pendienteRegistro = esLlamada && resultado === "pendiente";

              return (
                <div key={reg.id} className="rounded-md border p-2.5 text-sm space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{CANAL_ICON[canal] ?? "•"}</span>
                    <span className="font-medium flex-1">{nombre}</span>
                    <Badge className={`text-xs py-0 border ${RESULTADO_COLOR[resultado] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {resultado.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Programado: {new Date(reg.programado_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {reg.ejecutado_at && ` · Ejecutado: ${new Date(reg.ejecutado_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                  {reg.notas && <p className="text-xs italic text-muted-foreground">{reg.notas}</p>}

                  {/* Formulario para registrar resultado de llamada */}
                  {pendienteRegistro && registrandoId !== reg.id && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setRegistrandoId(reg.id)}>
                      Registrar resultado de llamada
                    </Button>
                  )}
                  {registrandoId === reg.id && (
                    <div className="space-y-2 pt-1 border-t">
                      <select value={resultado} onChange={(e) => setResultado(e.target.value)} className="w-full text-sm border rounded px-2 py-1.5">
                        <option value="contesto">Contestó</option>
                        <option value="no_contesto">No contestó</option>
                        <option value="respondio_positivo">Respondió positivo</option>
                        <option value="respondio_negativo">Respondió negativo</option>
                      </select>
                      <textarea
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Notas de la llamada (opcional)"
                        rows={2}
                        className="w-full text-sm border rounded px-2 py-1.5"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={guardando} onClick={() => handleRegistrarResultado(reg.id)}>
                          {guardando ? "Guardando…" : "Guardar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRegistrandoId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
