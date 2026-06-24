import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SideNav } from "./components/SideNav";
import type { Rol } from "@/lib/supabase/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  console.log("[LAYOUT] Iniciando render del layout");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    console.log("[LAYOUT] createClient OK");
  } catch (e) {
    console.error("[LAYOUT] ERROR en createClient:", e);
    throw e;
  }

  let user: { id: string; email?: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    console.log("[LAYOUT] getUser OK — user:", user?.id ?? "null", "error:", error?.message ?? "none");
  } catch (e) {
    console.error("[LAYOUT] ERROR en getUser:", e);
    throw e;
  }

  if (!user) {
    console.log("[LAYOUT] Sin usuario — redirigiendo a /login");
    redirect("/login");
  }

  let profile: Record<string, unknown> | null = null;
  try {
    const { data, error } = await createServiceClient()
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
    console.log("[LAYOUT] getProfile OK — rol:", (data as any)?.rol ?? "null", "error:", error?.message ?? "none");
  } catch (e) {
    console.error("[LAYOUT] ERROR en getProfile:", e);
    throw e;
  }

  if (!profile) {
    console.log("[LAYOUT] Sin perfil — redirigiendo a /login");
    redirect("/login?error=Perfil%20no%20encontrado%20—%20contacta%20al%20administrador");
  }

  const rol = (profile as any).rol as Rol;

  // Si es admin, verificar si también tiene registro como vendedor (para mostrar Mi agenda)
  let esVendedor = false;
  if (rol === "admin") {
    const { data: vendedor } = await createServiceClient()
      .from("vendedores").select("id").eq("profile_id", user.id).maybeSingle();
    esVendedor = !!vendedor;
    console.log("[LAYOUT] esVendedor:", esVendedor);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between shrink-0">
        <span className="font-bold text-lg pl-8 md:pl-0">ECMatic</span>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{(profile as any).nombre ?? user.email}</span>
          <RolBadge rol={rol} />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <SideNav rol={rol} esVendedor={esVendedor} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function RolBadge({ rol }: { rol: Rol }) {
  const labels: Record<Rol, string> = {
    admin: "Admin",
    vendedor: "Vendedor",
    admin_financiero: "Finanzas",
  };
  return (
    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {labels[rol]}
    </span>
  );
}
