import { obtenerConfig } from "@/services/sistema";
import { listarEmailsInterceptados, contarEmailsNoLeidos } from "@/services/bandeja-email";
import { FormularioLeadReal } from "./components/FormularioLeadReal";
import { marcarEmailLeidoAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 0;
export const metadata = { title: "Depuración · ECMatic" };

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

export default async function DepuracionPage() {
  const [config, emails, noLeidos] = await Promise.all([
    obtenerConfig(),
    listarEmailsInterceptados({ limite: 100 }),
    contarEmailsNoLeidos(),
  ]);

  const enDepuracion = config.modo_operacion === "depuracion";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Modo Depuración</h1>
          <p className="text-sm text-muted-foreground">
            Leads reales entran al sistema. Las salidas al lead quedan interceptadas aquí y en cada ficha.
          </p>
        </div>
        <Badge
          className={`ml-auto shrink-0 ${
            enDepuracion
              ? "bg-violet-100 text-violet-700 border border-violet-300"
              : "bg-gray-100 text-gray-500 border border-gray-200"
          }`}
        >
          {enDepuracion ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      {!enDepuracion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          El sistema no está en modo Depuración. Actívalo en{" "}
          <a href="/admin/sistema" className="underline font-medium">
            Estado del sistema
          </a>{" "}
          para ingresar leads reales e interceptar salidas.
        </div>
      )}

      {/* Formulario de ingreso de lead real */}
      {enDepuracion && <FormularioLeadReal />}

      {/* Bandeja global de emails interceptados */}
      <Card className="border-violet-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span>✉️ Bandeja de emails interceptados</span>
            {noLeidos > 0 && (
              <Badge className="bg-violet-600 text-white text-xs">{noLeidos} nuevos</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Emails que en modo Depuración no se envían al lead. Se muestran aquí y en la ficha de cada lead.
          </p>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin emails interceptados aún.
            </p>
          ) : (
            <div className="space-y-2">
              {emails.map((e) => (
                <div
                  key={e.id}
                  className={`rounded-md border p-3 text-sm ${e.leido ? "bg-muted/40" : "bg-violet-50 border-violet-200"}`}
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <Badge className={`text-xs py-0 border shrink-0 ${TIPO_COLOR[e.tipo] ?? TIPO_COLOR.otro}`}>
                        {TIPO_LABEL[e.tipo] ?? e.tipo}
                      </Badge>
                      {!e.leido && (
                        <span className="h-2 w-2 rounded-full bg-violet-500 inline-block shrink-0" />
                      )}
                      <span className="font-medium truncate">{e.asunto}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {!e.leido && (
                        <form action={marcarEmailLeidoAction.bind(null, e.id)}>
                          <button
                            type="submit"
                            className="text-xs text-violet-600 hover:underline"
                          >
                            Marcar leído
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Para: {e.para}</span>
                    {(e.leads as { nombre: string | null } | null)?.nombre && (
                      <>
                        <span>·</span>
                        <a href={`/admin/leads/${e.lead_id}`} className="hover:underline text-violet-600">
                          {(e.leads as { nombre: string | null }).nombre}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
