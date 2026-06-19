import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/calendar";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/auth/google/callback — recibe el código de Google y guarda el token
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const vendedorId = req.nextUrl.searchParams.get("state");

  if (!code || !vendedorId) {
    return NextResponse.redirect(new URL("/admin/vendedores?error=oauth_invalid", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const supabase = createServiceClient();

    await supabase.from("vendedor_tokens").upsert({
      vendedor_id: vendedorId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      scope: "calendar",
    }, { onConflict: "vendedor_id" });

    return NextResponse.redirect(new URL("/admin/vendedores?connected=1", req.url));
  } catch (err) {
    console.error("[oauth] Error en callback:", err);
    return NextResponse.redirect(new URL("/admin/vendedores?error=oauth_failed", req.url));
  }
}
