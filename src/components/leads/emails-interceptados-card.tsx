import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EmailInterceptado } from "@/services/bandeja-email";

const TIPO_LABEL: Record<string, string> = {
  bienvenida: "Bienvenida",
  nurturing: "Nurturing",
  notif_cita: "Notif. cita",
  otro: "Otro",
};

const TIPO_COLOR: Record<string, string> = {
  bienvenida: "bg-blue-100 text-blue-700 border-blue-300",
  nurturing: "bg-amber-100 text-amber-700 border-amber-300",
  notif_cita: "bg-green-100 text-green-700 border-green-300",
  otro: "bg-gray-100 text-gray-700 border-gray-300",
};

interface EmailsInterceptadosCardProps {
  emails: EmailInterceptado[];
}

export function EmailsInterceptadosCard({ emails }: EmailsInterceptadosCardProps) {
  if (!emails.length) return null;

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span>✉️ Emails interceptados</span>
          <Badge className="bg-violet-100 text-violet-700 border border-violet-300 text-xs">
            Modo depuración
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {emails.map((e) => (
            <div key={e.id} className={`rounded-md border p-3 text-sm ${e.leido ? "bg-muted/40" : "bg-violet-50"}`}>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={`text-xs py-0 border ${TIPO_COLOR[e.tipo] ?? TIPO_COLOR.otro}`}>
                  {TIPO_LABEL[e.tipo] ?? e.tipo}
                </Badge>
                {!e.leido && (
                  <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" title="No leído" />
                )}
                <span className="text-xs text-muted-foreground">
                  Para: {e.para}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(e.created_at).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p className="font-medium text-sm">{e.asunto}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
