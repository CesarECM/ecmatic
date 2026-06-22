"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/supabase/types";

interface NavItem { href: string; label: string; emoji: string; roles: Rol[] }
interface NavSection { id: string; label: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    id: "principal",
    label: "Principal",
    items: [
      { href: "/dashboard",           label: "Inicio",              emoji: "🏠", roles: ["admin", "vendedor", "admin_financiero"] },
      { href: "/admin/leads",         label: "Leads & Pipeline",    emoji: "👥", roles: ["admin", "vendedor"] },
      { href: "/admin/tickets",       label: "Tickets",             emoji: "🎫", roles: ["admin", "vendedor"] },
      { href: "/admin/citas",         label: "Citas",               emoji: "📅", roles: ["admin"] },
      { href: "/admin/prospeccion",   label: "Prospección",         emoji: "📋", roles: ["admin"] },
      { href: "/vendedor/agenda",     label: "Mi agenda",           emoji: "🗓️", roles: ["vendedor"] },
      { href: "/vendedor/llamadas",   label: "Mis llamadas",        emoji: "📞", roles: ["vendedor"] },
      { href: "/vendedor/comisiones", label: "Mis comisiones",      emoji: "💵", roles: ["vendedor"] },
    ],
  },
  {
    id: "conocimiento",
    label: "Conocimiento",
    items: [
      { href: "/admin/servicios",     label: "Servicios",           emoji: "🛍️", roles: ["admin"] },
      { href: "/admin/conocimiento",  label: "Base de conocimiento",emoji: "📚", roles: ["admin"] },
      { href: "/admin/nurturing",     label: "Nurturing",           emoji: "📧", roles: ["admin"] },
      { href: "/admin/matriz",        label: "Matriz nD",           emoji: "🧮", roles: ["admin"] },
      { href: "/admin/gatillos",      label: "Gatillos mentales",   emoji: "⚡", roles: ["admin"] },
      { href: "/admin/momentos",      label: "Momentos de cierre",  emoji: "⏱️", roles: ["admin"] },
      { href: "/admin/etiquetas",     label: "Etiquetas",           emoji: "🏷️", roles: ["admin"] },
      { href: "/admin/cagc",              label: "Auditoría CAGC",      emoji: "🧭", roles: ["admin"] },
      { href: "/admin/matriz-cagc-global",label: "Matriz Global CAGC",  emoji: "🗺️", roles: ["admin"] },
    ],
  },
  {
    id: "operaciones",
    label: "Operaciones",
    items: [
      { href: "/admin/aprobaciones",  label: "Aprobaciones",        emoji: "✅", roles: ["admin"] },
      { href: "/admin/postventa",     label: "Post-Venta",          emoji: "🎓", roles: ["admin"] },
      { href: "/admin/vendedores",    label: "Vendedores",          emoji: "🏆", roles: ["admin"] },
      { href: "/admin/marca",         label: "Identidad de marca",  emoji: "🎨", roles: ["admin"] },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { href: "/admin/analitica",     label: "Analítica",           emoji: "📊", roles: ["admin"] },
      { href: "/admin/financiero",    label: "Financiero",          emoji: "💰", roles: ["admin", "admin_financiero"] },
      { href: "/admin/log-ia",                label: "Log IA",              emoji: "📋", roles: ["admin"] },
      { href: "/admin/debug-agendamiento",    label: "Debug Agendamiento",  emoji: "🗓️", roles: ["admin"] },
      { href: "/admin/auditoria-integridad", label: "Integridad",          emoji: "🔍", roles: ["admin"] },
      { href: "/admin/sistema",             label: "Estado sistema",      emoji: "🔌", roles: ["admin"] },
      { href: "/admin/sandbox",       label: "Widget de Pruebas",   emoji: "🧪", roles: ["admin"] },
      { href: "/admin/lanzamiento",   label: "Lanzamiento",         emoji: "🚀", roles: ["admin"] },
    ],
  },
];

function isActive(href: string, pathname: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function NavLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-2.5 rounded-md text-sm transition-colors ${
        collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
      } ${
        active
          ? "bg-primary text-primary-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span className="shrink-0 leading-none">{item.emoji}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SectionBlock({ section, rol, esVendedor, pathname, collapsed, open, onToggle }: {
  section: NavSection; rol: Rol; esVendedor: boolean; pathname: string;
  collapsed: boolean; open: boolean; onToggle: () => void;
}) {
  const items = section.items.filter(
    (i) => i.roles.includes(rol) || (esVendedor && i.roles.includes("vendedor"))
  );
  if (!items.length) return null;
  const visible = open || collapsed;
  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground"
        >
          <span>{section.label}</span>
          <span className="text-[8px]">{open ? "▲" : "▼"}</span>
        </button>
      )}
      {visible && (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink item={item} collapsed={collapsed} active={isActive(item.href, pathname)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const INIT_SECTIONS = Object.fromEntries(SECTIONS.map((s) => [s.id, true]));

export function SideNav({ rol, esVendedor = false }: { rol: Rol; esVendedor?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed]     = useState(false);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(INIT_SECTIONS);

  useEffect(() => {
    try {
      const c = localStorage.getItem("nav-collapsed");
      if (c === "true") setCollapsed(true);
      const s = localStorage.getItem("nav-sections");
      if (s) setOpenSections(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("nav-collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem("nav-sections", JSON.stringify(openSections)); } catch {}
  }, [openSections]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const sections = (inDrawer = false) => (
    <div className={`overflow-y-auto flex-1 ${!inDrawer && collapsed ? "px-2 py-3" : "p-3"}`}>
      {SECTIONS.map((s) => (
        <SectionBlock
          key={s.id}
          section={s}
          rol={rol}
          esVendedor={esVendedor}
          pathname={pathname}
          collapsed={!inDrawer && collapsed}
          open={openSections[s.id] ?? true}
          onToggle={() => toggleSection(s.id)}
        />
      ))}
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className={`hidden md:flex flex-col shrink-0 border-r bg-card min-h-full transition-all duration-200 ${collapsed ? "w-14" : "w-52"}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="flex items-center justify-end px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-b shrink-0"
        >
          {collapsed ? "→" : "←"}
        </button>
        {sections(false)}
      </aside>

      {/* ── Mobile hamburger ──────────────────────────── */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Abrir menú"
        className="fixed top-3 left-3 z-50 md:hidden p-1.5 rounded-md bg-card border shadow-sm leading-none text-base"
      >
        ☰
      </button>

      {/* ── Mobile backdrop ───────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── Mobile drawer ─────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-xl flex flex-col md:hidden transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="font-bold">ECMatic</span>
          <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" className="text-muted-foreground hover:text-foreground leading-none">
            ✕
          </button>
        </div>
        {sections(true)}
      </aside>
    </>
  );
}
