import { createServiceClient } from "@/lib/supabase/service";

export interface FaseInfo {
  numero: number;
  nombre: string;
}

export interface CeldaMatriz {
  faseNumero: number;
  leadCount: number;
  cubiertaPorPipeline: boolean; // ¿algún pipeline cubre esta fase para este servicio?
  pipelines: string[];          // rutas que la cubren
}

export interface FilaServicio {
  id: string;
  titulo: string;
  ruta: "tripwire" | "premium" | null; // inferida del precio
  celdas: CeldaMatriz[];               // índice 0-16 = fase 0-16
}

export interface MatrizCAGCGlobal {
  fases: FaseInfo[];
  servicios: FilaServicio[];
}

// S29.1/S29.2/S29.4 — Construye la matriz completa:
// filas = servicios del catálogo, columnas = 17 fases CAGC.
// Cada celda lleva el conteo de leads activos y si algún pipeline la cubre.
export async function construirMatrizCAGC(): Promise<MatrizCAGCGlobal> {
  const supabase = createServiceClient();

  // 1. Fases CAGC (columnas)
  const { data: fasesData } = await supabase
    .from("cagc_fases")
    .select("numero, nombre")
    .order("numero");
  const fases: FaseInfo[] = (fasesData ?? []).map((f) => ({
    numero: f.numero,
    nombre: f.nombre,
  }));
  // Asegurar 0-16 aunque falten registros en la tabla
  const fasesCompletas: FaseInfo[] = Array.from({ length: 17 }, (_, i) => ({
    numero: i,
    nombre: fases.find((f) => f.numero === i)?.nombre ?? `Fase ${i}`,
  }));

  // 2. Servicios del catálogo (filas)
  const { data: serviciosData } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, precio_centavos")
    .eq("tipo", "servicio")
    .eq("activo", true)
    .eq("aprobado", true)
    .order("titulo");

  const servicios = (serviciosData ?? []) as {
    id: string; titulo: string; precio_centavos: number | null;
  }[];

  // 3. Cobertura de pipelines por fase: para cada ruta, qué fases CAGC cubre
  const { data: etapasData } = await supabase
    .from("pipeline_etapas")
    .select("ruta, fases_cagc")
    .eq("activo", true);

  const coberturaPorRuta: Record<string, Set<number>> = { tripwire: new Set(), premium: new Set() };
  for (const etapa of (etapasData ?? [])) {
    const fasesCagc = (etapa.fases_cagc as number[]) ?? [];
    for (const fase of fasesCagc) {
      coberturaPorRuta[etapa.ruta]?.add(fase);
    }
  }

  // 4. Conteo de leads activos por (ruta, fase_numero) — dos queries separadas
  const { data: leadsActivos } = await supabase
    .from("leads")
    .select("id, pipeline_ruta")
    .eq("activo", true);

  const rutaPorLead: Record<string, string> = {};
  for (const l of (leadsActivos ?? [])) {
    rutaPorLead[l.id] = l.pipeline_ruta;
  }

  const { data: fasesLeads } = await supabase
    .from("lead_cagc_estado")
    .select("lead_id, fase_numero");

  const conteoMap: Record<string, number> = {};
  for (const row of (fasesLeads ?? [])) {
    const ruta = rutaPorLead[row.lead_id];
    if (!ruta) continue;
    const key = `${ruta}-${row.fase_numero}`;
    conteoMap[key] = (conteoMap[key] ?? 0) + 1;
  }

  // 5. Construir filas
  const filasServicios: FilaServicio[] = servicios.map((svc) => {
    const ruta: "tripwire" | "premium" | null =
      svc.precio_centavos == null
        ? null
        : svc.precio_centavos < 200_000
        ? "tripwire"
        : "premium";

    const celdas: CeldaMatriz[] = fasesCompletas.map((fase) => {
      const pipelines: string[] = [];
      for (const [r, fases] of Object.entries(coberturaPorRuta)) {
        // Si el servicio no tiene ruta definida, comparar con todas
        if ((ruta == null || ruta === r) && fases.has(fase.numero)) {
          pipelines.push(r);
        }
      }

      const leadCount =
        ruta != null ? (conteoMap[`${ruta}-${fase.numero}`] ?? 0) : 0;

      return {
        faseNumero: fase.numero,
        leadCount,
        cubiertaPorPipeline: pipelines.length > 0,
        pipelines,
      };
    });

    return { id: svc.id, titulo: svc.titulo, ruta, celdas };
  });

  // Si no hay servicios aún, añadir una fila por ruta para que la matriz no quede vacía
  if (filasServicios.length === 0) {
    for (const ruta of ["tripwire", "premium"] as const) {
      const celdas: CeldaMatriz[] = fasesCompletas.map((fase) => ({
        faseNumero: fase.numero,
        leadCount: conteoMap[`${ruta}-${fase.numero}`] ?? 0,
        cubiertaPorPipeline: coberturaPorRuta[ruta].has(fase.numero),
        pipelines: coberturaPorRuta[ruta].has(fase.numero) ? [ruta] : [],
      }));
      filasServicios.push({ id: ruta, titulo: `Pipeline ${ruta}`, ruta, celdas });
    }
  }

  return { fases: fasesCompletas, servicios: filasServicios };
}

// S29.2 — Conteo de leads en una celda específica (para refrescos puntuales)
export async function contarLeadsPorCelda(
  ruta: "tripwire" | "premium",
  faseNumero: number
): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("lead_cagc_estado")
    .select("lead_id", { count: "exact", head: true })
    .eq("fase_numero", faseNumero)
    .in(
      "lead_id",
      await supabase
        .from("lead_pipelines")
        .select("lead_id")
        .eq("ruta", ruta)
        .eq("activo", true)
        .then((r) => (r.data ?? []).map((x) => x.lead_id))
    );
  return count ?? 0;
}
