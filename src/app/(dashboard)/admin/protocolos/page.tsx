import { listarProtocolos } from "@/services/protocolos-seguimiento";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NuevoProtocoloForm } from "./components/NuevoProtocoloForm";

export const revalidate = 0;
export const metadata = { title: "Protocolos de Seguimiento · ECMatic" };

export default async function ProtocolosPage() {
  const protocolos = await listarProtocolos();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Protocolos de Seguimiento</h1>
          <p className="text-sm text-muted-foreground">
            Cadencias configurables de seguimiento para leads inactivos (5 Toques, etc.).
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <NuevoProtocoloForm />
        </div>
      </div>

      {protocolos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">No hay protocolos configurados aún.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea uno con el botón de arriba o aplica la migración 052 para cargar el Protocolo 5 Toques.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {protocolos.map((p) => (
            <Card key={p.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a href={`/admin/protocolos/${p.id}`} className="font-medium text-sm hover:underline">
                        {p.nombre}
                      </a>
                      <Badge
                        className={`text-xs py-0 border ${
                          p.activo
                            ? "bg-green-100 text-green-700 border-green-300"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                      {p.etapa_id && (
                        <Badge className="text-xs py-0 border bg-violet-100 text-violet-700 border-violet-300">
                          con etapa
                        </Badge>
                      )}
                    </div>
                    {p.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.descripcion}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span>{p.dias_duracion} días</span>
                    <span className={p.total_leads > 0 ? "text-primary font-medium" : ""}>
                      {p.total_leads} leads activos
                    </span>
                    <a href={`/admin/protocolos/${p.id}`} className="text-primary hover:underline font-medium">
                      Configurar →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
