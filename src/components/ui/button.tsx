import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 ease-out select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // White on blue-500 ≈ 4.8:1
        primary: "bg-blue-500 text-white shadow-soft hover:bg-blue-600",
        // Ink text on orange: white would fail contrast
        accent: "bg-orange-500 text-ink-900 shadow-soft hover:bg-orange-400",
        secondary: "bg-white text-ink-900 ring-1 ring-ink-200 ring-inset hover:bg-ink-100",
        ghost: "text-ink-900 hover:bg-ink-100",
        inverse: "bg-white text-blue-700 hover:bg-blue-50",
        "outline-inverse": "text-white ring-1 ring-white/40 ring-inset hover:bg-white/10",
        link: "rounded-none px-0 text-blue-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.9375rem]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
