import { Suspense } from "react";
import { AreaLoading } from "@/components/auth/area-states";

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <Suspense fallback={<AreaLoading />}>{children}</Suspense>;
}
