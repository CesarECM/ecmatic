import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { indexarLead } from "@/services/leads-search";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/leads/index-embeddings
// Indexa hasta 50 leads sin embedding por llamada. Llamar desde cron o manualmente.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data: leads } = await db
    .from("leads")
    .select("id")
    .is("embedding", null)
    .eq("activo", true)
    .limit(50);

  const ids = (leads ?? []).map((l: { id: string }) => l.id);
  let indexados = 0;
  let errores   = 0;

  for (const id of ids) {
    try {
      await indexarLead(id);
      indexados++;
    } catch {
      errores++;
    }
  }

  void logSistema({
    categoria: "cron",
    tipoAccion: "leads.index-embeddings",
    fase: "ok",
    resultado: `${indexados} indexados, ${errores} errores`,
    metadata: { indexados, errores, total: ids.length },
  });

  return NextResponse.json({ indexados, errores, total: ids.length });
}
