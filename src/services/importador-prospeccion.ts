// S22.6 + S22.7 — Importa leads desde CSV, valida contra blacklist,
// asigna etiqueta "Lista propia" y tarea de seguimiento.
import { createServiceClient } from "@/lib/supabase/service";
import { verificarBlacklist } from "@/services/limpieza-leads";
import { asignarTarea } from "@/services/tareas";
import { asignarEtiqueta } from "@/services/etiquetas";

export interface FilaCSV {
  telefono: string;
  nombre?: string;
  email?: string;
}

export interface LeadImportado {
  leadId: string;
  telefono: string;
  nombre: string | null;
}

export interface ResultadoImport {
  importados: LeadImportado[];
  omitidosBlacklist: number;
  omitidosDuplicados: number;
  omitidosInvalidos: number;
}

function normalizarTelefono(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 ? digits : null;
}

// Obtiene o crea el ID de la etiqueta "Lista propia" en categoría "Origen"
async function obtenerEtiquetaListaPropia(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: cat } = await supabase
    .from("etiqueta_categorias").select("id").eq("nombre", "Origen").maybeSingle();
  if (!cat) return null;

  const { data: existente } = await supabase
    .from("etiquetas").select("id")
    .eq("categoria_id", cat.id).eq("nombre", "Lista propia").eq("estado", "activa").maybeSingle();
  if (existente) return existente.id;

  const { data: nueva } = await supabase
    .from("etiquetas")
    .insert({ categoria_id: cat.id, nombre: "Lista propia", origen: "automatico", estado: "activa" })
    .select("id").single();
  return nueva?.id ?? null;
}

export async function importarCSV(filas: FilaCSV[]): Promise<ResultadoImport> {
  const supabase = createServiceClient();
  const resultado: ResultadoImport = { importados: [], omitidosBlacklist: 0, omitidosDuplicados: 0, omitidosInvalidos: 0 };
  const telefonosVistos = new Set<string>();
  const etiquetaId = await obtenerEtiquetaListaPropia();

  for (const fila of filas) {
    const telefono = normalizarTelefono(fila.telefono);
    if (!telefono) { resultado.omitidosInvalidos++; continue; }
    if (telefonosVistos.has(telefono)) { resultado.omitidosDuplicados++; continue; }
    telefonosVistos.add(telefono);

    const enBlacklist = await verificarBlacklist(telefono, fila.email ?? null);
    if (enBlacklist) { resultado.omitidosBlacklist++; continue; }

    // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (supabase as any)
      .from("leads")
      .upsert(
        { telefono, nombre: fila.nombre?.trim() || null, email: fila.email?.trim() || null, canal_origen: "prospeccion_lista_propia", privacidad_aceptada: false },
        { onConflict: "telefono" }
      )
      .select("id, nombre").single();

    if (!lead) continue;

    await Promise.all([
      asignarTarea(lead.id, "seguimiento", "Importado desde lista propia"),
      etiquetaId ? asignarEtiqueta(lead.id, etiquetaId, "automatico") : Promise.resolve(),
    ]);

    resultado.importados.push({ leadId: lead.id, telefono, nombre: lead.nombre });
  }

  return resultado;
}
