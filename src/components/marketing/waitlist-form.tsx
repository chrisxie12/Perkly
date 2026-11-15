"use client";

import { useActionState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { joinWaitlist } from "@/features/waitlist/actions";
import { idleState } from "@/features/auth/types";
import { cn } from "@/lib/utils";

export function WaitlistForm({ source, inverse = false }: { source: "hero" | "final"; inverse?: boolean }) {
  const [state, action, pending] = useActionState(joinWaitlist, idleState);
  const id = `waitlist-${source}`;
  const error = state.fieldErrors?.email ?? (state.status === "error" ? state.message : undefined);

  if (state.status === "success")
    return (
      <p role="status" className={cn("flex items-start gap-2 text-[0.9375rem] font-semibold", inverse ? "text-white" : "text-emerald-800")}>
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );

  return (
    <form action={action} noValidate className="w-full max-w-md">
      <input type="hidden" name="source" value={source} />
      {/* Honeypot, hidden from people and screen readers */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label htmlFor={id} className={cn("mb-2 block text-[0.9375rem] font-semibold", inverse ? "text-white" : "text-ink-900")}>
        Get notified when GCTU sign-up opens
      </label>
      <div className="flex flex-col gap-2 min-[420px]:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@gmail.com"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 w-full min-w-0 rounded-full bg-white px-5 text-base text-ink-900 ring-1 ring-ink-300 outline-none ring-inset placeholder:text-ink-500 focus-visible:ring-2 focus-visible:ring-blue-500 min-[420px]:flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold disabled:opacity-60",
            inverse ? "bg-white text-blue-700 hover:bg-blue-50" : "bg-ink-900 text-white hover:bg-ink-800",
          )}
        >
          <BellRing className="size-4" aria-hidden />
          {pending ? "Adding…" : "Notify me"}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className={cn("mt-2 text-sm font-medium", inverse ? "text-white" : "text-red-700")}>
          {error}
        </p>
      ) : (
        <p className={cn("mt-2 text-sm", inverse ? "text-white/85" : "text-ink-600")}>One email when sign-up opens. Nothing else.</p>
      )}
    </form>
  );
}
