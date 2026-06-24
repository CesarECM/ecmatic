"use client";

// S21.1 — Sección de mensajes recientes de un lead con botones de votación.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VotoBotones } from "@/components/ui/voto-botones";

const CANAL_ICON: Record<string, string> = {
  whatsapp: "💬", email: "✉️", meet: "📹", interno: "📝",
};

type Mensaje = {
  id: string;
  canal: string;
  direccion: string;
  contenido: string;
  intencion_clasificada: string | null;
  interceptado: boolean;
  created_at: string;
};

interface MensajesLeadProps {
  mensajes: Mensaje[];
}

export function MensajesLead({ mensajes }: MensajesLeadProps) {
  if (!mensajes.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Mensajes recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`text-sm p-2 rounded-md ${
                m.direccion === "entrante" ? "bg-muted" : "bg-primary/5 text-right"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span>{CANAL_ICON[m.canal] ?? "📨"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                {m.intencion_clasificada && (
                  <Badge variant="outline" className="text-xs py-0">
                    {m.intencion_clasificada}
                  </Badge>
                )}
                {m.interceptado && (
                  <Badge className="text-xs py-0 bg-violet-100 text-violet-700 border border-violet-300">
                    No enviado
                  </Badge>
                )}
                {/* S21.1 — Votos solo en respuestas salientes (IA) */}
                {m.direccion === "saliente" && <VotoBotones mensajeId={m.id} />}
              </div>
              <p className="text-sm">{m.contenido}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
