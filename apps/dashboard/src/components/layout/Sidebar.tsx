import { useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CONFIGURATION_NAV_ITEMS, MONITORING_NAV_ITEMS, type NavItem } from "./navItems.js";

const COLLAPSED_STORAGE_KEY = "airlock.sidebarCollapsed";

function getStoredCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
}

function NavSection({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div>
      {!collapsed && (
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      )}
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center",
                isActive ? "bg-brand/10 text-brand" : "text-ink-secondary hover:bg-page hover:text-ink",
              )
            }
          >
            <Icon size={16} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  }

  return (
    <aside
      className={clsx(
        "flex shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={clsx("flex items-center gap-2 px-2 py-1", collapsed && "justify-center px-0")}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
          A
        </div>
        {!collapsed && <span className="text-base font-semibold text-ink">Airlock</span>}
      </div>
      <NavSection title="Monitoring" items={MONITORING_NAV_ITEMS} collapsed={collapsed} />
      <NavSection title="Configuration" items={CONFIGURATION_NAV_ITEMS} collapsed={collapsed} />
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={clsx(
          "mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-page hover:text-ink",
          collapsed && "justify-center",
        )}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
