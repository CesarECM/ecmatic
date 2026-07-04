import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  auditarEntregasBatch,
  repararEntregasFallidas,
} from "@/services/ghl-auditoria-entregas";

const SINCE_DEFAULT = "2026-06-28T00:00:00Z"; // inicio de campaña sbc_jun26
const PAGE_SIZE_MAX  = 30;

async function verificarAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token    = authHeader.slice(7);
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

// GET — auditar batch de entregas
// ?since=2026-07-03T23:00:00Z&page=1&pageSize=25
export async function GET(request: NextRequest) {
  if (!(await verificarAdmin(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params   = request.nextUrl.searchParams;
  const since    = params.get("since") ?? SINCE_DEFAULT;
  const page     = Math.max(1, parseInt(params.get("page")     ?? "1", 10));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(params.get("pageSize") ?? "25", 10)));

  try {
    const resultado = await auditarEntregasBatch(since, page, pageSize);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 },
    );
  }
}

// POST — reparar entregas fallidas
// { contact_ids: string[], dry_run?: boolean }
export async function POST(request: NextRequest) {
  if (!(await verificarAdmin(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { contact_ids?: string[]; dry_run?: boolean } = {};
  try { body = await request.json(); } catch { /* body vacío */ }

  const contactIds = Array.isArray(body.contact_ids) ? body.contact_ids : [];
  if (!contactIds.length) {
    return NextResponse.json({ ok: false, error: "contact_ids requerido" }, { status: 400 });
  }
  if (contactIds.length > 100) {
    return NextResponse.json({ ok: false, error: "Máximo 100 IDs por llamada" }, { status: 400 });
  }

  try {
    const resultado = await repararEntregasFallidas(contactIds, body.dry_run ?? false);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
