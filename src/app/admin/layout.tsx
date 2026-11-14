import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="admin">{children}</AreaGuard>
    </Suspense>
  );
}
