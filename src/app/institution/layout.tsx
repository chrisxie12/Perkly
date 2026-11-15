import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function InstitutionLayout({ children }: LayoutProps<"/institution">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="institution">
        <AreaFrame area="institution">{children}</AreaFrame>
      </AreaGuard>
    </Suspense>
  );
}
