import { useEffect, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, XCircle } from "lucide-react";
import { getToasts, subscribeToasts, type ToastMessage } from "./toast.js";

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>(getToasts());

  useEffect(() => subscribeToasts(() => setToasts(getToasts())), []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-lg",
            t.tone === "success" ? "bg-status-good" : "bg-status-critical",
          )}
        >
          {t.tone === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
