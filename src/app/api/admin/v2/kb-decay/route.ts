// S150.3 — Decaimiento KB: −2 pts en score_confianza cada 7 días sin validación humana.
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient() as any;
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Items aprobados con score > 0 y sin validación humana en 7+ días
  const { data, error } = await db
    .from("v2_kb_items")
    .select("id, score_confianza, metadata")
    .eq("estado", "aprobado")
    .gt("score_confianza", 0)
    .lt("ultima_validacion", hace7dias);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidatos = (data ?? []) as {
    id: string;
    score_confianza: number;
    metadata: Record<string, unknown>;
  }[];

  // Filtrar los que ya tuvieron decay esta semana (evita doble descuento)
  const pendientes = candidatos.filter((item) => {
    const ultimo = item.metadata?.ultimo_decay_at as string | undefined;
    return !ultimo || ultimo < hace7dias;
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ decayed: 0, skipped: candidatos.length });
  }

  const ahora = new Date().toISOString();
  let decayed = 0;

  for (const item of pendientes) {
    const nuevoScore = Math.max(0, item.score_confianza - 2);
    const { error: updErr } = await db.from("v2_kb_items").update({
      score_confianza: nuevoScore,
      updated_at:      ahora,
      metadata: { ...item.metadata, ultimo_decay_at: ahora },
    }).eq("id", item.id);
    if (!updErr) decayed++;
  }

  return NextResponse.json({ decayed, total_candidatos: candidatos.length });
}
