import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() rota el refresh token cuando expira y escribe las nuevas cookies
  // en supabaseResponse vía setAll(). Cualquier respuesta alternativa (redirect,
  // JSON 401) que devolvamos en su lugar pierde esas cookies — el browser replay-a
  // el token viejo, el refresh falla, y la sesión queda rota hasta limpiar cookies.
  // withRefreshedCookies copia las cookies rotadas a cualquier respuesta que retornemos.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  const { pathname } = request.nextUrl;

  // Si ya está autenticado y va a /login → mandarlo al dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Rutas protegidas — redirigir a /login si no está autenticado
  const protectedPrefixes = ["/dashboard", "/admin", "/vendedor", "/financiero"];
  if (!user && protectedPrefixes.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Excluye archivos estáticos e imágenes; aplica a todo lo demás
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
