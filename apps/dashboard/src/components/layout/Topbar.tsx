import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth.js";
import { useTheme, type ThemeMode } from "../../lib/theme.js";
import { useTenant } from "../../api/tenants.js";
import { Button } from "../ui/index.js";

const MODE_ORDER: ThemeMode[] = ["light", "dark", "system"];
const MODE_ICON: Record<ThemeMode, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };
const MODE_LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const Icon = MODE_ICON[mode];

  function cycle() {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]!;
    setMode(next);
  }

  return (
    <Button variant="ghost" onClick={cycle} title={`Theme: ${MODE_LABEL[mode]} (click to change)`}>
      <Icon size={16} />
    </Button>
  );
}

export function Topbar() {
  const { logout, role } = useAuth();
  const { data: tenant } = useTenant();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div className="text-sm">
        {tenant && <span className="font-medium text-ink">{tenant.name}</span>}
        {role && <span className="ml-2 text-xs uppercase tracking-wide text-ink-muted">{role}</span>}
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" onClick={logout}>
          <LogOut size={16} />
          Log out
        </Button>
      </div>
    </header>
  );
}
