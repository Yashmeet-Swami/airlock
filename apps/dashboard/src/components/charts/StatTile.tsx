import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Card } from "../ui/Card.js";

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "default" | "critical";
}) {
  return (
    <Card className="flex items-center gap-4">
      {Icon && (
        <div
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-linear-to-br",
            tone === "critical"
              ? "from-status-critical/20 to-transparent text-status-critical"
              : "from-brand/20 to-transparent text-brand",
          )}
        >
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="tabular-nums mt-1 text-2xl font-semibold text-ink">{value}</p>
      </div>
    </Card>
  );
}
