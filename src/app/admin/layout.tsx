import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="admin">
        <AreaFrame area="admin">{children}</AreaFrame>
      </AreaGuard>
    </Suspense>
  );
}
