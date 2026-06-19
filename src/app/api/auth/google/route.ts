import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, isConfigured } from "@/lib/google/calendar";

// GET /api/auth/google?vendedor_id=xxx — inicia el flujo OAuth con Google
export async function GET(req: NextRequest) {
  const vendedorId = req.nextUrl.searchParams.get("vendedor_id");
  if (!vendedorId) return NextResponse.json({ error: "vendedor_id requerido" }, { status: 400 });
  if (!isConfigured()) return NextResponse.json({ error: "Google Calendar no configurado" }, { status: 503 });

  const url = getAuthUrl(vendedorId);
  return NextResponse.redirect(url);
}
