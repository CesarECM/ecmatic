import type { Toque } from "@/services/protocolos-seguimiento";

const CANAL_ICON: Record<string, string> = {
  whatsapp: "💬",
  llamada:  "📞",
  email:    "✉️",
};

const CANAL_COLOR: Record<string, string> = {
  whatsapp: "bg-green-100 border-green-300 text-green-800",
  llamada:  "bg-blue-100 border-blue-300 text-blue-800",
  email:    "bg-orange-100 border-orange-300 text-orange-800",
};

interface Props {
  toques: Toque[];
  diasDuracion: number;
}

export function ProtocoloTimeline({ toques, diasDuracion }: Props) {
  if (!toques.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Agrega toques para ver la línea de tiempo.
      </p>
    );
  }

  const sorted = [...toques].sort((a, b) => a.orden - b.orden);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start gap-0 min-w-max">
        {sorted.map((toque, i) => (
          <div key={toque.id} className="flex items-start">
            {/* Toque node */}
            <div className="flex flex-col items-center gap-1 w-32">
              <div className={`rounded-lg border px-2 py-1.5 text-center text-xs w-full ${CANAL_COLOR[toque.canal] ?? "bg-gray-100 border-gray-300 text-gray-800"}`}>
                <div className="text-base">{CANAL_ICON[toque.canal] ?? "•"}</div>
                <div className="font-semibold leading-tight mt-0.5">Día {toque.dia_offset + 1}</div>
                <div className="text-[10px] leading-tight mt-0.5 opacity-80">{toque.canal}</div>
                {toque.ventana_hora_inicio && (
                  <div className="text-[10px] opacity-60">{toque.ventana_hora_inicio.slice(0, 5)}</div>
                )}
              </div>
              <p className="text-[10px] text-center text-muted-foreground leading-tight px-1 max-w-full truncate" title={toque.nombre}>
                {toque.nombre}
              </p>
            </div>

            {/* Conector */}
            {i < sorted.length - 1 && (
              <div className="flex items-center self-start mt-5">
                <div className="h-px w-4 bg-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground px-1 whitespace-nowrap">
                  +{sorted[i + 1].dia_offset - toque.dia_offset}d
                </span>
                <div className="h-px w-4 bg-muted-foreground/30" />
              </div>
            )}
          </div>
        ))}

        {/* Fin del protocolo */}
        <div className="flex flex-col items-center gap-1 w-20 self-start">
          <div className="rounded-lg border border-dashed border-muted-foreground/40 px-2 py-1.5 text-center text-xs w-full bg-muted/30">
            <div className="text-base">🏁</div>
            <div className="font-semibold leading-tight mt-0.5">Día {diasDuracion}</div>
            <div className="text-[10px] opacity-60">fin</div>
          </div>
        </div>
      </div>
    </div>
  );
}
