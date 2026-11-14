import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        blue: "bg-blue-50 text-blue-700",
        orange: "bg-orange-100 text-orange-800",
        ink: "bg-ink-900 text-white",
        outline: "text-ink-700 ring-1 ring-ink-300 ring-inset",
        success: "bg-green-50 text-success",
        example: "bg-white/90 text-ink-700 ring-1 ring-ink-300 ring-inset",
      },
    },
    defaultVariants: { variant: "blue" },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
