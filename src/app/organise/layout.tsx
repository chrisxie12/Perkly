import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function OrganiseLayout({ children }: LayoutProps<"/organise">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="organise">
        <AreaFrame area="organise">{children}</AreaFrame>
      </AreaGuard>
    </Suspense>
  );
}
