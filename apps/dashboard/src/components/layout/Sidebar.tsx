import { NavLink } from "react-router-dom";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Route as RouteIcon,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  Webhook,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MONITORING: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/logs", label: "Log Explorer", icon: Search },
  { to: "/live", label: "Live Traffic", icon: Activity },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
];

const CONFIGURATION: NavItem[] = [
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/rate-limits", label: "Rate Limits", icon: Gauge },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-brand/10 text-brand" : "text-ink-secondary hover:bg-page hover:text-ink",
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
          A
        </div>
        <span className="text-base font-semibold text-ink">Airlock</span>
      </div>
      <NavSection title="Monitoring" items={MONITORING} />
      <NavSection title="Configuration" items={CONFIGURATION} />
    </aside>
  );
}
