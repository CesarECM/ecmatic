import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/supabase/types";

export const metadata = { title: "Dashboard · ECMatic" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const rol = (profile?.rol ?? "vendedor") as Rol;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        Bienvenido{profile?.nombre ? `, ${profile.nombre}` : ""}
      </h1>
      <p className="text-muted-foreground">
        {rol === "admin" && "Panel de administración — ECMatic"}
        {rol === "vendedor" && "Panel de vendedor — ECMatic"}
        {rol === "admin_financiero" && "Panel financiero — ECMatic"}
      </p>
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        Sprint 0 completado · Los módulos se habilitarán con cada sprint
      </div>
    </div>
  );
}
