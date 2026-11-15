import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";
import { AreaFrame } from "@/components/layout/area-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="student">
        <AreaFrame area="student">{children}</AreaFrame>
      </AreaGuard>
    </Suspense>
  );
}
