import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
}

export function Input({ className, invalid, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid || undefined}
      className={cn(
        "h-12 w-full rounded-md border border-ink-300 bg-white px-4 text-base text-ink-900 transition-colors placeholder:text-ink-500",
        "hover:border-ink-400 focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:bg-ink-100 disabled:opacity-70",
        "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("mb-2 block text-sm font-semibold text-ink-900", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-2 text-sm text-ink-600", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p role="alert" className={cn("mt-2 text-sm font-medium text-danger", className)} {...props} />;
}
