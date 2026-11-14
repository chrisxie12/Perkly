import Link from "next/link";
import { Lock, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { LoadingIndicator } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "./sign-out-button";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo />
      {children}
    </main>
  );
}

export function AreaLoading() {
  return (
    <Frame>
      <LoadingIndicator className="mt-10" label="Checking your account" />
    </Frame>
  );
}

export function NoAccess({ areaLabel }: { areaLabel: string }) {
  return (
    <Frame>
      <div className="mt-10 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        <Lock className="size-8" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-display-md font-extrabold">You don&apos;t have access to this area.</h1>
      <p className="mt-3 max-w-sm text-lg text-ink-600">
        The {areaLabel.toLowerCase()} area is only for accounts that have been given that role.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/auth/continue">Go to my area</Link>
        </Button>
        <SignOutButton />
      </div>
    </Frame>
  );
}

export function AccountSuspended() {
  return (
    <Frame>
      <div className="mt-10 grid size-16 place-items-center rounded-2xl bg-orange-500 text-ink-900">
        <ShieldAlert className="size-8" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-display-md font-extrabold">Your account is suspended.</h1>
      <p className="mt-3 max-w-sm text-lg text-ink-600">
        You can&apos;t use Perqly while it&apos;s suspended. Contact Perqly support to find out why.
      </p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </Frame>
  );
}
