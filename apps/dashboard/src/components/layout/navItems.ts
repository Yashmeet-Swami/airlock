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

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Single source of truth for every destination in the app — Sidebar and the
// command palette both read from here so they can't drift out of sync.
export const MONITORING_NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/logs", label: "Log Explorer", icon: Search },
  { to: "/live", label: "Live Traffic", icon: Activity },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
];

export const CONFIGURATION_NAV_ITEMS: NavItem[] = [
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/rate-limits", label: "Rate Limits", icon: Gauge },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];
