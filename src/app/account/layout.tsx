import { Suspense } from "react";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaFrame area="account">{children}</AreaFrame>
    </Suspense>
  );
}
