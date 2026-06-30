"use client";

// Fila compacta para sugerencias kb_calidad en /admin/aprobaciones.
// Al hacer clic abre SugerenciaKBFichaModal con el detalle completo.

import type { SugerenciaItem } from "./ColaSugerenciasSeccion";

export interface RecursoKBResumen {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
}

export interface MetaKB {
  source?: string;
  recurso_id?: string;
  recurso_ids?: string[];
  id_a?: string;
  id_b?: string;
  categoria_suciedad?: string;
  que_cambiar?: string;
  mensaje_ia?: string;
  razon_edicion?: string;
}

export type TipoAccionKB = "nueva_faq" | "actualizar_faq" | "unir_faqs" | "eliminar_faq";

export const TIPO_LABEL: Record<TipoAccionKB, string> = {
  nueva_faq:      "Nueva FAQ",
  actualizar_faq: "Actualizar FAQ",
  unir_faqs:      "Unir FAQs",
  eliminar_faq:   "Eliminar FAQ",
};

export const TIPO_COLOR: Record<TipoAccionKB, string> = {
  nueva_faq:      "bg-green-100 text-green-700 border-green-200",
  actualizar_faq: "bg-violet-100 text-violet-700 border-violet-200",
  unir_faqs:      "bg-amber-100 text-amber-700 border-amber-200",
  eliminar_faq:   "bg-red-100 text-red-700 border-red-200",
};

export function clasificarAccionKB(meta: MetaKB): TipoAccionKB {
  if (meta.categoria_suciedad === "Huérfano de cobertura") return "nueva_faq";
  if (meta.categoria_suciedad === "Duplicado semántico")   return "unir_faqs";
  return "actualizar_faq";
}

const PRIORIDAD_STYLE: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-200 text-gray-700",
};

function diasDesde(f: string) {
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
}

interface Props {
  item: SugerenciaItem;
  onClick: () => void;
}

export function SugerenciaKBCard({ item, onClick }: Props) {
  const meta = item.metadata as MetaKB;
  const tipo = clasificarAccionKB(meta);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-green-200 bg-green-50/20 p-3 text-left hover:bg-green-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-xs rounded border px-1.5 py-0.5 shrink-0 font-medium ${TIPO_COLOR[tipo]}`}>
            {TIPO_LABEL[tipo]}
          </span>
          <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${PRIORIDAD_STYLE[item.prioridad] ?? PRIORIDAD_STYLE.puede_esperar}`}>
            {item.prioridad.replace("_", " ")}
          </span>
          <p className="text-sm font-medium truncate">{item.titulo}</p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
          {diasDesde(item.created_at)}d
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </div>
      {item.descripcion && (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.descripcion}</p>
      )}
    </button>
  );
}
