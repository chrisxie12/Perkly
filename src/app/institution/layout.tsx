import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";

export default function InstitutionLayout({ children }: LayoutProps<"/institution">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="institution">{children}</AreaGuard>
    </Suspense>
  );
}
