import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Rol } from "@/lib/supabase/types";

// S10.5 — KPIs en tiempo real
async function obtenerKPIs() {
  const svc = createServiceClient();
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - 7);
  const desde = inicioSemana.toISOString();
  const inicioMes = new Date();
  inicioMes.setDate(1);

  const [
    { count: leadsActivos },
    { count: leadsNuevos },
    { count: ticketsAbiertos },
    { data: pagos },
  ] = await Promise.all([
    svc.from("leads").select("id", { count: "exact", head: true }).eq("activo", true),
    svc.from("leads").select("id", { count: "exact", head: true }).gte("created_at", desde),
    svc.from("tickets").select("id", { count: "exact", head: true }).eq("estado", "abierto"),
    svc.from("pagos").select("monto").eq("estado", "completado").gte("created_at", inicioMes.toISOString()),
  ]);

  const ingresosMes = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  return { leadsActivos: leadsActivos ?? 0, leadsNuevos: leadsNuevos ?? 0, ticketsAbiertos: ticketsAbiertos ?? 0, ingresosMes };
}

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
  {
    href: "/admin/gatillos",
    titulo: "Gatillos mentales",
    descripcion: "Escasez, urgencia y precio activos. La IA los inyecta en WhatsApp y email automáticamente.",
    emoji: "⚡",
    roles: ["admin"],
    sprint: "S6",
  },
  {
    href: "/admin/citas",
    titulo: "Citas agendadas",
    descripcion: "Todas las citas del equipo. Google Calendar y Meet integrados.",
    emoji: "📅",
    roles: ["admin"],
    sprint: "S7",
  },
  {
    href: "/admin/vendedores",
    titulo: "Vendedores",
    descripcion: "Métricas de desempeño, show rate, coaching IA y alertas de anomalías.",
    emoji: "🏆",
    roles: ["admin"],
    sprint: "S7",
  },
  {
    href: "/vendedor/agenda",
    titulo: "Mi agenda",
    descripcion: "Próximas citas, links de Meet y fichas post-sesión.",
    emoji: "🗓️",
    roles: ["vendedor"],
    sprint: "S7",
  },
  {
    href: "/admin/sistema",
    titulo: "Estado del sistema",
    descripcion: "Panel LED de salud de todas las integraciones. Polling cada 60 segundos.",
    emoji: "🔌",
    roles: ["admin"],
    sprint: "S10",
  },
  {
    href: "/admin/aprobaciones",
    titulo: "Cola de aprobaciones",
    descripcion: "Sugerencias IA pendientes: KB, Matriz nD y pipeline. Con prioridad visual.",
    emoji: "✅",
    roles: ["admin"],
    sprint: "S10",
  },
  {
    href: "/admin/log-ia",
    titulo: "Log de IA",
    descripcion: "Registro consultable de todas las acciones tomadas por la IA.",
    emoji: "📋",
    roles: ["admin"],
    sprint: "S10",
  },
  {
    href: "/admin/postventa",
    titulo: "Post-Venta",
    descripcion: "SmartBuilderEC, progreso de candidatos, churn, encuestas y referidos.",
    emoji: "🎓",
    roles: ["admin"],
    sprint: "S9",
  },
  {
    href: "/admin/financiero",
    titulo: "Panel financiero",
    descripcion: "Ingresos del mes, comisiones por vendedor y gasto en APIs de IA.",
    emoji: "💰",
    roles: ["admin", "admin_financiero"],
    sprint: "S8",
  },
  {
    href: "/vendedor/comisiones",
    titulo: "Mis comisiones",
    descripcion: "Saldo pendiente y comisiones cobradas.",
    emoji: "💵",
    roles: ["vendedor"],
    sprint: "S8",
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
  const kpis = rol === "admin" || rol === "admin_financiero" ? await obtenerKPIs() : null;
  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Bienvenido{profile?.nombre ? `, ${profile.nombre}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          CRM con IA para Centro ECM · Sprints 0–10 activos
        </p>
      </div>

      {/* S10.5 — KPIs en tiempo real */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Leads activos", value: kpis.leadsActivos },
            { label: "Nuevos esta semana", value: kpis.leadsNuevos },
            { label: "Tickets abiertos", value: kpis.ticketsAbiertos },
            { label: "Ingresos del mes", value: fmt(kpis.ingresosMes) },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border bg-card p-4 text-center">
              <p className="text-xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      )}

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
