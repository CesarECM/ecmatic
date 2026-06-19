import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Rol } from "@/lib/supabase/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Service client para evitar bloqueos de RLS en la lectura del propio perfil
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login?error=Perfil%20no%20encontrado%20—%20contacta%20al%20administrador");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">ECMatic</span>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{profile.nombre ?? user.email}</span>
          <RolBadge rol={profile.rol as Rol} />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
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
