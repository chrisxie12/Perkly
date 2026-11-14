import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, CircleAlert } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { enterShortCode } from "@/features/redemptions/actions";
import { redemptionErrorMessage } from "@/features/redemptions/schemas";
import { ShortCodeInput } from "@/features/redemptions/components/short-code-input";

export const metadata: Metadata = { title: "Type the shop code", robots: { index: false } };

export default async function ShopCodePage({ searchParams }: PageProps<"/student/scan/code">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const message =
    error === "code_format" ? "Codes are 8 letters and numbers, printed under the QR." : error ? redemptionErrorMessage(error) : null;
  return (
    <AreaShell area="student" immersive>
      <div className="pt-safe flex min-h-dvh flex-col bg-paper">
        <div className="flex items-center gap-1 px-2 py-1">
          <Link
            href="/student/scan"
            aria-label="Back to the scanner"
            className="grid size-11 place-items-center rounded-full hover:bg-ink-100"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <h1 className="font-display text-lg font-bold">Type the shop code</h1>
        </div>
        <form action={enterShortCode} className="pb-safe flex flex-1 flex-col gap-4 px-5 pt-2 pb-5">
          <h2 className="font-display text-[1.625rem] leading-tight font-bold tracking-tight">Camera not working? No problem.</h2>
          <p className="text-ink-700">Every Perqly QR has an 8-character code printed under it, like 7K3M-9Q2D.</p>
          <label htmlFor="code" className="sr-only">
            Shop code
          </label>
          <ShortCodeInput invalid={Boolean(message)} />
          <div aria-live="polite">
            {message && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <CircleAlert className="size-4" aria-hidden /> {message}
              </p>
            )}
          </div>
          <div className="mt-auto">
            <SubmitButton size="lg" className="w-full">
              Find the shop
            </SubmitButton>
          </div>
        </form>
      </div>
    </AreaShell>
  );
}
