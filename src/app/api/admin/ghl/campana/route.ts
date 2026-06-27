import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { procesarLoteCampana } from "@/services/ghl-pipeline-campana";
import { obtenerStatsAB } from "@/services/ab-workflows-ghl";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

async function verificarAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token   = authHeader.slice(7);
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.rol === "admin";
}

// GET — estadísticas de la campaña activa
export async function GET(request: NextRequest) {
  if (!(await verificarAdmin(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const campana = request.nextUrl.searchParams.get("campana") ?? CAMPANA_ACTIVA;
  const stats   = await obtenerStatsAB(campana);

  const supabase = createServiceClient();
  const { data: recientes } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("ghl_contact_id, nombre, categoria_sbc, variante, enviado, enviado_at, respuesta_tipo, convirtio, error_msg")
    .eq("campana", campana)
    .order("updated_at", { ascending: false })
    .limit(50) as { data: unknown[] | null };

  return NextResponse.json({ stats, recientes: recientes ?? [] });
}

// POST — procesar un lote de contactos
export async function POST(request: NextRequest) {
  if (!(await verificarAdmin(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { page?: number; pageLimit?: number } = {};
  try { body = await request.json(); } catch { /* body vacío = valores default */ }

  const page      = Math.max(1, body.page ?? 1);
  const pageLimit = Math.min(50, Math.max(1, body.pageLimit ?? 20));

  try {
    const resultado = await procesarLoteCampana(page, pageLimit);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
