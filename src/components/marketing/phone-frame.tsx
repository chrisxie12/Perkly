import * as React from "react";
import { cn } from "@/lib/utils";

/** A CSS phone. The screen content is real HTML, not a screenshot. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-[18.5rem] rounded-[3rem] bg-ink-900 p-2.5 shadow-phone sm:w-[20rem]", className)} aria-hidden={false}>
      <div className="relative overflow-hidden rounded-[2.5rem] bg-paper">
        <div className="flex h-9 items-center justify-between px-7 pt-1 text-[0.6875rem] font-semibold text-ink-900">
          <span>9:41</span>
          <span className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-ink-900" aria-hidden />
          <span className="flex items-center gap-1" aria-hidden>
            <span className="h-2.5 w-4 rounded-[3px] border border-ink-900" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
