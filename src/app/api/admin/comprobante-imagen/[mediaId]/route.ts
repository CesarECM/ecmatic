import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const BASE_URL = "https://graph.facebook.com/v20.0";

// GET /api/admin/comprobante-imagen/[mediaId]
// Re-descarga la URL temporal de Meta y redirige a ella.
// Solo accesible para admins autenticados.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("rol").eq("id", user.id).single();
  if (profile?.rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { mediaId } = await params;

  const metaRes = await fetch(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!metaRes.ok) {
    return NextResponse.json({ error: "No se pudo obtener la imagen" }, { status: 502 });
  }

  const { url } = (await metaRes.json()) as { url: string };
  return NextResponse.redirect(url);
}
