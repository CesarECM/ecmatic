"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/supabase/types";

interface NavItem {
  href: string;
  label: string;
  emoji: string;
  roles: Rol[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",             label: "Inicio",             emoji: "🏠", roles: ["admin", "vendedor", "admin_financiero"] },
  { href: "/admin/leads",           label: "Leads & Pipeline",   emoji: "👥", roles: ["admin", "vendedor"] },
  { href: "/admin/tickets",         label: "Tickets",            emoji: "🎫", roles: ["admin", "vendedor"] },
  { href: "/admin/conocimiento",    label: "Base de conocimiento",emoji: "📚", roles: ["admin"] },
  { href: "/admin/nurturing",       label: "Nurturing",          emoji: "📧", roles: ["admin"] },
  { href: "/admin/matriz",          label: "Matriz nD",          emoji: "🧮", roles: ["admin"] },
  { href: "/admin/momentos",        label: "Momentos de cierre", emoji: "⏱️", roles: ["admin"] },
  { href: "/admin/gatillos",        label: "Gatillos mentales",  emoji: "⚡", roles: ["admin"] },
  { href: "/admin/citas",           label: "Citas",              emoji: "📅", roles: ["admin"] },
  { href: "/admin/vendedores",      label: "Vendedores",         emoji: "🏆", roles: ["admin"] },
  { href: "/vendedor/agenda",       label: "Mi agenda",          emoji: "🗓️", roles: ["vendedor"] },
];

interface SideNavProps {
  rol: Rol;
}

export function SideNav({ rol }: SideNavProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(rol));

  return (
    <nav className="w-52 shrink-0 border-r bg-card min-h-full">
      <ul className="flex flex-col gap-0.5 p-3">
        {items.map((item) => {
          const activo = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  activo
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
