// S150.4 — KBX cron diario: detecta obsoletos y duplicados semánticos en v2_kb_items.
// Corre a las 04:00 UTC (1h después de kb-decay) para que los items decayidos a 0 ya estén marcados.
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const CRON_SECRET      = process.env.CRON_SECRET;
const SIMILITUD_UMBRAL = 0.90;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient() as any;

  // IDs ya en cola pendiente — evita insertar duplicados
  const { data: pendientes } = await db
    .from("v2_kbx_review_queue")
    .select("kb_item_ids")
    .eq("estado", "pendiente");

  const idsEnCola = new Set<string>(
    (pendientes ?? []).flatMap((r: { kb_item_ids: string[] }) => r.kb_item_ids),
  );

  const insertadas: string[] = [];

  // ── Detección 1: Obsoletos (score_confianza = 0, estado aprobado) ─────────
  const { data: obsoletos } = await db
    .from("v2_kb_items")
    .select("id")
    .eq("estado", "aprobado")
    .eq("score_confianza", 0);

  for (const item of (obsoletos ?? []) as { id: string }[]) {
    if (idsEnCola.has(item.id)) continue;
    const { error } = await db.from("v2_kbx_review_queue").insert({
      kb_item_ids:     [item.id],
      accion_sugerida: "eliminar",
      razon:           "Score de confianza decayó a 0 sin validación humana reciente.",
    });
    if (!error) {
      insertadas.push(`eliminar:${item.id}`);
      idsEnCola.add(item.id);
    }
  }

  // ── Detección 2: Duplicados semánticos (cosine similarity > 0.90) ─────────
  const { data: pares, error: paresErr } = await db.rpc("v2_kb_duplicados", {
    umbral: SIMILITUD_UMBRAL,
  });

  if (!paresErr) {
    for (const par of (pares ?? []) as { id_a: string; id_b: string; similitud: number }[]) {
      if (idsEnCola.has(par.id_a) || idsEnCola.has(par.id_b)) continue;
      const pct = Math.round(par.similitud * 100);
      const { error } = await db.from("v2_kbx_review_queue").insert({
        kb_item_ids:     [par.id_a, par.id_b],
        accion_sugerida: "unir",
        razon:           `Similitud semántica del ${pct}% — posible duplicado.`,
      });
      if (!error) {
        insertadas.push(`unir:${par.id_a}+${par.id_b}`);
        idsEnCola.add(par.id_a);
        idsEnCola.add(par.id_b);
      }
    }
  }

  return NextResponse.json({ insertadas: insertadas.length, detalle: insertadas });
}
