import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const WORKSPACE = "/admin/workspace";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== WORKSPACE) {
    return NextResponse.redirect(new URL(WORKSPACE, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Solo aplica a rutas de dashboard — excluye /api, /login, /, webhooks
  matcher: ["/admin/:path*", "/vendedor/:path*", "/dashboard"],
};
