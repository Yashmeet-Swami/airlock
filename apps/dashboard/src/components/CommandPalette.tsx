import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { CONFIGURATION_NAV_ITEMS, MONITORING_NAV_ITEMS } from "./layout/navItems.js";
import { getCommandPaletteOpen, setCommandPaletteOpen, subscribeCommandPalette, toggleCommandPalette } from "../lib/commandPaletteStore.js";

const GROUP_HEADING_CLASSES =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-muted";

const ITEM_CLASSES =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink data-[selected=true]:bg-brand/10 data-[selected=true]:text-brand";

// Navigation-only for this pass (see the plan's scope decision) — wiring
// "create route"/etc. as inline actions would need each page's create-modal
// state lifted to a global level, which is a bigger change for a first cut.
export function CommandPalette() {
  const [open, setOpen] = useState(getCommandPaletteOpen);
  const navigate = useNavigate();

  useEffect(() => subscribeCommandPalette(() => setOpen(getCommandPaletteOpen())), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleCommandPalette();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function go(to: string) {
    navigate(to);
    setCommandPaletteOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <Command
        label="Command menu"
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Jump to a page..."
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-ink-muted">No results found.</Command.Empty>
          <Command.Group heading="Monitoring" className={GROUP_HEADING_CLASSES}>
            {MONITORING_NAV_ITEMS.map((item) => (
              <Command.Item key={item.to} value={item.label} onSelect={() => go(item.to)} className={ITEM_CLASSES}>
                <item.icon size={16} />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Configuration" className={GROUP_HEADING_CLASSES}>
            {CONFIGURATION_NAV_ITEMS.map((item) => (
              <Command.Item key={item.to} value={item.label} onSelect={() => go(item.to)} className={ITEM_CLASSES}>
                <item.icon size={16} />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
