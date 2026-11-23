import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { loginPath } from "@/lib/auth/paths";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { cancelDeletion, requestDeletion } from "@/features/account/actions";
import { deletionDueDate } from "@/features/account/deletion";
import { NameForm } from "@/features/account/components/name-form";
import { DarkModeSwitch } from "@/components/theme/theme-toggle";
import { SoundsSwitch } from "@/components/sound/sounds-switch";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  requested: "Request sent. Perqly support will review it and email you.",
  cancelled: "Deletion request cancelled.",
  failed: "Couldn't send the request. Try again.",
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const [ctx, query] = await Promise.all([getUserContext(), searchParams]);
  if (!ctx) redirect(loginPath("/account"));
  const supabase = await createClient();
  const { data: open } = await supabase.from("account_deletion_requests").select("id, created_at").eq("status", "open").maybeSingle();
  const message = typeof query.deletion === "string" ? MESSAGES[query.deletion] : undefined;

  return (
    <AreaShell area="account">
      <PageTitle title="Your account" description="Your name, your data, and leaving Perqly." />
      {message && (
        <div role="status" className="mb-6 rounded-xl bg-blue-50 p-4 font-medium text-ink-900 ring-1 ring-blue-200">
          {message}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardTitle className="mb-6">Your name</CardTitle>
            {ctx.isSuspended ? (
              <p className="text-ink-700">Your account is suspended, so it can&apos;t be changed. Contact Perqly support.</p>
            ) : (
              <NameForm fullName={ctx.fullName ?? ""} firstName={ctx.firstName ?? ""} />
            )}
          </Card>
          <Card>
            <CardTitle className="mb-4">Appearance</CardTitle>
            <DarkModeSwitch />
            <hr className="my-4 border-ink-200" />
            <SoundsSwitch />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>Your data</CardTitle>
            <CardDescription>
              Download everything Perqly holds about you as a JSON file: your profile, verification history, saved businesses, redemptions
              and notifications.
            </CardDescription>
            <a href="/account/export" className={`${buttonVariants({ variant: "secondary" })} mt-4`} download>
              <Download aria-hidden /> Download my data
            </a>
          </Card>
          <Card>
            <CardTitle>Delete your account</CardTitle>
            {open ? (
              <>
                <CardDescription>
                  You asked to delete your account on {formatDate(open.created_at)}. Perqly will delete it by{" "}
                  {formatDate(deletionDueDate(open.created_at).toISOString())} and email you when it&apos;s done.
                </CardDescription>
                <form action={cancelDeletion} className="mt-4">
                  <SubmitButton variant="secondary">Cancel the request</SubmitButton>
                </form>
              </>
            ) : (
              <>
                <CardDescription>
                  Within 30 days, Perqly deletes your profile, student record, chats, ratings and saved businesses. Records of discounts you
                  used are kept without your name, because businesses rely on them.{" "}
                  <Link href="/delete-account" className="font-semibold text-blue-700 underline underline-offset-2">
                    How deletion works
                  </Link>
                </CardDescription>
                <form action={requestDeletion} className="mt-4 space-y-3">
                  <div>
                    <Label htmlFor="note">Anything we should know? (optional)</Label>
                    <Textarea id="note" name="note" maxLength={500} />
                  </div>
                  <SubmitButton variant="secondary">Ask to delete my account</SubmitButton>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
    </AreaShell>
  );
}
