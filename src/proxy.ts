import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_PATHS = ["/login", "/api/whatsapp/webhook", "/api/stripe/webhook", "/api/admin/", "/api/auth/google", "/api/ghl/"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // updateSession refresca el token y escribe las nuevas cookies en `response`.
  // Cualquier redirect que creemos después debe heredar esas cookies —
  // de lo contrario el token rotado se pierde y la sesión queda rota.
  const response = await updateSession(request);

  const withRefreshedCookies = <T extends NextResponse>(redirect: T): T => {
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return withRefreshedCookies(NextResponse.redirect(loginUrl));
  }

  if (user && pathname === "/login") {
    return withRefreshedCookies(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
