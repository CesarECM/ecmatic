import { listarLogIA } from "@/services/log-ia";

export const metadata = { title: "Log de IA · ECMatic" };
export const revalidate = 0;

const TIPO_LABEL: Record<string, string> = {
  // Tareas actuales
  CLASIFICAR:       "Clasificar intención",
  RESPUESTA:        "Generar respuesta WA",
  ANALISIS:         "Análisis IA",
  COACHING:         "Coaching vendedor",
  ENCUESTA:         "Generar encuesta",
  SUGERIR_KB:       "Auditoría / sugerencia KB",
  COMPETIDORES:     "Detectar competidor",
  CHURN:            "Calcular churn",
  CAGC_INFERIR:     "Inferir fase CAGC",
  VISION:           "Clasificar imagen",
  SENALES:          "Detectar señales",
  LEADMAGNET:       "Ofrecer leadmagnet",
  CONTEXTO:         "Actualizar contexto lead",
  PAQUETE_SERVICIO: "Paquete servicio nuevo",
  SETTER:           "Evaluar fase setter",
  CUALIFICACION:    "Cualificar lead",
  OBJECION:         "Filtrar objeción",
  DESCONFIANZA:     "Detectar desconfianza",
  BRIEF_DISENO:     "Generar brief diseño",
  CLUSTERING:       "Clustering sugerencias",
  // Legacy Sprint 10
  clasificar_intencion:    "Clasificar intención",
  generar_respuesta:       "Generar respuesta WA",
  generar_encuesta:        "Generar encuesta",
  inferir_temperamento:    "Inferir temperamento",
  sugerir_kb:              "Sugerir KB",
  detectar_competidor:     "Detectar competidor",
  detectar_promesa:        "Detectar promesa",
  detectar_momento_cierre: "Detectar momento cierre",
  generar_slot_cita:       "Generar slot cita",
  calcular_churn:          "Calcular churn",
  upsell:                  "Propuesta upsell",
};

const MODELO_LABEL: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku",
  "claude-sonnet-4-6":         "Sonnet",
  "claude-opus-4-8":           "Opus",
};

const MODELO_COLOR: Record<string, string> = {
  "claude-haiku-4-5-20251001": "bg-blue-100 text-blue-700",
  "claude-sonnet-4-6":         "bg-purple-100 text-purple-700",
  "claude-opus-4-8":           "bg-amber-100 text-amber-700",
};

const TIPO_COLOR: Record<string, string> = {
  CLASIFICAR:   "bg-sky-100 text-sky-700",
  RESPUESTA:    "bg-green-100 text-green-700",
  CONTEXTO:     "bg-indigo-100 text-indigo-700",
  SETTER:       "bg-orange-100 text-orange-700",
  OBJECION:     "bg-red-100 text-red-700",
  DESCONFIANZA: "bg-rose-100 text-rose-700",
  CAGC_INFERIR: "bg-teal-100 text-teal-700",
  SUGERIR_KB:   "bg-violet-100 text-violet-700",
};

interface Props { searchParams: Promise<{ tipo?: string }> }

export default async function LogIAPage({ searchParams }: Props) {
  const { tipo } = await searchParams;
  const registros = await listarLogIA({ tipoAccion: tipo, limit: 200 });

  const TIPOS_ACTUALES = [
    "CLASIFICAR","RESPUESTA","CONTEXTO","SETTER","OBJECION","DESCONFIANZA",
    "CAGC_INFERIR","SUGERIR_KB","ANALISIS","VISION","LEADMAGNET","CUALIFICACION",
    "SENALES","PAQUETE_SERVICIO","BRIEF_DISENO","CLUSTERING",
  ];

  const totalesPorTipo = registros.reduce<Record<string, number>>((acc, r) => {
    acc[r.tipo_accion] = (acc[r.tipo_accion] ?? 0) + 1;
    return acc;
  }, {});

  const tokensTotal = registros.reduce((sum, r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return sum + ((m?.tokens_input as number ?? 0) + (m?.tokens_output as number ?? 0));
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Log de acciones IA</h1>
          <p className="text-sm text-muted-foreground">
            {registros.length} registros recientes ·{" "}
            <span className="font-medium">{tokensTotal.toLocaleString("es-MX")} tokens</span> usados en vista
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {Object.entries(totalesPorTipo).map(([t, n]) => (
            <span key={t} className={`rounded px-1.5 py-0.5 border ${TIPO_COLOR[t] ?? "bg-gray-100 text-gray-600"}`}>
              {TIPO_LABEL[t] ?? t} · {n}
            </span>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <a href="/admin/log-ia"
          className={`rounded border px-2 py-1 text-xs ${!tipo ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
          Todos
        </a>
        {TIPOS_ACTUALES.map((t) => (
          <a key={t} href={`/admin/log-ia?tipo=${t}`}
            className={`rounded border px-2 py-1 text-xs ${tipo === t ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            {TIPO_LABEL[t] ?? t}
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
              <th className="p-3 text-left">Modelo</th>
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-left">Resultado</th>
              <th className="p-3 text-right">Tokens</th>
              <th className="p-3 text-right">ms</th>
              <th className="p-3 text-center">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const lead = r.leads as unknown as { nombre: string | null; telefono: string | null } | null;
              const meta = r.metadata as Record<string, unknown> | null;
              const modelo  = meta?.modelo as string | undefined;
              const tIn     = meta?.tokens_input as number | undefined;
              const tOut    = meta?.tokens_output as number | undefined;
              const durMs   = meta?.duracion_ms as number | undefined;

              return (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${TIPO_COLOR[r.tipo_accion] ?? "bg-gray-100 text-gray-600"}`}>
                      {TIPO_LABEL[r.tipo_accion] ?? r.tipo_accion}
                    </span>
                  </td>
                  <td className="p-3">
                    {modelo ? (
                      <span className={`text-[11px] rounded px-1.5 py-0.5 font-medium ${MODELO_COLOR[modelo] ?? "bg-gray-100 text-gray-600"}`}>
                        {MODELO_LABEL[modelo] ?? modelo}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {lead?.nombre ?? lead?.telefono ?? "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-600 max-w-[200px] truncate" title={r.resultado ?? ""}>
                    {r.resultado ?? "—"}
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground">
                    {tIn !== undefined && tOut !== undefined
                      ? <span title={`${tIn} entrada · ${tOut} salida`}>{(tIn + tOut).toLocaleString()}</span>
                      : "—"}
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground">
                    {durMs !== undefined ? `${durMs}` : "—"}
                  </td>
                  <td className="p-3 text-center text-xs text-muted-foreground whitespace-nowrap">
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
