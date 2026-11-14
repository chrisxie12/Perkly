import { getUserContext } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

/** Signed-in name and sign-out, for area headers. Render inside a Suspense boundary. */
export async function AccountBar() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm font-medium text-ink-700 sm:inline">{ctx.firstName ?? "Signed in"}</span>
      <SignOutButton />
    </div>
  );
}
