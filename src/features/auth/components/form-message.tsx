import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FormState } from "../types";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const success = state.status === "success";
  return (
    <p
      role={success ? "status" : "alert"}
      className={
        success
          ? "flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success"
          : "flex items-start gap-2 rounded-lg bg-orange-50 px-4 py-3 text-sm font-medium text-ink-900 ring-1 ring-orange-200"
      }
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
      )}
      {state.message}
    </p>
  );
}
