import { Suspense } from "react";
import { LoadingIndicator } from "@/components/shared/states";

/** Shared deal pages load per request (the deal may have ended), so they stream in. */
export default function SharedDealLayout({ children }: LayoutProps<"/d/[id]">) {
  return <Suspense fallback={<LoadingIndicator />}>{children}</Suspense>;
}
