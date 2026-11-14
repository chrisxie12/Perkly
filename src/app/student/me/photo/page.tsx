import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { getMyPassPhotoPath, signPassPhoto } from "@/features/pass-photo/server";
import { PassPhotoUploader } from "@/features/pass-photo/uploader";

export const metadata: Metadata = { title: "Pass photo", robots: { index: false } };

export default async function PassPhotoPage() {
  const [ctx, path] = await Promise.all([getUserContext(), getMyPassPhotoPath()]);
  const url = await signPassPhoto(path, 120);
  const name = ctx?.firstName ?? ctx?.fullName ?? "";
  return (
    <AreaShell area="student">
      <Link href="/student/me" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Me
      </Link>
      <h1 className="font-display text-[1.625rem] leading-tight font-bold">Photo for your pass</h1>
      <p className="mt-2 max-w-prose text-ink-700">
        The cashier compares this photo with you before confirming a discount, so nobody else can use your pass. Use a clear photo of your
        face, like on your student ID.
      </p>
      <div className="my-6 flex justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
          <img
            src={url}
            alt="Your pass photo"
            className="size-40 rounded-full object-cover ring-4 ring-white outline-2 outline-offset-4 outline-emerald-600"
          />
        ) : (
          <span className="grid size-40 place-items-center rounded-full bg-ink-900 font-display text-5xl font-bold text-white" aria-hidden>
            {name.slice(0, 1).toUpperCase() || "?"}
          </span>
        )}
      </div>
      {ctx && <PassPhotoUploader userId={ctx.userId} hasPhoto={Boolean(url)} />}
      <p className="mt-4 text-sm text-ink-600">
        Who sees it: you, and the staff of a shop only while your pass is live at their counter. It isn&apos;t shared with your school or
        used for anything else. Remove it any time.
      </p>
    </AreaShell>
  );
}
