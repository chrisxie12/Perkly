import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function MerchantLayout({ children }: LayoutProps<"/merchant">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="merchant">
        <AreaFrame area="merchant">{children}</AreaFrame>
      </AreaGuard>
    </Suspense>
  );
}
