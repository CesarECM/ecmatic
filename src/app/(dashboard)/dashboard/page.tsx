import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Rol } from "@/lib/supabase/types";

export const metadata = { title: "Dashboard · ECMatic" };

interface Modulo {
  href: string;
  titulo: string;
  descripcion: string;
  emoji: string;
  roles: Rol[];
  sprint: string;
}

const MODULOS: Modulo[] = [
  {
    href: "/admin/leads",
    titulo: "Leads & Pipeline",
    descripcion: "Kanban por etapa, perfil de lead, historial y asignación de vendedores.",
    emoji: "👥",
    roles: ["admin", "vendedor"],
    sprint: "S3",
  },
  {
    href: "/admin/tickets",
    titulo: "Tickets de handoff",
    descripcion: "Conversaciones que requieren atención humana. Responde directo por WhatsApp.",
    emoji: "🎫",
    roles: ["admin", "vendedor"],
    sprint: "S1",
  },
  {
    href: "/admin/conocimiento",
    titulo: "Base de conocimiento",
    descripcion: "FAQs, objeciones, servicios y templates. La IA sugiere y tú apruebas.",
    emoji: "📚",
    roles: ["admin"],
    sprint: "S2",
  },
  {
    href: "/admin/nurturing",
    titulo: "Nurturing automático",
    descripcion: "Secuencias de re-engagement por WhatsApp y email. Pausa por lead.",
    emoji: "📧",
    roles: ["admin"],
    sprint: "S4",
  },
  {
    href: "/admin/matriz",
    titulo: "Matriz nD",
    descripcion: "Respuestas personalizadas por temperamento, objeción, canal y temperatura.",
    emoji: "🧮",
    roles: ["admin"],
    sprint: "S5",
  },
  {
    href: "/admin/momentos",
    titulo: "Momentos de cierre",
    descripcion: "Biblioteca de momentos donde se pudo cerrar la venta. Filtrable por objeción.",
    emoji: "⏱️",
    roles: ["admin"],
    sprint: "S5",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user!.id)
    .single();

  const rol = (profile?.rol ?? "vendedor") as Rol;
  const modulos = MODULOS.filter((m) => m.roles.includes(rol));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Bienvenido{profile?.nombre ? `, ${profile.nombre}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          CRM con IA para Centro ECM · Sprints 0–5 activos
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-lg border bg-card p-5 hover:border-primary hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {m.sprint}
              </span>
            </div>
            <h2 className="font-semibold group-hover:text-primary transition-colors">
              {m.titulo}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{m.descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
