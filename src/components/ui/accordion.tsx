"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn("border-b border-ink-200", className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 items-center justify-between gap-6 py-6 text-left font-display text-lg font-semibold tracking-tight text-ink-900 transition-colors hover:text-blue-600 md:text-xl",
          className,
        )}
        {...props}
      >
        {children}
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-900 transition-[transform,background-color] duration-300 group-hover:bg-blue-50 group-data-[state=open]:rotate-45 group-data-[state=open]:bg-blue-500 group-data-[state=open]:text-white">
          <Plus className="size-5" aria-hidden />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden data-[state=closed]:animate-[accordion-up_220ms_ease-out] data-[state=open]:animate-[accordion-down_260ms_var(--ease-out-quint)]"
      {...props}
    >
      <div className={cn("max-w-2xl pr-12 pb-6 text-base leading-relaxed text-ink-600", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
