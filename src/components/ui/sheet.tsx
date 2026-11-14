"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** Full-height panel built on Radix Dialog (focus trap, Esc to close). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50" />
      <DialogPrimitive.Content
        className={cn(
          "pt-safe fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-blue-500 text-white shadow-lift outline-none",
          "data-[state=open]:animate-[sheet-in_320ms_var(--ease-out-quint)]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
