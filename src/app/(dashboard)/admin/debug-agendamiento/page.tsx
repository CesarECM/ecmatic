import { listarLogAgen } from "@/services/log-agendamiento";
import type { NivelLog } from "@/services/log-agendamiento";

export const metadata = { title: "Debug Agendamiento · ECMatic" };
export const revalidate = 0;

const PASO_LABEL: Record<string, string> = {
  slots_consultados:           "Slots consultados",
  token_refresh:               "Token renovado",
  calendar_sync:               "Evento Calendar creado",
  meet_generado:               "Link Meet generado",
  cita_creada:                 "Cita creada en BD",
  estado_confirmado:           "Estado → confirmada",
  notificacion_wa:             "WhatsApp al lead",
  notificacion_email_lead:     "Email al lead",
  notificacion_email_vendedor: "Email al vendedor",
  error:                       "Error",
};

const PASO_EMOJI: Record<string, string> = {
  slots_consultados:           "🗓️",
  token_refresh:               "🔑",
  calendar_sync:               "📆",
  meet_generado:               "🎥",
  cita_creada:                 "✅",
  estado_confirmado:           "🔄",
  notificacion_wa:             "💬",
  notificacion_email_lead:     "📧",
  notificacion_email_vendedor: "📬",
  error:                       "🔴",
};

const NIVEL_ROW: Record<NivelLog, string> = {
  info:  "border-l-2 border-blue-400 bg-white",
  warn:  "border-l-2 border-yellow-400 bg-yellow-50",
  error: "border-l-2 border-red-500 bg-red-50",
};

const NIVEL_BADGE: Record<NivelLog, string> = {
  info:  "bg-blue-100 text-blue-700",
  warn:  "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

const NIVELES: NivelLog[] = ["info", "warn", "error"];

interface Props {
  searchParams: Promise<{ nivel?: string; desde?: string; cita?: string }>;
}

export default async function DebugAgendamientoPage({ searchParams }: Props) {
  const { nivel, desde, cita } = await searchParams;
  const nivelFiltro = (NIVELES.includes(nivel as NivelLog) ? nivel : undefined) as NivelLog | undefined;

  const registros = await listarLogAgen({
    nivel: nivelFiltro,
    desde: desde ?? undefined,
    citaId: cita ?? undefined,
  });

  const conteo = { info: 0, warn: 0, error: 0 };
  for (const r of registros) conteo[(r.nivel ?? "info") as NivelLog]++;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Debug — Agendamiento con Google Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Traza cada paso: consulta de slots → Calendar API → Meet link → notificaciones WA y email.
        </p>
      </div>

      {/* Resumen de conteos */}
      <div className="flex gap-3">
        {NIVELES.map((n) => (
          <div key={n} className={`rounded border px-3 py-2 text-xs font-medium ${NIVEL_BADGE[n]}`}>
            {n}: {conteo[n]}
          </div>
        ))}
        <div className="rounded border px-3 py-2 text-xs font-medium bg-gray-100 text-gray-600">
          total: {registros.length}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded border bg-gray-50 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Filtros:</span>

        <a href="/admin/debug-agendamiento"
          className={`rounded px-2 py-1 text-xs ${!nivelFiltro && !cita ? "bg-gray-900 text-white" : "hover:bg-gray-200"}`}>
          Todos
        </a>
        {NIVELES.map((n) => (
          <a key={n} href={`/admin/debug-agendamiento?nivel=${n}${desde ? `&desde=${desde}` : ""}`}
            className={`rounded px-2 py-1 text-xs capitalize ${nivelFiltro === n ? "bg-gray-900 text-white" : "hover:bg-gray-200"}`}>
            {n}
          </a>
        ))}

        <form method="GET" action="/admin/debug-agendamiento" className="flex items-center gap-2 ml-2">
          {nivelFiltro && <input type="hidden" name="nivel" value={nivelFiltro} />}
          <label className="text-xs text-muted-foreground">Desde:</label>
          <input type="date" name="desde" defaultValue={desde ?? ""}
            className="rounded border bg-white px-2 py-1 text-xs" />
          <button type="submit"
            className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-100">
            Aplicar
          </button>
          {desde && (
            <a href={`/admin/debug-agendamiento${nivelFiltro ? `?nivel=${nivelFiltro}` : ""}`}
              className="text-xs text-muted-foreground hover:underline">
              Quitar fecha
            </a>
          )}
        </form>
      </div>

      {registros.length === 0 && (
        <div className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground">
          Sin registros. Los logs aparecerán aquí cuando se procesen flujos de agendamiento.
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-1.5">
        {registros.map((r) => {
          const lead = r.leads as unknown as { nombre: string | null; telefono: string | null } | null;
          const vendedor = r.vendedores as unknown as { nombre: string } | null;
          const nv = (r.nivel ?? "info") as NivelLog;
          const meta = r.metadata as Record<string, unknown>;
          const tieneMetadata = meta && Object.keys(meta).length > 0;
          const emoji = PASO_EMOJI[r.paso] ?? "•";
          const label = PASO_LABEL[r.paso] ?? r.paso;

          return (
            <div key={r.id} className={`rounded px-4 py-2.5 text-xs ${NIVEL_ROW[nv]}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{emoji}</span>
                  <span className="font-semibold">{label}</span>
                  <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${NIVEL_BADGE[nv]}`}>
                    {nv}
                  </span>
                </div>
                <time className="flex-shrink-0 text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" })}
                </time>
              </div>

              {r.detalle && (
                <p className="mt-1 ml-6 text-gray-600">{r.detalle}</p>
              )}

              <div className="mt-1 ml-6 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                {lead && (
                  <span>Lead: <span className="font-medium text-gray-700">{lead.nombre ?? lead.telefono ?? "—"}</span></span>
                )}
                {vendedor && (
                  <span>Vendedor: <span className="font-medium text-gray-700">{vendedor.nombre}</span></span>
                )}
                {r.cita_id && (
                  <span>
                    Cita:{" "}
                    <a href={`/admin/debug-agendamiento?cita=${r.cita_id}`}
                      className="font-mono text-blue-600 hover:underline">
                      {r.cita_id.slice(0, 8)}…
                    </a>
                  </span>
                )}
              </div>

              {tieneMetadata && (
                <pre className="mt-1.5 ml-6 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[10px] text-gray-500 leading-relaxed">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
