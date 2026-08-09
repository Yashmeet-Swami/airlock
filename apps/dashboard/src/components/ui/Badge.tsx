import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

export type StatusTone = "good" | "warning" | "serious" | "critical" | "neutral";

// Status colors never carry meaning alone — every badge pairs the color with
// both an icon and a text label (dataviz skill non-negotiable).
const TONE_CLASSES: Record<StatusTone, string> = {
  good: "bg-status-good/10 text-status-good",
  warning: "bg-status-warning/15 text-[#8a6200]",
  serious: "bg-status-serious/15 text-[#9c3d1d]",
  critical: "bg-status-critical/10 text-status-critical",
  neutral: "bg-ink-muted/10 text-ink-secondary",
};

const TONE_ICON: Record<StatusTone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: AlertTriangle,
  critical: XCircle,
  neutral: Circle,
};

export function Badge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
      )}
    >
      <Icon size={12} />
      {children}
    </span>
  );
}
