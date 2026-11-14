import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** An empty screen is an invitation to act: say what goes here and what to do. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border-2 border-dashed border-ink-200 bg-white px-6 py-14 text-center",
        className,
      )}
    >
      {icon && <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 [&_svg]:size-7">{icon}</div>}
      <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-ink-600">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Errors say what went wrong and how to fix it. They don't apologise. */
export function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center rounded-xl bg-orange-50 px-6 py-14 text-center ring-1 ring-orange-200", className)}
    >
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-orange-500 text-ink-900">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-ink-700">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingIndicator({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("inline-flex items-center gap-3 text-ink-600", className)}>
      <Loader2 className="size-5 animate-spin text-blue-500" aria-hidden />
      <span className="text-sm font-medium">{label}…</span>
    </div>
  );
}
