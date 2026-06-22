// S30.5 — Optimización de asignación vendedor-lead (Algoritmo Húngaro)
// Resuelve: dada una lista de leads sin vendedor, ¿qué combinación vendedor-lead
// maximiza la conversión esperada total?
// Complementa (no reemplaza) el sistema de pesos proporcionales de S25.2,
// que opera en tiempo real. Este servicio opera en batch (cron o trigger manual).

import { createServiceClient } from "@/lib/supabase/service";

// ── Algoritmo Húngaro (minimización) — O(n³) ──────────────────────────────
// Adaptado para maximización: costo = 1 - beneficio.

function hungarianAlgorithm(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;
  const size = Math.max(n, m);

  // Padear matriz a cuadrada
  const mat: number[][] = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      i < n && j < m ? costMatrix[i][j] : 0
    )
  );

  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0);  // p[j] = fila asignada a columna j
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Array(size + 1).fill(Infinity);
    const used = new Array(size + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = mat[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minVal[j]) {
            minVal[j] = cur;
            way[j] = j0;
          }
          if (minVal[j] < delta) {
            delta = minVal[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= size; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minVal[j] -= delta;
      }
      j0 = j1!;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= size; j++) {
    if (p[j] > 0 && p[j] <= n && j <= m) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
}

// ── Beneficio esperado de asignar un vendedor a un lead ───────────────────
// Score 0-1: combina métricas históricas del vendedor con el score_salud del lead.
async function calcularBeneficio(
  vendedorId: string,
  leadId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<number> {
  const [vendedorRes, leadRes] = await Promise.all([
    supabase
      .from("vendedores")
      .select("peso")
      .eq("id", vendedorId)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("score_salud, temperamento_inferido")
      .eq("id", leadId)
      .maybeSingle(),
  ]);

  const peso = (vendedorRes.data?.peso ?? 50) / 100;
  const scoreLead = ((leadRes.data?.score_salud ?? 50)) / 100;

  // Tasa de conversión histórica del vendedor (últimos 90 días)
  const hace90 = new Date();
  hace90.setDate(hace90.getDate() - 90);
  const { count: citasTotal } = await supabase
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("vendedor_id", vendedorId)
    .gte("created_at", hace90.toISOString());
  const { count: citasShow } = await supabase
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("vendedor_id", vendedorId)
    .eq("estado", "show")
    .gte("created_at", hace90.toISOString());

  const showRate = (citasTotal ?? 0) > 0 ? (citasShow ?? 0) / (citasTotal ?? 1) : 0.5;

  // Beneficio: combinación ponderada de peso, score del lead y show rate histórico
  return 0.35 * peso + 0.40 * scoreLead + 0.25 * showRate;
}

// ── API pública ────────────────────────────────────────────────────────────

export interface AsignacionOptima {
  leadId: string;
  vendedorId: string;
  beneficioEsperado: number;
}

// S30.5 — Asigna óptimamente vendedores a leads sin vendedor usando el algoritmo Húngaro.
// Devuelve la lista de asignaciones propuestas (no las aplica; el admin las aprueba).
export async function calcularAsignacionOptima(): Promise<AsignacionOptima[]> {
  const supabase = createServiceClient();

  const [{ data: leadsData }, { data: vendedoresData }] = await Promise.all([
    supabase
      .from("leads")
      .select("id")
      .eq("activo", true)
      .is("vendedor_id", null)
      .limit(20), // procesar en lotes para evitar O(n³) descontrolado
    supabase
      .from("vendedores")
      .select("id")
      .eq("activo", true),
  ]);

  const leads = leadsData ?? [];
  const vendedores = vendedoresData ?? [];
  if (!leads.length || !vendedores.length) return [];

  // Construir matriz de beneficio [leads × vendedores]
  const beneficioMatrix: number[][] = await Promise.all(
    leads.map(async (lead) => {
      return Promise.all(
        vendedores.map((v) => calcularBeneficio(v.id, lead.id, supabase))
      );
    })
  );

  // Convertir a matriz de costo para el algoritmo húngaro (1 - beneficio)
  const costoMatrix = beneficioMatrix.map((row) => row.map((b) => 1 - b));

  // Trasponer para que filas = vendedores, columnas = leads
  const costoTranspuesto = vendedores.map((_, vi) =>
    leads.map((_, li) => costoMatrix[li][vi])
  );

  const assignment = hungarianAlgorithm(costoTranspuesto);

  const asignaciones: AsignacionOptima[] = [];
  for (let vi = 0; vi < vendedores.length; vi++) {
    const li = assignment[vi];
    if (li < 0 || li >= leads.length) continue;
    asignaciones.push({
      vendedorId: vendedores[vi].id,
      leadId: leads[li].id,
      beneficioEsperado: beneficioMatrix[li][vi],
    });
  }

  return asignaciones;
}

// S30.5 — Aplica las asignaciones en BD (llamar después de aprobación del admin)
export async function aplicarAsignaciones(asignaciones: AsignacionOptima[]): Promise<void> {
  const supabase = createServiceClient();
  for (const a of asignaciones) {
    await supabase
      .from("leads")
      .update({ vendedor_id: a.vendedorId })
      .eq("id", a.leadId);
  }
}
