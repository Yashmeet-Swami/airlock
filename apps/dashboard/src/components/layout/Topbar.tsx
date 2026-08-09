import { LogOut } from "lucide-react";
import { useAuth } from "../../lib/auth.js";
import { useTenant } from "../../api/tenants.js";
import { Button } from "../ui/index.js";

export function Topbar() {
  const { logout, role } = useAuth();
  const { data: tenant } = useTenant();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div className="text-sm">
        {tenant && <span className="font-medium text-ink">{tenant.name}</span>}
        {role && <span className="ml-2 text-xs uppercase tracking-wide text-ink-muted">{role}</span>}
      </div>
      <Button variant="ghost" onClick={logout}>
        <LogOut size={16} />
        Log out
      </Button>
    </header>
  );
}
