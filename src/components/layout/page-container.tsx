import * as React from "react";
import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10", className)} {...props} />;
}

export function SectionHeading({
  title,
  intro,
  className,
  inverse = false,
  id,
}: {
  title: React.ReactNode;
  intro?: React.ReactNode;
  className?: string;
  inverse?: boolean;
  id?: string;
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <h2 id={id} className={cn("font-display text-display-lg font-extrabold", inverse ? "text-white" : "text-ink-900")}>
        {title}
      </h2>
      {intro && <p className={cn("mt-5 max-w-2xl text-lg leading-relaxed md:text-xl", inverse ? "text-white" : "text-ink-600")}>{intro}</p>}
    </div>
  );
}
