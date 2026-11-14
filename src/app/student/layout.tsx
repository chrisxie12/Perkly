import { Suspense } from "react";
import { AreaGuard } from "@/components/auth/area-guard";
import { AreaLoading } from "@/components/auth/area-states";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <Suspense fallback={<AreaLoading />}>
      <AreaGuard area="student">{children}</AreaGuard>
    </Suspense>
  );
}
