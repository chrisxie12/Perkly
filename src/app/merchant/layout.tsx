import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";

export default function MerchantLayout({ children }: LayoutProps<"/merchant">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="merchant">{children}</AreaGuard>
    </Suspense>
  );
}
