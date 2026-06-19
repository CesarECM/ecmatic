import { listarLogIA } from "@/services/log-ia";

export const metadata = { title: "Log de IA · ECMatic" };
export const revalidate = 0;

const TIPO_LABEL: Record<string, string> = {
  clasificar_intencion:     "Clasificar intención",
  generar_respuesta:        "Generar respuesta WA",
  generar_encuesta:         "Generar encuesta",
  inferir_temperamento:     "Inferir temperamento",
  sugerir_kb:               "Sugerir KB",
  detectar_competidor:      "Detectar competidor",
  detectar_promesa:         "Detectar promesa",
  detectar_momento_cierre:  "Detectar momento cierre",
  generar_slot_cita:        "Generar slot cita",
  calcular_churn:           "Calcular churn",
  upsell:                   "Propuesta upsell",
};

const RESULTADO_COLOR: Record<string, string> = {
  enviado:       "text-green-600",
  handoff:       "text-orange-600",
  sugerencia_kb: "text-blue-600",
  error:         "text-red-600",
};

interface Props { searchParams: Promise<{ tipo?: string }> }

export default async function LogIAPage({ searchParams }: Props) {
  const { tipo } = await searchParams;
  const registros = await listarLogIA({ tipoAccion: tipo });

  const TIPOS = Object.keys(TIPO_LABEL);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Log de acciones IA</h1>
        <p className="text-sm text-muted-foreground">{registros.length} registros recientes</p>
      </div>

      {/* Filtro por tipo */}
      <div className="flex flex-wrap gap-2">
        <a href="/admin/log-ia"
          className={`rounded border px-2 py-1 text-xs ${!tipo ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
          Todos
        </a>
        {TIPOS.map((t) => (
          <a key={t} href={`/admin/log-ia?tipo=${t}`}
            className={`rounded border px-2 py-1 text-xs ${tipo === t ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            {TIPO_LABEL[t]}
          </a>
        ))}
      </div>

      {registros.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin registros. Las acciones de IA aparecerán aquí conforme el sistema procese mensajes.
        </div>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3 text-left">Acción</th>
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-left">Resultado</th>
              <th className="p-3 text-center">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const lead = r.leads as unknown as { nombre: string | null; telefono: string | null } | null;
              return (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-xs">
                    <span className="bg-gray-100 rounded px-1.5 py-0.5">
                      {TIPO_LABEL[r.tipo_accion] ?? r.tipo_accion}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {lead?.nombre ?? lead?.telefono ?? "—"}
                  </td>
                  <td className={`p-3 text-xs font-medium ${RESULTADO_COLOR[r.resultado ?? ""] ?? "text-gray-600"}`}>
                    {r.resultado ?? "—"}
                  </td>
                  <td className="p-3 text-center text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
