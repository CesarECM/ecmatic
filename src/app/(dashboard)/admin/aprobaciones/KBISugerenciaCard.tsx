"use client";

// Fila compacta para kbi_sugerencias pendientes.
// Clic → abre KBISugerenciaModal con el detalle completo.

export interface KBISugerenciaItem {
  id: string;
  recurso_id: string | null;
  tipo_accion: "crear" | "actualizar" | "desactivar";
  tipo_recurso_nuevo: string | null;
  titulo_propuesto: string;
  contenido_propuesto: string;
  razon: string;
  origen: string;
  created_at: string;
}

const ACCION_LABEL: Record<string, string> = {
  crear:      "Crear",
  actualizar: "Actualizar",
  desactivar: "Desactivar",
};

const ACCION_COLOR: Record<string, string> = {
  crear:      "bg-green-100 text-green-700 border-green-200",
  actualizar: "bg-violet-100 text-violet-700 border-violet-200",
  desactivar: "bg-red-100 text-red-700 border-red-200",
};

const ORIGEN_LABEL: Record<string, string> = {
  detector_huecos:    "Hueco",
  detector_patron:    "Patrón GHL",
  detector_confianza: "Baja confianza",
  admin_manual:       "Manual",
};

function diasDesde(f: string) {
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
}

interface Props {
  item: KBISugerenciaItem;
  onClick: () => void;
}

export function KBISugerenciaCard({ item, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-sky-200 bg-sky-50/20 p-3 text-left hover:bg-sky-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-xs rounded border px-1.5 py-0.5 shrink-0 font-medium ${ACCION_COLOR[item.tipo_accion]}`}>
            {ACCION_LABEL[item.tipo_accion]}
          </span>
          <span className="text-xs rounded px-1.5 py-0.5 shrink-0 bg-gray-100 text-gray-600">
            {ORIGEN_LABEL[item.origen] ?? item.origen}
          </span>
          {item.tipo_recurso_nuevo && (
            <span className="text-xs text-muted-foreground shrink-0">
              [{item.tipo_recurso_nuevo}]
            </span>
          )}
          <p className="text-sm font-medium truncate">{item.titulo_propuesto}</p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
          {diasDesde(item.created_at)}d
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.razon}</p>
    </button>
  );
}
